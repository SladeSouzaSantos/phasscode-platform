import { loadConfig } from '../../shared-config/src/index.js';
import { createPool } from './pool.js';
import { retainPrivateData } from './privacy-retention.js';

const config = loadConfig();
if (!config.DATABASE_URL) throw new Error('Configure DATABASE_URL.');
const pool = createPool(config.DATABASE_URL);
try {
  const result = await pool.query(
    "DELETE FROM conversations WHERE updated_at < now() - ($1::int * interval '1 day')",
    [config.CHAT_RETENTION_DAYS],
  );
  console.info(`Conversas expiradas removidas: ${result.rowCount ?? 0}`);
  // The conversation table cascade removes all opt-in report windows after retention.
  await pool.query("DELETE FROM orbe_daily_reports WHERE report_day < current_date - interval '30 days'");
  const privateData = await retainPrivateData(pool, config.meetings.retentionDays);
  console.info({ event: 'private_retention', ...privateData });
} catch {
  console.error('Falha na limpeza de retenção.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
