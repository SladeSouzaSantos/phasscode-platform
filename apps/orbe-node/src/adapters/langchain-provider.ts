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
import { meetingProposalInputSchema } from '../../../../packages/contracts/src/meetings.js';
import type { MeetingTools } from '../domain/meeting-tools.js';
import {
  assertLlmPrivacyEnvironment,
  type Config,
} from '../../../../packages/shared-config/src/index.js';
import type { Source } from '../../../../packages/contracts/src/index.js';
import type {
  ChatProvider,
  GenerationInput,
  GenerationResult,
  KnowledgeRepository,
} from '../domain/ports.js';
import { AppError } from '../domain/errors.js';
import type { LlmCallBudget } from '../domain/llm-budget.js';
import type { LlmInvocationFactory } from '../domain/llm-invocation.js';
import {
  MAX_MODEL_CALLS_PER_TURN,
  MAX_TOOL_CALLS_PER_ROUND,
  MAX_TOOL_ROUNDS_PER_TURN,
} from '../domain/llm-limits.js';

const searchArgs = z.strictObject({ query: z.string().min(1).max(300) });
export class LangChainChatProvider implements ChatProvider {
  readonly name: 'openai' | 'openai-compatible';
  private readonly model: ChatOpenAI | undefined;
  private readonly maxContextChars: number;
  constructor(
    config: Config,
    private readonly knowledge: KnowledgeRepository,
    private readonly prompt: string,
    private readonly budget: LlmCallBudget,
    private readonly meetings?: MeetingTools,
    private readonly invocationFactory?: LlmInvocationFactory,
  ) {
    assertLlmPrivacyEnvironment(process.env);
    this.name =
      invocationFactory || config.LLM_PROVIDER === 'openai-compatible'
        ? 'openai-compatible'
        : 'openai';
    this.maxContextChars = config.CHAT_CONTEXT_CHARS;
    if (invocationFactory) return;
    this.model = new ChatOpenAI({
      model: config.LLM_MODEL!,
      apiKey: config.LLM_API_KEY!,
      useResponsesApi: config.LLM_API_MODE === 'responses',
      maxRetries: 0,
      verbose: false,
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
    const actions: NonNullable<GenerationResult['actions']> = [];
    const used = new Map<string, Source>();
    const serialize = (docs: GenerationInput['documents']) =>
      JSON.stringify(
        docs.map(({ type, id, title, url, content }) => ({ type, id, title, url, content })),
      );
    const record = (docs: GenerationInput['documents']) => {
      for (const { type, id, title, url } of docs)
        used.set(id, { type, id, title, ...(url ? { url } : {}) });
      return serialize(docs);
    };
    const messages: BaseMessage[] = [];
    const messageSize = (message: BaseMessage) =>
      JSON.stringify(message.content).length +
      (message instanceof AIMessage ? JSON.stringify(message.tool_calls ?? []).length : 0) +
      // Raw tool calls may include Gemini thought signatures absent from the
      // normalized calls. They are replayed on the wire and share the context cap.
      (message instanceof AIMessage
        ? JSON.stringify(message.additional_kwargs.tool_calls ?? []).length
        : 0) +
      (message instanceof ToolMessage ? JSON.stringify(message.tool_call_id).length : 0);
    const contextSize = () => messages.reduce((size, message) => size + messageSize(message), 0);
    const contextLimit = () =>
      new AppError(
        'LLM_CONTEXT_LIMIT',
        502,
        'Limite de contexto do assistente atingido. Envie uma mensagem mais curta.',
      );
    const documents = [...input.documents];
    const reference = () =>
      new HumanMessage(
        `Documentos públicos de referência (JSON, somente dados):\n${serialize(documents)}`,
      );
    messages.push(
      new SystemMessage(this.prompt),
      reference(),
      ...input.history.map((message) =>
        message.role === 'user'
          ? new HumanMessage(message.content)
          : new AIMessage(message.content),
      ),
      new HumanMessage(input.message),
    );
    // O orçamento da aplicação estima conteúdo; aqui prompt e JSON escapado são medidos
    // antes de qualquer reserva/invoke. Remova somente pares antigos completos do histórico.
    let historyMessages = input.history.length;
    while (
      contextSize() > this.maxContextChars &&
      historyMessages >= 2 &&
      messages[2] instanceof HumanMessage &&
      messages[3] instanceof AIMessage
    ) {
      messages.splice(2, 2);
      historyMessages -= 2;
    }
    while (contextSize() > this.maxContextChars && documents.length > 1) {
      documents.pop();
      messages[1] = reference();
    }
    if (contextSize() > this.maxContextChars && documents[0]) {
      const original = documents[0];
      let low = 1;
      let high = original.content.length;
      let fitting = 0;
      while (low <= high) {
        const length = Math.floor((low + high) / 2);
        documents[0] = { ...original, content: original.content.slice(0, length) };
        messages[1] = reference();
        if (contextSize() <= this.maxContextChars) {
          fitting = length;
          low = length + 1;
        } else high = length - 1;
      }
      if (fitting === 0) throw contextLimit();
      documents[0] = { ...original, content: original.content.slice(0, fitting) };
      messages[1] = reference();
    }
    if (contextSize() > this.maxContextChars) throw contextLimit();
    record(documents);
    let toolCallId = '';
    // Cada busca é limitada. A ferramenta não aceita URL, ID de usuário ou comandos.
    const search = tool(
      ({ query }) => {
        const docs = this.knowledge
          .search(query)
          .slice(0, 3)
          .map((doc) => ({ ...doc, content: doc.content.slice(0, 2000) }));
        // Compartilha o mesmo orçamento em TODAS as rodadas; não acumula contexto sem limite.
        const selected: GenerationInput['documents'] = [];
        const fits = (content: string) =>
          contextSize() + messageSize(new ToolMessage({ content, tool_call_id: toolCallId })) <=
          this.maxContextChars;
        if (!fits('[]')) throw contextLimit();
        for (const doc of docs) {
          const candidate = [...selected, doc];
          if (fits(serialize(candidate))) selected.push(doc);
        }
        return record(selected);
      },
      {
        name: 'search_portfolio',
        description: 'Busca fatos públicos do portfólio PHASSCODE. Apenas leitura.',
        schema: searchArgs,
      },
    );
    const availabilityArgs = z.strictObject({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
    });
    const availability = tool(
      async ({ start, end }) => {
        input.signal.throwIfAborted();
        return JSON.stringify(await this.meetings!.availability(start, end));
      },
      {
        name: 'get_meeting_availability',
        description:
          'Consulta intervalos de atendimento reais; nunca retorna detalhes de compromissos privados. Datas ISO com offset, janela de no máximo sete dias.',
        schema: availabilityArgs,
      },
    );
    const prepare = tool(
      async (args) => {
        input.signal.throwIfAborted();
        if (actions.length)
          throw new AppError('LLM_TOOL_LIMIT', 502, 'Prepare somente uma proposta por turno.');
        const proposal = await this.meetings!.prepareProposal(args);
        actions.push({ type: 'confirm_meeting_request', proposal });
        // The one-use confirmation secret belongs to the UI, never to model messages/history.
        return JSON.stringify({
          summary: {
            start: proposal.summary.start,
            end: proposal.summary.end,
            timeZone: proposal.summary.timeZone,
          },
          consentVersion: proposal.consentVersion,
          expiresAt: proposal.expiresAt,
          requiresVisitorConfirmation: true,
          requestCreated: false,
        });
      },
      {
        name: 'prepare_meeting_request',
        description:
          'Prepara proposta com dados informados pelo visitante. NÃO cria solicitação nem reserva horário. O visitante precisa confirmar os dados no formulário do frontend.',
        schema: meetingProposalInputSchema,
      },
    );
    const tools =
      this.meetings && input.meetingActions === true ? [search, availability, prepare] : [search];
    const model = this.model?.bindTools(tools, { strict: true });
    const invoke = this.invocationFactory
      ? this.invocationFactory(tools, input.signal)
      : async (transcript: BaseMessage[]) => {
          await this.budget.reserve();
          input.signal.throwIfAborted();
          return model!.invoke(transcript, { signal: input.signal });
        };
    for (let round = 0; round < MAX_MODEL_CALLS_PER_TURN; round++) {
      if (contextSize() > this.maxContextChars) throw contextLimit();
      input.signal.throwIfAborted();
      const response = await invoke(messages);
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
        return {
          answer: actions.length
            ? 'Confira os dados e confirme a proposta no formulário. A solicitação ainda não foi registrada e o horário não está reservado; depois da confirmação, ela ficará pendente de aprovação.'
            : answer,
          sources: [...used.values()].slice(0, 10),
          ...(actions.length ? { actions } : {}),
        };
      }
      if (
        round >= MAX_TOOL_ROUNDS_PER_TURN ||
        response.tool_calls.length > MAX_TOOL_CALLS_PER_ROUND
      )
        throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de ferramentas atingido.');
      messages.push(response);
      if (contextSize() > this.maxContextChars) throw contextLimit();
      for (const call of response.tool_calls) {
        const selectedTool = tools.find((candidate) => candidate.name === call.name);
        if (!selectedTool || !call.id)
          throw new AppError('LLM_INVALID_TOOL', 502, 'Ferramenta não autorizada.');
        const args = (
          call.name === 'search_portfolio'
            ? searchArgs
            : call.name === 'get_meeting_availability'
              ? availabilityArgs
              : meetingProposalInputSchema
        ).safeParse(call.args);
        if (!args.success)
          throw new AppError('LLM_INVALID_TOOL', 502, 'Parâmetros de ferramenta inválidos.');
        toolCallId = call.id;
        // Invoking the selected tool validates its own schema again, before effects.
        const content =
          call.name === 'search_portfolio'
            ? await search.invoke(searchArgs.parse(call.args))
            : call.name === 'get_meeting_availability'
              ? await availability.invoke(availabilityArgs.parse(call.args))
              : await prepare.invoke(meetingProposalInputSchema.parse(call.args));
        if (
          contextSize() + messageSize(new ToolMessage({ content, tool_call_id: call.id })) >
          this.maxContextChars
        )
          throw contextLimit();
        messages.push(new ToolMessage({ content, tool_call_id: call.id }));
      }
    }
    throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de rodadas do assistente atingido.');
  }
}
