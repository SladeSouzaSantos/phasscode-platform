import type pg from 'pg';
import { PostgresMeetingStore } from '../../../apps/orbe-node/src/meetings/postgres-store.js';

export async function retainPrivateData(pool: pg.Pool, meetingRetentionDays: number) {
  const now = new Date();
  const meetings = await new PostgresMeetingStore(pool).retain(
    new Date(now.getTime() - meetingRetentionDays * 86400000),
    now,
  );
  const transactions = await pool.query(
    'DELETE FROM auth_oauth_transactions WHERE expires_at < now()',
  );
  // Keep expired hashes for a bounded replay-detection window, never raw session tokens.
  const sessions = await pool.query(
    "DELETE FROM auth_sessions WHERE absolute_expires_at < now() - interval '1 day'",
  );
  return { meetings, transactions: transactions.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
}
