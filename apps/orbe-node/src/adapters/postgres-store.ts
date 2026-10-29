import type pg from 'pg';
import type { ChatResponse } from '../../../../packages/contracts/src/index.js';
import type { ConversationStore, Message, TurnResult } from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import { equalHashes } from '../domain/security.js';

// Compartilhado por todas as stores que usam o mesmo pool neste processo. Sem fila ilimitada.
const admissions = new WeakMap<pg.Pool, { active: number }>();

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
    let admission = admissions.get(this.pool);
    if (!admission) {
      admission = { active: 0 };
      admissions.set(this.pool, admission);
    }
    // Reserva duas conexões para consultas/readiness no pool padrão (10). Um pool de tamanho
    // 1 continua utilizável, mas não pode oferecer essa reserva; não é a configuração do runtime.
    const capacity = Math.max(1, (this.pool.options.max ?? 10) - 2);
    if (admission.active >= capacity)
      throw new AppError(
        'CHAT_CAPACITY_REACHED',
        503,
        'O chat está ocupado. Tente novamente em instantes.',
        1,
      );
    admission.active++;
    let client: pg.PoolClient | undefined;
    try {
      try {
        client = await this.pool.connect();
      } catch {
        throw new AppError(
          'DB_UNAVAILABLE',
          503,
          'O histórico de conversas está temporariamente indisponível.',
          1,
        );
      }
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
      if (result.insight)
        await client.query(
          'INSERT INTO conversation_insights(conversation_id, intent, summary, topics, turns) ' +
          'VALUES ($1, $2, $3, $4::text[], 1) ' +
          'ON CONFLICT (conversation_id) DO UPDATE SET ' +
          'intent = EXCLUDED.intent, summary = EXCLUDED.summary, topics = EXCLUDED.topics, ' +
          'turns = conversation_insights.turns + 1, updated_at = now()',
          [input.id, result.insight.intent, result.insight.summary, result.insight.topics],
        );
      await client.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [input.id]);
      await client.query('COMMIT');
      return result.response;
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error && 'code' in error && error.code === '55P03')
        throw new AppError(
          'CONVERSATION_BUSY',
          409,
          'Outra mensagem desta conversa está em processamento.',
        );
      throw error;
    } finally {
      try {
        client?.release();
      } finally {
        admission.active--;
      }
    }
  }
  async ready(): Promise<void> {
    const result = await this.pool.query(
      "SELECT name FROM schema_migrations WHERE name = '001_conversations.sql'",
    );
    if (result.rowCount !== 1) throw new Error('Migrations pendentes.');
    await this.pool.query('SELECT id FROM conversation_messages LIMIT 0');
    await this.pool.query('SELECT conversation_id FROM conversation_insights LIMIT 0');
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
