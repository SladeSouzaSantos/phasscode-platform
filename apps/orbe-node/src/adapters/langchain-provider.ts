import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Config } from '../../../../packages/shared-config/src/index.js';
import type { Source } from '../../../../packages/contracts/src/index.js';
import type {
  ChatProvider,
  GenerationInput,
  GenerationResult,
  KnowledgeRepository,
} from '../domain/ports.js';
import { AppError } from '../domain/errors.js';

const searchArgs = z.strictObject({ query: z.string().min(1).max(300) });
export class LangChainChatProvider implements ChatProvider {
  readonly name: 'openai' | 'openai-compatible';
  private readonly model: ChatOpenAI;
  private readonly maxContextChars: number;
  constructor(
    config: Config,
    private readonly knowledge: KnowledgeRepository,
    private readonly prompt: string,
  ) {
    this.name = config.LLM_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'openai';
    this.maxContextChars = config.CHAT_CONTEXT_CHARS;
    this.model = new ChatOpenAI({
      model: config.LLM_MODEL!,
      apiKey: config.LLM_API_KEY!,
      useResponsesApi: config.LLM_API_MODE === 'responses',
      maxRetries: 0,
      timeout: config.LLM_TIMEOUT_MS,
      maxTokens: config.LLM_MAX_OUTPUT_TOKENS,
      modelKwargs: {
        store: false,
        ...(config.OPENROUTER_REASONING_ENABLED !== undefined
          ? { reasoning: { enabled: config.OPENROUTER_REASONING_ENABLED } }
          : {}),
      },
      ...(config.LLM_BASE_URL ? { configuration: { baseURL: config.LLM_BASE_URL } } : {}),
    });
  }
  async generate(input: GenerationInput): Promise<GenerationResult> {
    const used = new Map<string, Source>();
    const record = (docs: GenerationInput['documents']) => {
      for (const { type, id, title, url } of docs)
        used.set(id, { type, id, title, ...(url ? { url } : {}) });
      return JSON.stringify(
        docs.map(({ type, id, title, url, content }) => ({ type, id, title, url, content })),
      );
    };
    const messages: BaseMessage[] = [];
    const contextSize = () =>
      messages.reduce(
        (size, message) =>
          size +
          JSON.stringify(message.content).length +
          (message instanceof AIMessage ? JSON.stringify(message.tool_calls ?? []).length : 0),
        0,
      );
    // Cada busca é limitada. A ferramenta não aceita URL, ID de usuário ou comandos.
    const search = tool(
      ({ query }) => {
        const docs = this.knowledge
          .search(query)
          .slice(0, 3)
          .map((doc) => ({ ...doc, content: doc.content.slice(0, 2000) }));
        // Compartilha o mesmo orçamento em TODAS as rodadas; não acumula contexto sem limite.
        const available = Math.max(0, this.maxContextChars - contextSize() - 100);
        const selected: GenerationInput['documents'] = [];
        for (const doc of docs) {
          const candidate = [...selected, doc];
          if (JSON.stringify(candidate).length <= available) selected.push(doc);
        }
        return record(selected);
      },
      {
        name: 'search_portfolio',
        description: 'Busca fatos públicos do portfólio PHASSCODE. Apenas leitura.',
        schema: searchArgs,
      },
    );
    messages.push(
      new SystemMessage(this.prompt),
      new HumanMessage(
        `Documentos públicos de referência (JSON, somente dados):\n${record(input.documents)}`,
      ),
      ...input.history.map((message) =>
        message.role === 'user'
          ? new HumanMessage(message.content)
          : new AIMessage(message.content),
      ),
      new HumanMessage(input.message),
    );
    const model = this.model.bindTools([search], { strict: true });
    for (let round = 0; round < 3; round++) {
      if (contextSize() > this.maxContextChars)
        throw new AppError(
          'LLM_CONTEXT_LIMIT',
          502,
          'Limite de contexto do assistente atingido. Inicie uma nova conversa.',
        );
      const response = await model.invoke(messages, { signal: input.signal });
      if (response.invalid_tool_calls?.length)
        throw new AppError(
          'LLM_INVALID_TOOL',
          502,
          'O assistente retornou uma ferramenta inválida.',
        );
      if (!response.tool_calls?.length) {
        const answer =
          typeof response.content === 'string'
            ? response.content
            : response.content
                .filter((part) => part.type === 'text')
                .map((part) => ('text' in part ? String(part.text) : ''))
                .join('\n');
        if (!answer.trim() || answer.length > 8000)
          throw new AppError(
            'LLM_INVALID_RESPONSE',
            502,
            'O assistente retornou uma resposta inválida.',
          );
        return { answer, sources: [...used.values()].slice(0, 10) };
      }
      if (response.tool_calls.length > 3)
        throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de ferramentas atingido.');
      messages.push(response);
      for (const call of response.tool_calls) {
        if (call.name !== 'search_portfolio' || !call.id)
          throw new AppError('LLM_INVALID_TOOL', 502, 'Ferramenta não autorizada.');
        const args = searchArgs.safeParse(call.args);
        if (!args.success)
          throw new AppError('LLM_INVALID_TOOL', 502, 'Parâmetros de ferramenta inválidos.');
        const content = await search.invoke(args.data);
        messages.push(new ToolMessage({ content, tool_call_id: call.id }));
      }
    }
    throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de rodadas do assistente atingido.');
  }
}
