import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { formatConversationReport, formatDailyReport } from './report-format.js';

interface ReportConfig {
  databaseUrl: string;
  botToken: string;
  chatId: string;
  pollMs: number;
}
function configFrom(env: NodeJS.ProcessEnv): ReportConfig {
  if (env.ORBE_REPORTS_ENABLED !== 'true') throw new Error('ORBE_REPORTS_DISABLED');
  if (!env.DATABASE_URL || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    throw new Error('ORBE_REPORTS_CONFIG_MISSING');
  if (!/^-?[0-9]{3,20}$/.test(env.TELEGRAM_CHAT_ID))
    throw new Error('ORBE_REPORTS_CHAT_ID_INVALID');
  const pollMs = Number(env.ORBE_REPORTS_POLL_MS || 60000);
  if (!Number.isSafeInteger(pollMs) || pollMs < 10000 || pollMs > 300000)
    throw new Error('ORBE_REPORTS_POLL_INVALID');
  return {
    databaseUrl: env.DATABASE_URL,
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    pollMs,
  };
}
async function notify(config: ReportConfig, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text: text.slice(0, 4000) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('ORBE_REPORT_TELEGRAM_UNAVAILABLE');
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true)
    throw new Error('ORBE_REPORT_TELEGRAM_UNAVAILABLE');
}

