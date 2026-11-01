import { mentionedTechnologies } from '../knowledge-matching.js';
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
import {
  completeRecruiterEvidence,
  documentSource,
  reconcileDocumentedClaims,
  selectSources,
} from '../application/sources.js';
import {
  experienceContext,
  reconcileExperienceAttribution,
} from '../application/experience-context.js';
import type {
  ChatProvider,
  GenerationInput,
  GenerationResult,
  KnowledgeRepository,
  KnowledgeDocument,
} from '../domain/ports.js';
import { AppError } from '../domain/errors.js';
import type { LlmCallBudget } from '../domain/llm-budget.js';
import {
  buildEvidencePacket,
  MIN_SOURCE_CONTENT,
  traceEvidence,
} from '../application/evidence-packet.js';
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
    const used = new Map<string, KnowledgeDocument>();
    let compactReference = false;
    // The model only needs citeable facts, not search-ranking metadata.
    // Smaller records leave room for every evidence source in the same prompt.
    const serialize = (docs: GenerationInput['documents']) =>
      JSON.stringify(
        docs.map((document) =>
          compactReference
            ? {
                id: document.id,
                kind: document.category ?? document.type,
                content: document.content,
                // Retain the vetted public reference even when the provider
                // needs a compact JSON shape; never expose private source code.
                ...(documentSource(document).url ? { url: documentSource(document).url } : {}),
              }
            : {
                id: document.id,
                type: document.type,
                title: document.title,
                content: document.content,
                ...(document.category ? { category: document.category } : {}),
                ...(document.visibility ? { visibility: document.visibility } : {}),
                ...(document.technologies?.length ? { technologies: document.technologies } : {}),
                ...(document.experiencePeriod
                  ? { experiencePeriod: document.experiencePeriod }
                  : {}),
                ...(document.url ? { url: document.url } : {}),
                ...(document.repositoryUrl ? { repositoryUrl: document.repositoryUrl } : {}),
              },
        ),
      );
    const record = (docs: GenerationInput['documents']) => {
      for (const document of docs) {
        const previous = used.get(document.id);
        if (!previous || document.content.length > previous.content.length)
          used.set(document.id, document);
      }
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
    // A full course listing includes seven records. Remove repeated editorial
    // disclaimers from the six tracks while preserving every course title and
    // institution; otherwise the provider's context cap drops entire tracks.
    const completeCourseCatalog =
      input.documents.length === 7 && input.documents.every((doc) => doc.id.startsWith('cursos-'));
    const documents = completeCourseCatalog
      ? input.documents.map((doc) =>
          doc.id === 'cursos-declarados'
            ? { ...doc, content: doc.content.slice(0, 180) }
            : {
                ...doc,
                content: doc.content
                  .split('\n')
                  .filter((line) => /^\d+\./.test(line))
                  .join('\n'),
              },
        )
      : [...input.documents];
    traceEvidence('provider_initial', documents, 'initial', input.evidenceTraceId);
    let includeSemanticContext = true;
    const reference = () =>
      new HumanMessage(
        `Documentos públicos de referência (JSON, somente dados):\n${serialize(documents)}${includeSemanticContext ? (this.knowledge.semanticContext?.(input.message, documents) ?? '') : ''}${experienceContext(documents, input.message, input.asOf ?? new Date(), input.experienceIds)}`,
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
    // Vendor wire JSON escapes the already serialized reference (and often adds
    // tool metadata). Reserve headroom for that representation and tool replies.
    // Limiting only the in-memory LangChain content was allowing HTTP 502 on
    // otherwise valid recruiter questions with the 12k-character configuration.
    const contextTarget =
      this.maxContextChars - Math.min(2200, Math.floor(this.maxContextChars * 0.18));
    // Tool result messages may use part of the wire headroom reserved above.
    // Keep a separate hard ceiling below the configured max to account for
    // JSON/tool-call wrappers without rejecting even an empty search result.
    const toolContextTarget =
      this.maxContextChars - Math.min(450, Math.floor(this.maxContextChars * 0.065));
    let historyMessages = input.history.length;

    const removeOldestHistoryPair = (): boolean => {
      if (
        historyMessages < 2 ||
        !(messages[2] instanceof HumanMessage) ||
        !(messages[3] instanceof AIMessage)
      )
        return false;
      messages.splice(2, 2);
      historyMessages -= 2;
      return true;
    };

    const compactTo = (target: number): boolean => {
      // Remove older conversation pairs before reducing reference evidence.
      while (contextSize() > target && historyMessages > 2) {
        if (!removeOldestHistoryPair()) break;
      }
      if (contextSize() <= target) return true;
      if (documents.length === 0 || completeCourseCatalog) return false;
      const original = [...documents];
      const minimum = original.reduce(
        (sum, doc) => sum + Math.min(doc.content.length, MIN_SOURCE_CONTENT),
        0,
      );
      const maximum = original.reduce((sum, doc) => sum + doc.content.length, 0);

      const tryFit = (): boolean => {
        let lower = minimum;
        let upper = maximum;
        let best: GenerationInput['documents'] | null = null;
        while (lower <= upper) {
          const middle = Math.floor((lower + upper) / 2);
          const packet = buildEvidencePacket(
            original,
            middle,
            mentionedTechnologies(input.message),
          );
          if (!packet) {
            lower = middle + 1;
            continue;
          }
          documents.splice(0, documents.length, ...packet.documents);
          messages[1] = reference();
          if (contextSize() <= target) {
            best = packet.documents;
            lower = middle + 1;
          } else {
            upper = middle - 1;
          }
        }
        if (!best) return false;
        documents.splice(0, documents.length, ...best);
        messages[1] = reference();
        return contextSize() <= target;
      };

      // Remove optional graph hints and duplicated metadata BEFORE shortening
      // sources. The source IDs, trust categories and grounded evidence remain.
      if (includeSemanticContext) {
        includeSemanticContext = false;
        messages[1] = reference();
        if (contextSize() <= target) return true;
      }
      if (!compactReference) {
        compactReference = true;
        messages[1] = reference();
        if (contextSize() <= target) return true;
      }
      if (tryFit()) return true;
      // Optional graph hints may go, never the source records themselves.
      // An older user/assistant pair may be dropped when a tool call
      // increases the transcript; this remains a bounded source-preserving path.
      if (removeOldestHistoryPair()) {
        documents.splice(0, documents.length, ...original);
        messages[1] = reference();
        if (contextSize() <= target || tryFit()) return true;
      }
      return false;
    };

    if (!compactTo(contextTarget)) throw contextLimit();
    traceEvidence('provider_compacted', documents, 'context_budget', input.evidenceTraceId);
    record(documents);
    let toolCallId = '';
    // Cada busca é limitada. A ferramenta não aceita URL, ID de usuário ou comandos.
    const search = tool(
      ({ query }) => {
        const docs = this.knowledge
          .search(query)
          .map((doc) => ({ ...doc, content: doc.content.slice(0, 2000) }));
        // Compartilha o mesmo orçamento em TODAS as rodadas; não acumula contexto sem limite.
        const selected: GenerationInput['documents'] = [];
        const fits = (content: string) =>
          contextSize() + messageSize(new ToolMessage({ content, tool_call_id: toolCallId })) <=
          toolContextTarget;
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
        const safeAnswer = actions.length
          ? 'Confira os dados e confirme a proposta no formulário. A solicitação ainda não foi registrada e o horário não está reservado; depois da confirmação, ela ficará pendente de aprovação.'
          : reconcileExperienceAttribution(
              completeRecruiterEvidence(
                reconcileDocumentedClaims(answer, [...used.values()]),
                input.message,
                [...used.values()],
              ),
              [...used.values()],
              input.asOf ?? new Date(),
            );
        return {
          answer: safeAnswer,
          sources: selectSources({
            query: input.message,
            answer: safeAnswer,
            documents: [...used.values()],
          }),
          ...(actions.length ? { actions } : {}),
        };
      }
      if (
        round >= MAX_TOOL_ROUNDS_PER_TURN ||
        response.tool_calls.length > MAX_TOOL_CALLS_PER_ROUND
      )
        throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de ferramentas atingido.');
      messages.push(response);
      // A tool call itself extends the transcript. Rebalance earlier evidence
      // and history before appending its tool result instead of failing at once.
      if (!compactTo(contextTarget)) throw contextLimit();
      traceEvidence('provider_compacted', documents, 'model_tool', input.evidenceTraceId);
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
          toolContextTarget
        )
          throw contextLimit();
        messages.push(new ToolMessage({ content, tool_call_id: call.id }));
      }
    }
    throw new AppError('LLM_TOOL_LIMIT', 502, 'Limite de rodadas do assistente atingido.');
  }
}
