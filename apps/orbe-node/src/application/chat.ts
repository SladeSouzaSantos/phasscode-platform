import { randomBytes, randomUUID } from 'node:crypto';
import {
  chatResponseSchema,
  type ChatRequest,
  type ChatResponse,
} from '../../../../packages/contracts/src/index.js';
import type { Config } from '../../../../packages/shared-config/src/index.js';
import type {
  ChatProvider,
  ConversationStore,
  KnowledgeRepository,
  Message,
} from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import {
  hashToken,
  injectionRefusal,
  isInjection,
  isInScope,
  scopeRefusal,
  unknownAnswer,
  meetingUnavailable,
  greetingAnswer,
  isGreeting,
  isMeetingRequest,
  isOffTopicTask,
  isContextualFollowUp,
  isSimpleTest,
  simpleTestAnswer,
  isPersonalLifeQuestion,
  personalLifeAnswer,
} from '../domain/security.js';
import { eligibleHistory } from './context.js';
import { isExperienceDurationQuestion } from './experience-context.js';
import type { PublicEvidenceReader } from './public-evidence.js';
import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';
import { buildEvidencePacket, traceEvidence } from './evidence-packet.js';

export const PROMPT_VERSION = 'orbe-v4';
export class ChatService {
  constructor(
    private readonly store: ConversationStore,
    private readonly provider: ChatProvider,
    private readonly knowledge: KnowledgeRepository,
    private readonly config: Config,
    private readonly meetingsEnabled = false,
    private readonly now: () => Date = () => new Date(),
    private readonly evidenceReader?: PublicEvidenceReader,
  ) {}

