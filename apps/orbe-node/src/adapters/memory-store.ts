import type { ChatResponse } from '../../../../packages/contracts/src/index.js';
import type { ConversationStore, Message, TurnResult } from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import { equalHashes } from '../domain/security.js';

interface Conversation {
  tokenHash: string;
  history: Message[];
  updatedAt: number;
}
export class MemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly active = new Set<string>();
  constructor(
    private readonly maxMessages = 12,
    private readonly maxConversations = 1000,
    private readonly retentionDays = 7,
  ) {}
  async runTurn(
    input: { id: string; tokenHash: string; isNew: boolean },
    operation: (history: Message[]) => Promise<TurnResult>,
  ): Promise<ChatResponse> {
    const cutoff = Date.now() - this.retentionDays * 86400000;
    for (const [id, item] of this.conversations)
      if (item.updatedAt < cutoff && !this.active.has(id)) this.conversations.delete(id);
    const conversation = this.conversations.get(input.id);
    if (!input.isNew && (!conversation || !equalHashes(conversation.tokenHash, input.tokenHash)))
      throw conversationNotFound();
    if (this.active.has(input.id))
      throw new AppError(
        'CONVERSATION_BUSY',
        409,
        'Outra mensagem desta conversa está em processamento.',
      );
    if (input.isNew && this.conversations.size + this.active.size >= this.maxConversations)
      throw new AppError('CAPACITY_REACHED', 503, 'Limite temporário de conversas atingido.');
    this.active.add(input.id);
    try {
      const result = await operation(conversation?.history ?? []);
      this.conversations.set(input.id, {
        tokenHash: input.tokenHash,
        history: [...(conversation?.history ?? []), ...result.messages].slice(-this.maxMessages),
        updatedAt: Date.now(),
      });
      return result.response;
    } finally {
      this.active.delete(input.id);
    }
  }
  async ready(): Promise<void> {}
  async close(): Promise<void> {
    this.conversations.clear();
  }
}
