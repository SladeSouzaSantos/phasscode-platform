import type pg from 'pg';
import type { ChatResponse } from '../../../../packages/contracts/src/index.js';
import type { ConversationStore, Message, TurnResult } from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import { equalHashes } from '../domain/security.js';

export class PostgresConversationStore implements ConversationStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly maxMessages = 12,
    private readonly retentionDays = 7,
  ) {}
  async runTurn(
    input: { id: string; tokenHash: string; isNew: boolean },
    operation: (history: Message[]) => Promise<TurnResult>,
  ): Promise<ChatResponse> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.isNew)
        await client.query('INSERT INTO conversations(id, token_hash) VALUES ($1, $2)', [
          input.id,
          input.tokenHash,
        ]);
      const row = await client.query<{ token_hash: string }>(
        "SELECT token_hash FROM conversations WHERE id = $1 AND token_hash = $3 AND updated_at >= now() - ($2::int * interval '1 day') FOR UPDATE NOWAIT",
        [input.id, this.retentionDays, input.tokenHash],
      );
      if (!row.rows[0] || !equalHashes(row.rows[0].token_hash, input.tokenHash))
        throw conversationNotFound();
      const history = await client.query<Message>(
        'SELECT role, content FROM conversation_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2',
        [input.id, this.maxMessages],
      );
      const result = await operation(history.rows.reverse());
      for (const message of result.messages)
        await client.query(
          'INSERT INTO conversation_messages(conversation_id, role, content) VALUES ($1, $2, $3)',
          [input.id, message.role, message.content],
        );
      await client.query(
        'DELETE FROM conversation_messages WHERE conversation_id = $1 AND id NOT IN (SELECT id FROM conversation_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2)',
        [input.id, this.maxMessages],
      );
      await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [input.id]);
      await client.query('COMMIT');
      return result.response;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error && 'code' in error && error.code === '55P03')
        throw new AppError(
          'CONVERSATION_BUSY',
          409,
          'Outra mensagem desta conversa está em processamento.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async ready(): Promise<void> {
    const result = await this.pool.query(
      "SELECT name FROM schema_migrations WHERE name = '001_conversations.sql'",
    );
    if (result.rowCount !== 1) throw new Error('Migrations pendentes.');
    await this.pool.query('SELECT id FROM conversation_messages LIMIT 0');
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