  async execute(
    request: ChatRequest,
    token?: string,
    options: { meetingActions?: boolean; analyticsConsent?: boolean } = {},
  ): Promise<ChatResponse> {
    const meetingActions = this.meetingsEnabled && options.meetingActions === true;
    const isNew = request.conversationId === undefined;
    if (!isNew && (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))) throw conversationNotFound();
    const conversationId = request.conversationId ?? randomUUID();
    const conversationToken = isNew ? randomBytes(32).toString('base64url') : token!;
    return this.store.runTurn(
      {
        id: conversationId,
        tokenHash: hashToken(conversationToken),
        isNew,
        ...(options.analyticsConsent ? { analyticsConsent: true } : {}),
      },
      async (history) => {
        const eligible = eligibleHistory(history);
        const previous = [...eligible]
          .reverse()
          .find((message) => message.role === 'user' && !isContextualFollowUp(message.content));
        const followUp = Boolean(previous && isContextualFollowUp(request.message));
        const query = followUp ? `${previous!.content}\n${request.message}` : request.message;
        const evidenceTraceId = randomUUID();
        const meetingTurn =
          meetingActions &&
          (isMeetingRequest(request.message) ||
            (/\b(?:\d{4}-\d{2}-\d{2}|[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/i.test(request.message) &&
              Boolean(previous && isMeetingRequest(previous.content))));
        let retrieved = this.knowledge.search(query);
        const normalizedQuery = knowledgePhrase(query);
        // Recruiters asking for the complete chronological career need every
        // verified employer, not just the 5 best lexical search matches.
        const chronologicalOverview =
          /\b(?:trajetoria|historico profissional|experiencias profissionais|todas as experiencias|ordem cronologica|empresas em ordem|cada empresa)\b/.test(
            normalizedQuery,
          );
        const completeCourseCatalog =
          /\b(?:todos os cursos|todos os 42 cursos|42 cursos|lista completa de cursos|cursos por trilha|liste todos os cursos)\b/.test(
            normalizedQuery,
          );
        const durationQuestion = isExperienceDurationQuestion(query);
        const experienceDocuments =
          durationQuestion || chronologicalOverview
            ? (this.knowledge.experienceDocuments?.() ?? []).sort((a, b) =>
                (a.experiencePeriod?.start ?? '').localeCompare(b.experiencePeriod?.start ?? ''),
              )
            : [];
        if (experienceDocuments.length) {
          const broadProgrammingQuestion = /\b(?:programa\w*|desenvolv\w*|software)\b/.test(
            normalizedQuery,
          );
          // The SDGP is a canonical mixed-role project, not a ranked fallback.
          // Keep this optional lookup compatible with test knowledge adapters.
          const sdgp = this.knowledge.getDocument?.('greencity-sdgp');
          const mixedRoleProject = broadProgrammingQuestion && sdgp ? [sdgp] : [];
          const ordered = chronologicalOverview
            ? [...experienceDocuments, ...retrieved]
            : [
                // Durations must prioritize concise original employment records.
                // Project evidence must not be discarded after enriched texts fill the budget.
                ...experienceDocuments,
                ...mixedRoleProject,
                ...retrieved,
              ];
          retrieved = [...new Map(ordered.map((doc) => [doc.id, doc])).values()];
          // Duration answers use structured periods, not long prose. Reserve
          // room for all four employment records plus the mixed-role SDGP proof.
          if (durationQuestion && broadProgrammingQuestion) {
            retrieved = retrieved.map((doc) => ({
              ...doc,
              content: doc.content.slice(0, 550),
            }));
          }
        }
        // External pages are untrusted data, never instructions. Restrict retrieval to
        // public LinkedIn job postings and known public GitHub project READMEs.
        if (
          this.evidenceReader &&
          !isInjection(request.message) &&
          !isOffTopicTask(request.message)
        ) {
          const evidence = await this.evidenceReader.read(request.message, retrieved);
          if (evidence.length) {
            const replacements = new Map(evidence.map((doc) => [doc.id, doc]));
            retrieved = [
              ...evidence.filter((doc) => doc.id === 'external-vacancy'),
              ...retrieved.map((doc) => replacements.get(doc.id) ?? doc),
            ];
          }
        }
        if (meetingTurn)
          retrieved.unshift({
            type: 'platform',
            id: 'meeting-policy',
            title: 'Regras de agendamento em execução',
            keywords: ['reunião', 'agendamento'],
            content:
              'Consulte horários somente com get_meeting_availability. prepare_meeting_request prepara dados para o formulário de confirmação do visitante. Não cria solicitação nem reserva horário. Somente após confirmação HTTP há pedido PENDING; administração aprova e Calendar confirma. Nunca diga que uma proposta já foi registrada ou aprovada.',
          });
        traceEvidence('retrieved', retrieved, 'initial', evidenceTraceId);
        let result;
        if (isInjection(request.message)) result = { answer: injectionRefusal, sources: [] };
        else if (isGreeting(request.message)) result = { answer: greetingAnswer, sources: [] };
        else if (isSimpleTest(request.message)) result = { answer: simpleTestAnswer, sources: [] };
        else if (isOffTopicTask(request.message)) result = { answer: scopeRefusal, sources: [] };
        else if (isPersonalLifeQuestion(request.message))
          result = { answer: personalLifeAnswer, sources: [] };
        else if (isMeetingRequest(request.message) && !meetingActions)
          result = {
            answer: meetingUnavailable,
            sources: this.knowledge
              .search('phasscode-platform')
              .filter((doc) => doc.id === 'phasscode-platform')
              .map(({ type, id, title, url }) => ({ type, id, title, ...(url ? { url } : {}) })),
          };
        else if (
          !isInScope(
            request.message,
            retrieved.flatMap((doc) => doc.keywords),
          ) &&
          !meetingTurn &&
          !followUp
        )
          result = { answer: scopeRefusal, sources: [] };
        else if (retrieved.length === 0) result = { answer: unknownAnswer, sources: [] };
        else {
          const bounded: Message[] = [];
          // Reserva fixa para prompt, metadados JSON e protocolo das ferramentas.
          const dataBudget = Math.max(
            0,
            this.config.CHAT_CONTEXT_CHARS - 3000 - request.message.length,
          );
          const historyBudget = Math.floor(dataBudget / (completeCourseCatalog ? 6 : 2));
          let chars = 0;
          for (let index = eligible.length - 2; index >= 0; index -= 2) {
            const pair = eligible.slice(index, index + 2);
            const pairChars = pair.reduce((sum, message) => sum + message.content.length, 0);
            if (
              bounded.length + 2 > this.config.CHAT_HISTORY_MESSAGES ||
              chars + pairChars > historyBudget
            )
              break;
            chars += pairChars;
            bounded.unshift(...pair);
          }
          // Maintain coverage across distinct requirements. An overflowing early
          // record may never consume the entire budget and hide React/MySQL later.
          // Vacancy requirements are not limited to five documents. Preserve the
          // entire requirement-aware retrieval set; the packet/provider enforce
          // the actual context budget and fail closed if it cannot fit.
          const vacancy = /\b(?:vaga|recrutad\w*|experienc\w*|profission\w*|trabalh\w*|candidat\w*|qualific\w*|contrat\w*)\b/.test(
            normalizedQuery,
          );
          const selected = completeCourseCatalog
            ? retrieved.slice(0, 7)
            : vacancy
              ? retrieved
              : retrieved.slice(0, 5);
          // Unused history headroom belongs to evidence, not an artificial gap.
          // Actual retained history is already bounded above by historyBudget.
          const contentBudget = Math.max(0, dataBudget - chars);
          const packet = completeCourseCatalog
            ? selected
            : buildEvidencePacket(selected, contentBudget, mentionedTechnologies(query))?.documents;
          const documents = packet ?? [];
          traceEvidence('chat_bounded', documents, 'context_budget', evidenceTraceId);
          if (documents.length === 0)
            throw new AppError(
              'LLM_CONTEXT_LIMIT',
              502,
              'Limite de contexto do assistente atingido. Envie uma mensagem mais curta.',
            );
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            result = await Promise.race([
              this.provider.generate({
                message: request.message,
                history: bounded,
                documents,
                evidenceTraceId,
                signal: controller.signal,
                meetingActions,
                asOf: this.now(),
                ...(experienceDocuments.length
                  ? { experienceIds: experienceDocuments.map((doc) => doc.id) }
                  : {}),
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(
                    new AppError(
                      'LLM_TIMEOUT',
                      504,
                      'O assistente demorou para responder. Tente novamente.',
                    ),
                  );
                  // Escolhe o erro 504 antes de o listener de abort do transporte poder
                  // rejeitar a geração e transformá-lo incorretamente em LLM_UNAVAILABLE.
                  controller.abort();
                }, this.config.LLM_TIMEOUT_MS);
              }),
            ]);
          } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(
              'LLM_UNAVAILABLE',
              502,
              'O provedor de IA está indisponível. Tente novamente.',
            );
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        traceEvidence(
          'response_sources',
          result.sources.map((source) => ({ id: source.id, content: '' })),
          undefined,
          evidenceTraceId,
        );
        const response = chatResponseSchema.parse({
          conversationId,
          ...(isNew ? { conversationToken } : {}),
          answer: result.answer,
          sources: result.sources,
          ...(meetingActions && result.actions?.length ? { actions: result.actions } : {}),
          meta: {
            provider: this.provider.name,
            simulated: this.provider.name === 'mock',
            promptVersion: PROMPT_VERSION,
          },
        });
        return {
          response,
          messages: [
            { role: 'user', content: request.message },
            { role: 'assistant', content: response.answer },
          ],
        };
      },
    );
  }
}
