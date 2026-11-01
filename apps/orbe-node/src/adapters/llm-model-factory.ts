import { isDeepStrictEqual } from 'node:util';
import { ChatOpenAI, convertMessagesToCompletionsMessageParams } from '@langchain/openai';
import { AIMessage, ChatMessage, type BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { assertLlmPrivacyEnvironment } from '../../../../packages/shared-config/src/index.js';
import {
  LLM_FALLBACK_PROVIDER_IDS,
  type LlmFallbackProviderConfig,
  type LlmFallbackProviderId,
} from '../../../../packages/shared-config/src/llm-fallback.js';
import { AppError } from '../domain/errors.js';

export const LLM_PROVIDER_METADATA_KEY = 'phasscode_llm_provider';
export const LLM_FALLBACK_BASE_URLS: Readonly<Record<LlmFallbackProviderId, string>> =
  Object.freeze({
    openrouter: 'https://openrouter.ai/api/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    groq: 'https://api.groq.com/openai/v1',
    cohere: 'https://api.cohere.ai/compatibility/v1',
  });

export interface BoundModelPort {
  invoke(messages: BaseMessage[], options: { signal: AbortSignal }): Promise<AIMessage>;
  contextCharacters?(messages: BaseMessage[]): number;
}
export interface FallbackModelFactoryConfig {
  providers: readonly Pick<LlmFallbackProviderConfig, 'id' | 'apiKey' | 'model' | 'timeoutMs'>[];
  maxOutputTokens: number;
  openRouterReasoningEnabled?: boolean;
}
const rawCallSchema = z.looseObject({
  id: z.string().min(1),
  type: z.literal('function'),
  function: z.looseObject({ name: z.string().min(1), arguments: z.string() }),
});
const rawCallsSchema = z.array(rawCallSchema);
type RawCall = z.infer<typeof rawCallSchema>;
interface NormalizedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
const importedSignature = 'skip_thought_signature_validator';
const invalidTranscript = () =>
  new AppError(
    'LLM_INVALID_TOOL',
    502,
    'O assistente retornou um histórico de ferramentas inválido.',
  );

function isAssistant(message: BaseMessage): boolean {
  return (
    AIMessage.isInstance(message) ||
    (ChatMessage.isInstance(message) && message.role === 'assistant')
  );
}
function callsFrom(message: BaseMessage): { normalized: NormalizedCall[]; raw?: RawCall[] } {
  const incoming = message.additional_kwargs.tool_calls;
  const parsed = incoming == null ? undefined : rawCallsSchema.safeParse(incoming);
  if (parsed && !parsed.success) throw invalidTranscript();
  const raw = parsed?.success ? parsed.data : undefined;
  const normalized: NormalizedCall[] = [];
  if (AIMessage.isInstance(message)) {
    for (const call of message.tool_calls ?? []) {
      if (!call.id || !call.args || typeof call.args !== 'object' || Array.isArray(call.args))
        throw invalidTranscript();
      normalized.push({ id: call.id, name: call.name, args: call.args });
    }
  } else {
    for (const call of raw ?? []) {
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        throw invalidTranscript();
      }
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw invalidTranscript();
      normalized.push({
        id: call.id,
        name: call.function.name,
        args: args as Record<string, unknown>,
      });
    }
  }
  if (raw) {
    if (raw.length !== normalized.length) throw invalidTranscript();
    for (let index = 0; index < raw.length; index++) {
      const item = raw[index]!;
      const expected = normalized[index]!;
      let args: unknown;
      try {
        args = JSON.parse(item.function.arguments);
      } catch {
        throw invalidTranscript();
      }
      if (
        item.id !== expected.id ||
        item.function.name !== expected.name ||
        !isDeepStrictEqual(args, expected.args)
      )
        throw invalidTranscript();
    }
  }
  return { normalized, ...(raw ? { raw } : {}) };
}
function signatureOf(call: RawCall): string | undefined {
  const extra = call.extra_content;
  if (!extra || typeof extra !== 'object' || !('google' in extra)) return undefined;
  const google = extra.google;
  if (!google || typeof google !== 'object' || !('thought_signature' in google)) return undefined;
  return typeof google.thought_signature === 'string' ? google.thought_signature : undefined;
}
function replayFor(
  provider: LlmFallbackProviderId,
  model: string,
  messages: BaseMessage[],
): BaseMessage[] {
  return messages.map((message) => {
    if (!isAssistant(message)) return message;
    const { normalized, raw } = callsFrom(message);
    if (!normalized.length) return message;
    if (provider !== 'gemini') {
      // AIMessage uses the standard normalized tool calls. Normalize an explicitly
      // supplied raw ChatMessage too, so another vendor's metadata does not leak.
      if (AIMessage.isInstance(message)) return message;
      return new AIMessage({ content: message.content, tool_calls: normalized });
    }
    const origin = message.response_metadata[LLM_PROVIDER_METADATA_KEY];
    let replay: RawCall[];
    if (origin === 'gemini') {
      if (!raw) throw invalidTranscript();
      // Gemini 3+ validates the first call's signature; parallel calls following
      // it may have no signature. Gemini 2.5 signatures are optional but retained.
      if (/^gemini-(?:[3-9]|[1-9][0-9])(?:[.-]|$)/i.test(model)) {
        const signature = signatureOf(raw[0]!);
        if (
          !signature ||
          signature === importedSignature ||
          signature === 'context_engineering_is_the_way_to_go'
        )
          throw invalidTranscript();
      }
      replay = raw;
    } else {
      // Google's documented exception is only for a trace imported from another
      // model. Unknown provenance and missing signatures on own traces fail shut.
      if (
        typeof origin !== 'string' ||
        !LLM_FALLBACK_PROVIDER_IDS.includes(origin as LlmFallbackProviderId)
      )
        throw invalidTranscript();
      replay = normalized.map((call, index) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.args) },
        ...(index === 0
          ? { extra_content: { google: { thought_signature: importedSignature } } }
          : {}),
      }));
    }
    // Public ChatMessage makes ChatOpenAI replay raw calls instead of rebuilding
    // them from AIMessage.tool_calls and dropping Google's opaque extra_content.
    // The original message remains intact for tool validation/execution upstream.
    return new ChatMessage({
      role: 'assistant',
      content: message.content,
      additional_kwargs: { tool_calls: replay },
    });
  });
}
function testEndpoint(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Overrides de transporte LLM permitem somente endpoints loopback de teste.');
  return url.href;
}