type ReportKind = 'individual' | 'daily';
interface ClaimedRow {
  conversation_id?: string;
  window_index?: number;
  window_start?: Date;
  due_at?: Date;
  turns?: number;
  topics?: string[];
  projects?: string[];
  intent?: string;
  report_day?: string;
  claim_token: string;
}
function tableFor(kind: ReportKind): string {
  return kind === 'individual' ? 'orbe_conversation_reports' : 'orbe_daily_reports';
}
async function claim(pool: pg.Pool, kind: ReportKind): Promise<ClaimedRow | undefined> {
  const client = await pool.connect();
  const table = tableFor(kind);
  try {
    await client.query('BEGIN');
    const found = await client.query<ClaimedRow>(
      `SELECT * FROM ${table} WHERE sent_at IS NULL
        AND attempts < 8 AND next_attempt_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
        ${kind === 'individual' ? 'AND due_at <= now()' : ''}
        ORDER BY ${kind === 'individual' ? 'due_at' : 'report_day'} ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('COMMIT');
      return undefined;
    }
    const token = randomUUID();
    if (kind === 'individual') {
      await client.query(
        `UPDATE orbe_conversation_reports SET claim_token=$3,
          locked_until=now()+interval '2 minutes', attempts=attempts+1
          WHERE conversation_id=$1 AND window_index=$2`,
        [row.conversation_id, row.window_index, token],
      );
    } else {
      await client.query(
        `UPDATE orbe_daily_reports SET claim_token=$2,
          locked_until=now()+interval '2 minutes', attempts=attempts+1
          WHERE report_day=$1`,
        [row.report_day, token],
      );
    }
    await client.query('COMMIT');
    return { ...row, claim_token: token };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
async function mark(
  pool: pg.Pool,
  kind: ReportKind,
  row: ClaimedRow,
  success: boolean,
): Promise<void> {
  const table = tableFor(kind);
  const idConditions =
    kind === 'individual'
      ? 'conversation_id=$1 AND window_index=$2 AND claim_token=$3'
      : 'report_day=$1 AND claim_token=$2';
  const ids: unknown[] =
    kind === 'individual'
      ? [row.conversation_id, row.window_index, row.claim_token]
      : [row.report_day, row.claim_token];
  const next = ids.length + 1;
  await pool.query(
    `UPDATE ${table} SET
      sent_at = CASE WHEN $${next}::boolean THEN now() ELSE sent_at END,
      locked_until=NULL, claim_token=NULL,
      last_error_code = CASE WHEN $${next}::boolean THEN NULL ELSE 'TELEGRAM_UNAVAILABLE' END,
      next_attempt_at = CASE WHEN $${next}::boolean THEN next_attempt_at
        ELSE now() + (LEAST(3600, 60 * power(2, LEAST(attempts, 6))) * interval '1 second') END
      WHERE ${idConditions}`,
    [...ids, success],
  );
}
async function dailyText(pool: pg.Pool, day: string): Promise<string> {
  const result = await pool.query<{
    conversations: string;
    turns: string;
    recruiting: string;
    topics: string[] | null;
  }>(
    `WITH daily AS (
       SELECT conversation_id, turns, intent, topics
       FROM orbe_conversation_reports
       WHERE (window_start AT TIME ZONE 'America/Fortaleza')::date = $1::date
     )
     SELECT COUNT(DISTINCT conversation_id)::text AS conversations,
       COALESCE(SUM(turns),0)::text AS turns,
       COUNT(DISTINCT conversation_id) FILTER (WHERE intent='recrutamento')::text AS recruiting,
       ARRAY(SELECT DISTINCT topic FROM daily d CROSS JOIN LATERAL unnest(d.topics) topic ORDER BY topic) AS topics
     FROM daily`,
    [day],
  );
  const stats = result.rows[0]!;
  return formatDailyReport(
    day,
    Number(stats.conversations),
    Number(stats.turns),
    Number(stats.recruiting),
    stats.topics ?? [],
  );
}
async function deliverOne(pool: pg.Pool, config: ReportConfig, kind: ReportKind): Promise<boolean> {
  const row = await claim(pool, kind);
  if (!row) return false;
  try {
    if (kind === 'individual') {
      // Revocation may occur after claim. Re-check before transmitting any summary.
      const stillAllowed = await pool.query(
        `SELECT 1 FROM orbe_conversation_reports r JOIN conversations c
           ON c.id=r.conversation_id WHERE r.conversation_id=$1
           AND r.window_index=$2 AND r.claim_token=$3
           AND c.reports_opt_in=true AND c.reports_opted_out=false`,
        [row.conversation_id, row.window_index, row.claim_token],
      );
      if (!stillAllowed.rowCount) return true;
      await notify(
        config,
        formatConversationReport({
          windowIndex: row.window_index!,
          windowStart: row.window_start!,
          dueAt: row.due_at!,
          turns: row.turns!,
          topics: row.topics ?? [],
          projects: row.projects ?? [],
          intent: row.intent ?? 'geral',
        }),
      );
    } else {
      await notify(config, await dailyText(pool, row.report_day!));
    }
    await mark(pool, kind, row, true);
  } catch {
    // No provider response bodies, Telegram URLs, credentials or visitor details in logs.
    await mark(pool, kind, row, false);
  }
  return true;
}

async function run(): Promise<void> {
  const config = configFrom(process.env);
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  });
  let stopping = false;
  let running = false;
  const onStop = () => {
    stopping = true;
  };
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);
  const tick = async () => {
    if (stopping || running) return;
    running = true;
    try {
      // One digest of the previous Fortaleza day, from 09:00 onwards.
      await pool.query(
        `INSERT INTO orbe_daily_reports(report_day)
         SELECT ((now() AT TIME ZONE 'America/Fortaleza')::date - 1)
         WHERE (now() AT TIME ZONE 'America/Fortaleza')::time >= time '09:00'
         ON CONFLICT DO NOTHING`,
      );
      for (let i = 0; i < 20 && !stopping; i++) {
        if (!(await deliverOne(pool, config, 'individual'))) break;
      }
      if (!stopping) await deliverOne(pool, config, 'daily');
    } catch {
      console.error('ORBE_REPORT_DISPATCH_UNAVAILABLE');
    } finally {
      running = false;
    }
  };
  try {
    await pool.query('SELECT 1 FROM orbe_conversation_reports LIMIT 0');
    await tick();
    while (!stopping) {
      await new Promise<void>((resolve) => setTimeout(resolve, config.pollMs));
      if (!stopping) await tick();
    }
  } finally {
    await pool.end();
  }
}
run().catch(() => {
  console.error('ORBE_REPORTER_START_FAILED');
  process.exitCode = 1;
});
