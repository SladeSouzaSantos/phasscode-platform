import type pg from 'pg';
import type { ChatResponse } from '../../../../packages/contracts/src/index.js';
import type { ConversationStore, Message, TurnResult } from '../domain/ports.js';
import { AppError, conversationNotFound } from '../domain/errors.js';
import { equalHashes } from '../domain/security.js';
import { classifyInteraction } from '../application/report-classification.js';

// Compartilhado por todas as stores que usam o mesmo pool neste processo. Sem fila ilimitada.
const admissions = new WeakMap<pg.Pool, { active: number }>();

export class PostgresConversationStore implements ConversationStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly maxMessages = 12,
    private readonly retentionDays = 7,
    private readonly reportsEnabled = false,
  ) {}
  async runTurn(
    input: { id: string; tokenHash: string; isNew: boolean; analyticsConsent?: boolean },
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
      const row = await client.query<{ token_hash: string; created_at: Date; reports_opt_in: boolean; reports_opted_out: boolean }>(
        "SELECT token_hash, created_at, reports_opt_in, reports_opted_out FROM conversations WHERE id = $1 AND token_hash = $3 AND updated_at >= now() - ($2::int * interval '1 day') FOR UPDATE NOWAIT",
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
      if (this.reportsEnabled) {
        const metadata = row.rows[0]!;
        const optedIn = !metadata.reports_opted_out &&
          (metadata.reports_opt_in || (input.isNew && input.analyticsConsent === true));
        if (optedIn) {
          if (input.isNew && input.analyticsConsent)
            await client.query('UPDATE conversations SET reports_opt_in = true WHERE id = $1', [input.id]);
          const classification = classifyInteraction(result.messages.find(m => m.role === 'user')?.content ?? '');
          // Source identifiers come from the server's verified portfolio catalog.
          const projects = result.response.sources
            .filter(source => source.type === 'project' || source.type === 'platform')
            .map(source => source.id).filter(id => /^[a-z0-9_-]{1,70}$/.test(id)).slice(0, 10);
          const firstAt = metadata.created_at.getTime();
          const index = Math.floor(Math.max(0, Date.now() - firstAt) / 86400000);
          const start = new Date(firstAt + index * 86400000);
          const due = new Date(firstAt + (index + 1) * 86400000);
          await client.query(
            `INSERT INTO orbe_conversation_reports
              (conversation_id, window_index, window_start, due_at, turns, topics, projects, intent)
              VALUES ($1, $2, $3, $4, 1, $5::text[], $6::text[], $7)
              ON CONFLICT (conversation_id, window_index) DO UPDATE SET
                turns = orbe_conversation_reports.turns + 1,
                topics = ARRAY(SELECT DISTINCT x FROM unnest(orbe_conversation_reports.topics || EXCLUDED.topics) AS x ORDER BY x),
                projects = ARRAY(SELECT DISTINCT x FROM unnest(orbe_conversation_reports.projects || EXCLUDED.projects) AS x ORDER BY x),
                intent = CASE
                  WHEN orbe_conversation_reports.intent = 'recrutamento' OR EXCLUDED.intent = 'recrutamento' THEN 'recrutamento'
                  WHEN orbe_conversation_reports.intent = 'contato' OR EXCLUDED.intent = 'contato' THEN 'contato'
                  ELSE 'geral' END
              WHERE orbe_conversation_reports.sent_at IS NULL`,
            [input.id, index, start, due, classification.topics, projects, classification.intent],
          );
        }
      }
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
  async withdrawReport(id: string, tokenHash: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ token_hash: string }>(
        "SELECT token_hash FROM conversations WHERE id=$1 AND token_hash=$2 FOR UPDATE",
        [id, tokenHash],
      );
      if (!row.rows[0] || !equalHashes(row.rows[0].token_hash, tokenHash))
        throw conversationNotFound();
      await client.query(
        'UPDATE conversations SET reports_opt_in=false, reports_opted_out=true WHERE id=$1',
        [id],
      );
      await client.query('DELETE FROM orbe_conversation_reports WHERE conversation_id=$1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
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
