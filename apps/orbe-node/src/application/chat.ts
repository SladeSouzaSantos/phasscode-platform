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
} from '../domain/security.js';

export const PROMPT_VERSION = 'orbe-v1';
export class ChatService {
  constructor(
    private readonly store: ConversationStore,
    private readonly provider: ChatProvider,
    private readonly knowledge: KnowledgeRepository,
    private readonly config: Config,
  ) {}

  async execute(request: ChatRequest, token?: string): Promise<ChatResponse> {
    const isNew = request.conversationId === undefined;
    if (!isNew && (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))) throw conversationNotFound();
    const conversationId = request.conversationId ?? randomUUID();
    const conversationToken = isNew ? randomBytes(32).toString('base64url') : token!;
    return this.store.runTurn(
      { id: conversationId, tokenHash: hashToken(conversationToken), isNew },
      async (history) => {
        let result;
        if (isInjection(request.message)) result = { answer: injectionRefusal, sources: [] };
        else if (!isInScope(request.message)) result = { answer: scopeRefusal, sources: [] };
        else {
          const bounded: Message[] = [];
          // Reserva fixa para prompt, metadados JSON e protocolo das ferramentas.
          const dataBudget = Math.max(
            0,
            this.config.CHAT_CONTEXT_CHARS - 3000 - request.message.length,
          );
          const historyBudget = Math.floor(dataBudget / 2);
          let chars = 0;
          for (const message of history.slice(-this.config.CHAT_HISTORY_MESSAGES).reverse()) {
            if (chars + message.content.length > historyBudget) break;
            chars += message.content.length;
            bounded.unshift(message);
          }
          // Recuperação tem orçamento independente para manter toda chamada limitada.
          let remaining = dataBudget - historyBudget;
          const documents = this.knowledge
            .search(request.message)
            .slice(0, 5)
            .flatMap((doc) => {
              if (remaining <= 0) return [];
              const content = doc.content.slice(0, remaining);
              remaining -= content.length;
              return [{ ...doc, content }];
            });
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            result = await Promise.race([
              this.provider.generate({
                message: request.message,
                history: bounded,
                documents,
                signal: controller.signal,
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  controller.abort();
                  reject(
                    new AppError(
                      'LLM_TIMEOUT',
                      504,
                      'O assistente demorou para responder. Tente novamente.',
                    ),
                  );
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
          ...result,
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