export function createFallbackModelFactory(
  config: FallbackModelFactoryConfig,
  testBaseUrls: Partial<Record<LlmFallbackProviderId, string>> = {},
) {
  assertLlmPrivacyEnvironment(process.env);
  const models = new Map<LlmFallbackProviderId, { model: ChatOpenAI; modelId: string }>();
  for (const provider of config.providers) {
    if (models.has(provider.id)) throw new Error('O provedor LLM foi configurado mais de uma vez.');
    const baseURL = testBaseUrls[provider.id]
      ? testEndpoint(testBaseUrls[provider.id]!)
      : LLM_FALLBACK_BASE_URLS[provider.id];
    const model = new ChatOpenAI({
      model: provider.model,
      apiKey: provider.apiKey,
      configuration: { baseURL },
      useResponsesApi: false,
      maxRetries: 0,
      verbose: false,
      streaming: false,
      disableStreaming: true,
      timeout: provider.timeoutMs,
      ...(config.maxOutputTokens > 0 ? { maxTokens: config.maxOutputTokens } : {}),
      modelKwargs: {
        // ChatOpenAI defaults to n=1; Cohere rejects n even when it equals one.
        n: undefined,
        ...(provider.id === 'openrouter' ? { store: false } : {}),
        ...(provider.id === 'openrouter' && config.openRouterReasoningEnabled !== undefined
          ? { reasoning: { enabled: config.openRouterReasoningEnabled } }
          : {}),
      },
    });
    models.set(provider.id, { model, modelId: provider.model });
  }
  return {
    bindTools(tools: StructuredToolInterface[]): Map<LlmFallbackProviderId, BoundModelPort> {
      const bound = new Map<LlmFallbackProviderId, BoundModelPort>();
      for (const [id, { model, modelId }] of models) {
        const runnable = model.bindTools(
          tools,
          id === 'openrouter' || id === 'cohere' ? { strict: true } : {},
        );
        bound.set(id, {
          contextCharacters(messages) {
            return JSON.stringify(
              convertMessagesToCompletionsMessageParams({
                messages: replayFor(id, modelId, messages),
                model: modelId,
              }),
            ).length;
          },
          async invoke(messages, { signal }) {
            signal.throwIfAborted();
            const response = await runnable.invoke(replayFor(id, modelId, messages), { signal });
            signal.throwIfAborted();
            response.response_metadata = {
              ...response.response_metadata,
              [LLM_PROVIDER_METADATA_KEY]: id,
            };
            if (id === 'gemini') replayFor(id, modelId, [response]);
            return response;
          },
        });
      }
      return bound;
    },
  };
}
