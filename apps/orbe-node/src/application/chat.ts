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

export const PROMPT_VERSION = 'orbe-v4';
export class ChatService {
  constructor(
    private readonly store: ConversationStore,
    private readonly provider: ChatProvider,
    private readonly knowledge: KnowledgeRepository,
    private readonly config: Config,
    private readonly meetingsEnabled = false,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    request: ChatRequest,
    token?: string,
    options: { meetingActions?: boolean } = {},
  ): Promise<ChatResponse> {
    const meetingActions = this.meetingsEnabled && options.meetingActions === true;
    const isNew = request.conversationId === undefined;
    if (!isNew && (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))) throw conversationNotFound();
    const conversationId = request.conversationId ?? randomUUID();
    const conversationToken = isNew ? randomBytes(32).toString('base64url') : token!;
    return this.store.runTurn(
      { id: conversationId, tokenHash: hashToken(conversationToken), isNew },
      async (history) => {
        const eligible = eligibleHistory(history);
        const previous = [...eligible]
          .reverse()
          .find((message) => message.role === 'user' && !isContextualFollowUp(message.content));
        const followUp = Boolean(previous && isContextualFollowUp(request.message));
        const query = followUp ? `${previous!.content}\n${request.message}` : request.message;
        const meetingTurn =
          meetingActions &&
          (isMeetingRequest(request.message) ||
            (/\b(?:\d{4}-\d{2}-\d{2}|[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/i.test(request.message) &&
              Boolean(previous && isMeetingRequest(previous.content))));
        let retrieved = this.knowledge.search(query);
        const experienceDocuments = isExperienceDurationQuestion(query)
          ? (this.knowledge.experienceDocuments?.() ?? [])
          : [];
        if (experienceDocuments.length) {
          const ordered = [
            ...retrieved.filter((doc) => doc.experiencePeriod),
            ...experienceDocuments,
            ...retrieved,
          ];
          retrieved = [...new Map(ordered.map((doc) => [doc.id, doc])).values()];
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
          const historyBudget = Math.floor(dataBudget / 2);
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
          // Recuperação tem orçamento independente para manter toda chamada limitada.
          let remaining = dataBudget - historyBudget;
          const documents = retrieved.slice(0, 5).flatMap((doc) => {
            if (remaining <= 0) return [];
            const content = doc.content.slice(0, remaining);
            remaining -= content.length;
            return [{ ...doc, content }];
          });
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
