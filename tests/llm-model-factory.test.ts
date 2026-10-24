import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AIMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFallbackModelFactory,
  LLM_FALLBACK_BASE_URLS,
  LLM_PROVIDER_METADATA_KEY,
  type BoundModelPort,
  type FallbackModelFactoryConfig,
} from '../apps/orbe-node/src/adapters/llm-model-factory.js';
import {
  LLM_FALLBACK_PROVIDER_IDS,
  type LlmFallbackProviderId,
} from '../packages/shared-config/src/llm-fallback.js';

interface WireCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  extra_content?: { google: { thought_signature: string } };
}
interface WireMessage {
  role: string;
  content: unknown;
  tool_calls?: WireCall[];
  tool_call_id?: string;
}
interface WireRequest {
  model: string;
  messages: WireMessage[];
  tools: { type: string; function: Record<string, unknown> }[];
  [key: string]: unknown;
}
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
const search = tool(({ query }) => `Synthetic result for ${query}`, {
  name: 'search_portfolio',
  description: 'Read public synthetic facts.',
  schema: z.strictObject({ query: z.string() }),
});
const transcript = (): BaseMessage[] => [
  new SystemMessage('Preserve this prompt.'),
  new HumanMessage('Public projects?'),
];
const completion = (message: object) => ({
  id: 'chatcmpl-synthetic',
  object: 'chat.completion',
  created: 1,
  model: 'synthetic',
  choices: [{ index: 0, message, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const final = () =>
  completion({ role: 'assistant', content: 'Synthetic public answer.', tool_calls: null });
function call(id: string, signature?: string): WireCall {
  return {
    id,
    type: 'function',
    function: { name: 'search_portfolio', arguments: '{ "query": "portfolio" }' },
    ...(signature ? { extra_content: { google: { thought_signature: signature } } } : {}),
  };
}
const candidates = (): FallbackModelFactoryConfig['providers'] =>
  LLM_FALLBACK_PROVIDER_IDS.map((id) => ({
    id,
    apiKey: `synthetic-${id}`,
    model: id === 'gemini' ? 'gemini-3-flash-synthetic' : `synthetic-${id}`,
    timeoutMs: 1000,
  }));
async function transport(
  respond: (provider: LlmFallbackProviderId, round: number) => { status?: number; body: object },
) {
  const requests: { provider: LlmFallbackProviderId; path: string; body: WireRequest }[] = [];
  const rounds = new Map<LlmFallbackProviderId, number>();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const provider = request.url!.split('/')[1] as LlmFallbackProviderId;
    const round = (rounds.get(provider) ?? 0) + 1;
    rounds.set(provider, round);
    requests.push({
      provider,
      path: request.url!,
      body: JSON.parse(Buffer.concat(chunks).toString()) as WireRequest,
    });
    const result = respond(provider, round);
    response.writeHead(result.status ?? 200, {
      'Content-Type': 'application/json',
      'Retry-After': '3',
    });
    response.end(JSON.stringify(result.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const baseUrls = Object.fromEntries(
    LLM_FALLBACK_PROVIDER_IDS.map((id) => [id, `${origin}/${id}`]),
  ) as Record<LlmFallbackProviderId, string>;
  return { requests, baseUrls };
}
function requireModel(
  models: Map<LlmFallbackProviderId, BoundModelPort>,
  id: LlmFallbackProviderId,
) {
  const model = models.get(id);
  if (!model) throw new Error('Synthetic provider missing.');
  return model;
}
const options = () => ({ signal: new AbortController().signal });

describe('fixed compatible transports', () => {
  it('uses only fixed production URLs and rejects external/credential-bearing test overrides', () => {
    expect(LLM_FALLBACK_BASE_URLS).toEqual({
      openrouter: 'https://openrouter.ai/api/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      groq: 'https://api.groq.com/openai/v1',
      cohere: 'https://api.cohere.ai/compatibility/v1',
    });
    for (const endpoint of [
      'https://attacker.example/v1',
      'http://127.0.0.1:1234/v1?key=synthetic',
      'http://user:password@127.0.0.1:1234/v1',
      'file:///synthetic',
    ])
      expect(() =>
        createFallbackModelFactory(
          { providers: candidates(), maxOutputTokens: 200 },
          { gemini: endpoint },
        ),
      ).toThrow('loopback');
  });
  it('configures each provider without unsupported store/n/parallel fields and tags its origin', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 222, openRouterReasoningEnabled: false },
      stub.baseUrls,
    ).bindTools([search]);
    for (const id of LLM_FALLBACK_PROVIDER_IDS) {
      const response = await requireModel(models, id).invoke(transcript(), options());
      expect(response.content).toBe('Synthetic public answer.');
      expect(response.response_metadata[LLM_PROVIDER_METADATA_KEY]).toBe(id);
    }
    expect(stub.requests).toHaveLength(4);
    for (const { provider, path, body } of stub.requests) {
      expect(path).toBe(`/${provider}/chat/completions`);
      expect(body.model).toBe(candidates().find((candidate) => candidate.id === provider)!.model);
      expect(body.messages).toEqual([
        { role: 'system', content: 'Preserve this prompt.' },
        { role: 'user', content: 'Public projects?' },
      ]);
      expect(body.tools[0]?.function.name).toBe('search_portfolio');
      expect(body.tools[0]?.function.parameters).toMatchObject({
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      });
      expect(body.stream).toBe(false);
      expect(body.max_tokens).toBe(222);
      expect(body).not.toHaveProperty('n');
      expect(body).not.toHaveProperty('parallel_tool_calls');
      expect(body).not.toHaveProperty('response_format');
      if (provider === 'openrouter') {
        expect(body.store).toBe(false);
        expect(body.reasoning).toEqual({ enabled: false });
      } else {
        expect(body).not.toHaveProperty('store');
        expect(body).not.toHaveProperty('reasoning');
      }
      if (provider === 'openrouter' || provider === 'cohere')
        expect(body.tools[0]?.function.strict).toBe(true);
      else expect(body.tools[0]?.function).not.toHaveProperty('strict');
    }
  });
  it('does not add OpenRouter reasoning when it was not explicitly configured', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    await requireModel(models, 'openrouter').invoke(transcript(), options());
    expect(stub.requests[0]!.body).not.toHaveProperty('reasoning');
  });
  it('does not retry SDK errors and preserves safe status/headers for the controller', async () => {
    const stub = await transport(() => ({
      status: 429,
      body: { error: { message: 'Synthetic quota error.', type: 'rate_limit_error' } },
    }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const failure: unknown = await requireModel(models, 'groq')
      .invoke(transcript(), options())
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toMatchObject({ status: 429 });
    if (!failure || typeof failure !== 'object' || !('headers' in failure))
      throw new Error('O erro de transporte não preservou os headers de resposta.');
    expect(failure.headers instanceof Headers).toBe(true);
    expect(failure.headers instanceof Headers && failure.headers.get('retry-after')).toBe('3');
    expect(stub.requests).toHaveLength(1);
  });
  it('makes no HTTP request for an already cancelled operation', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      requireModel(models, 'groq').invoke(transcript(), { signal: controller.signal }),
    ).rejects.toThrow();
    expect(stub.requests).toHaveLength(0);
  });
  it('refuses unsafe tracing before constructing transports', () => {
    vi.stubEnv('LANGCHAIN_TRACING_V2', 'true');
    expect(() =>
      createFallbackModelFactory({ providers: candidates(), maxOutputTokens: 200 }),
    ).toThrow('privacidade');
  });
});

describe('Gemini thought signatures', () => {
  it('round-trips both sequential and parallel tool calls without changing original messages', async () => {
    const firstCalls = [call('parallel-first', 'SYNTHETIC_SIGNATURE_A'), call('parallel-second')];
    const secondCalls = [call('sequential', 'SYNTHETIC_SIGNATURE_B')];
    const stub = await transport((_provider, round) => ({
      body:
        round < 3
          ? completion({
              role: 'assistant',
              content: null,
              tool_calls: round === 1 ? firstCalls : secondCalls,
            })
          : final(),
    }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const gemini = requireModel(models, 'gemini');
    const messages = transcript();
    const first = await gemini.invoke(messages, options());
    const original = JSON.stringify(first);
    messages.push(
      first,
      new ToolMessage({ content: 'Public result A', tool_call_id: 'parallel-first' }),
      new ToolMessage({ content: 'Public result B', tool_call_id: 'parallel-second' }),
    );
    const second = await gemini.invoke(messages, options());
    messages.push(
      second,
      new ToolMessage({ content: 'Public result C', tool_call_id: 'sequential' }),
    );
    const answer = await gemini.invoke(messages, options());
    expect(answer.content).toBe('Synthetic public answer.');
    expect(first.tool_calls).toHaveLength(2);
    expect(JSON.stringify(first) === original).toBe(true);
    expect(
      stub.requests[1]!.body.messages.find((message) => message.role === 'assistant')?.tool_calls,
    ).toEqual(firstCalls);
    const replayed = stub.requests[2]!.body.messages.filter(
      (message) => message.role === 'assistant',
    );
    expect(replayed[0]?.tool_calls).toEqual(firstCalls);
    expect(replayed[1]?.tool_calls).toEqual(secondCalls);
    expect(
      stub.requests[2]!.body.messages.filter((message) => message.role === 'tool').map(
        (message) => message.tool_call_id,
      ),
    ).toEqual(['parallel-first', 'parallel-second', 'sequential']);
  });
  it('uses the documented import exception only for an explicitly foreign trace, keeping own signatures', async () => {
    const ownCalls = [call('own-call', 'SYNTHETIC_OWN_SIGNATURE')];
    const foreignCalls = [call('foreign-first'), call('foreign-second')];
    const stub = await transport((provider, round) => ({
      body:
        provider === 'openrouter'
          ? completion({ role: 'assistant', content: null, tool_calls: foreignCalls })
          : round === 1
            ? completion({ role: 'assistant', content: null, tool_calls: ownCalls })
            : final(),
    }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const gemini = requireModel(models, 'gemini');
    const own = await gemini.invoke(transcript(), options());
    const foreign = await requireModel(models, 'openrouter').invoke(transcript(), options());
    const originalForeign = JSON.stringify(foreign);
    await gemini.invoke(
      [
        ...transcript(),
        own,
        new ToolMessage({ content: 'Own result', tool_call_id: 'own-call' }),
        foreign,
        new ToolMessage({ content: 'Imported result A', tool_call_id: 'foreign-first' }),
        new ToolMessage({ content: 'Imported result B', tool_call_id: 'foreign-second' }),
      ],
      options(),
    );
    const request = stub.requests.at(-1)!.body;
    const assistants = request.messages.filter((message) => message.role === 'assistant');
    expect(assistants[0]!.tool_calls).toEqual(ownCalls);
    expect(assistants[1]!.tool_calls?.[0]?.extra_content?.google.thought_signature).toBe(
      'skip_thought_signature_validator',
    );
    expect(assistants[1]!.tool_calls?.[1]).not.toHaveProperty('extra_content');
    expect(JSON.stringify(foreign) === originalForeign).toBe(true);
  });
  it('accepts an explicitly tagged raw ChatMessage and strips vendor metadata for another provider', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const raw = new ChatMessage({
      role: 'assistant',
      content: '',
      additional_kwargs: { tool_calls: [call('raw-call', 'SYNTHETIC_RAW_SIGNATURE')] },
      response_metadata: { [LLM_PROVIDER_METADATA_KEY]: 'gemini' },
    });
    const messages = [
      ...transcript(),
      raw,
      new ToolMessage({ content: 'Result', tool_call_id: 'raw-call' }),
    ];
    await requireModel(models, 'gemini').invoke(messages, options());
    await requireModel(models, 'groq').invoke(messages, options());
    expect(
      stub.requests[0]!.body.messages[2]?.tool_calls?.[0]?.extra_content?.google.thought_signature,
    ).toBe('SYNTHETIC_RAW_SIGNATURE');
    expect(stub.requests[1]!.body.messages[2]?.tool_calls?.[0]).not.toHaveProperty('extra_content');
  });
  it.each(['missing', 'dummy'] as const)(
    'rejects an own Gemini 3 response with a %s signature before executing tools',
    async (mode) => {
      const stub = await transport(() => ({
        body: completion({
          role: 'assistant',
          content: null,
          tool_calls: [
            call('bad-own', mode === 'dummy' ? 'skip_thought_signature_validator' : undefined),
          ],
        }),
      }));
      const models = createFallbackModelFactory(
        { providers: candidates(), maxOutputTokens: 200 },
        stub.baseUrls,
      ).bindTools([search]);
      await expect(
        requireModel(models, 'gemini').invoke(transcript(), options()),
      ).rejects.toMatchObject({ code: 'LLM_INVALID_TOOL', status: 502 });
      expect(stub.requests).toHaveLength(1);
    },
  );
  it('rejects unknown provenance and disagreement between normalized and raw calls without HTTP', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const unknown = new AIMessage({
      content: '',
      tool_calls: [{ id: 'unknown', name: 'search_portfolio', args: { query: 'portfolio' } }],
    });
    const mismatch = new AIMessage({
      content: '',
      tool_calls: [{ id: 'same-call', name: 'search_portfolio', args: { query: 'CHANGED' } }],
      additional_kwargs: { tool_calls: [call('same-call', 'SYNTHETIC_SIGNATURE')] },
      response_metadata: { [LLM_PROVIDER_METADATA_KEY]: 'gemini' },
    });
    for (const message of [unknown, mismatch])
      await expect(
        requireModel(models, 'gemini').invoke([...transcript(), message], options()),
      ).rejects.toMatchObject({ code: 'LLM_INVALID_TOOL' });
    expect(stub.requests).toHaveLength(0);
  });
  it('keeps Gemini 2.5 compatible when its optional signature is absent', async () => {
    const stub = await transport((_provider, round) => ({
      body:
        round === 1
          ? completion({
              role: 'assistant',
              content: null,
              tool_calls: [call('optional-signature')],
            })
          : final(),
    }));
    const providers = candidates().map((provider) =>
      provider.id === 'gemini' ? { ...provider, model: 'gemini-2.5-flash' } : provider,
    );
    const models = createFallbackModelFactory(
      { providers, maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const gemini = requireModel(models, 'gemini');
    const first = await gemini.invoke(transcript(), options());
    await gemini.invoke(
      [
        ...transcript(),
        first,
        new ToolMessage({ content: 'Result', tool_call_id: 'optional-signature' }),
      ],
      options(),
    );
    expect(stub.requests[1]!.body.messages[2]?.tool_calls?.[0]).not.toHaveProperty('extra_content');
  });
  it('measures imported signatures and double-escaped arguments exactly without sending HTTP', async () => {
    const stub = await transport(() => ({ body: final() }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const foreign = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'escaped-call', name: 'search_portfolio', args: { query: '\\"\n'.repeat(250) } },
      ],
      response_metadata: { [LLM_PROVIDER_METADATA_KEY]: 'openrouter' },
    });
    const messages = [
      ...transcript(),
      foreign,
      new ToolMessage({ content: 'Public result', tool_call_id: 'escaped-call' }),
    ];
    const gemini = requireModel(models, 'gemini');
    const measured = gemini.contextCharacters!(messages);
    expect(stub.requests).toHaveLength(0);
    const previousEstimate = messages.reduce(
      (size, message) =>
        size +
        JSON.stringify(message.content).length +
        (AIMessage.isInstance(message) ? JSON.stringify(message.tool_calls ?? []).length : 0),
      0,
    );
    expect(measured).toBeGreaterThan(previousEstimate);
    await gemini.invoke(messages, options());
    expect(measured).toBe(JSON.stringify(stub.requests[0]!.body.messages).length);
    expect(
      stub.requests[0]!.body.messages[2]?.tool_calls?.[0]?.extra_content?.google.thought_signature,
    ).toBe('skip_thought_signature_validator');
  });
  it('strips Gemini metadata from an AI response when falling forward to another vendor', async () => {
    const stub = await transport((provider) => ({
      body:
        provider === 'gemini'
          ? completion({
              role: 'assistant',
              content: null,
              tool_calls: [call('signed-call', 'SYNTHETIC_SIGNATURE')],
            })
          : final(),
    }));
    const models = createFallbackModelFactory(
      { providers: candidates(), maxOutputTokens: 200 },
      stub.baseUrls,
    ).bindTools([search]);
    const own = await requireModel(models, 'gemini').invoke(transcript(), options());
    const original = JSON.stringify(own);
    const messages = [
      ...transcript(),
      own,
      new ToolMessage({ content: 'Public result', tool_call_id: 'signed-call' }),
    ];
    for (const id of ['openrouter', 'groq', 'cohere'] as const) {
      const next = requireModel(models, id);
      const measured = next.contextCharacters!(messages);
      await next.invoke(messages, options());
      const body = stub.requests.at(-1)!.body;
      expect(body.messages[2]?.tool_calls?.[0]).not.toHaveProperty('extra_content');
      expect(body.messages[2]?.tool_calls?.[0]?.function.name).toBe('search_portfolio');
      expect(measured).toBe(JSON.stringify(body.messages).length);
    }
    expect(JSON.stringify(own) === original).toBe(true);
  });
});
