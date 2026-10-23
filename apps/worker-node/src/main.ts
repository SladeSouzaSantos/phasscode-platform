import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../../packages/shared-config/src/index.js';
import { createPool } from '../../../packages/database/src/pool.js';
import { retainPrivateData } from '../../../packages/database/src/privacy-retention.js';
import { createCalendar } from '../../../packages/integrations/src/calendar.js';
import { createNotificationSenders } from '../../../packages/integrations/src/notifications.js';
import { MeetingService } from '../../orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../../orbe-node/src/meetings/postgres-store.js';
import { startWorker } from './runtime.js';

const heartbeatPath = join(tmpdir(), 'phasscode-worker-heartbeat');
try {
  const config = loadConfig();
  if (!config.worker.WORKER_ENABLED) throw new Error('Worker não habilitado.');
  const pool = createPool(config.DATABASE_URL!);
  try {
    await pool.query('SELECT 1 FROM meeting_outbox, notification_deliveries LIMIT 0');
    const meetings = new MeetingService(
      config.meetings,
      new PostgresMeetingStore(pool),
      createCalendar(config.calendar),
    );
    const runtime = await startWorker(
      config.worker,
      pool,
      meetings,
      createNotificationSenders(config.worker),
    );
    let writing = false;
    let lastRetention = 0;
    const heartbeat = async () => {
      if (writing) return;
      writing = true;
      try {
        await runtime.ready();
        await pool.query('SELECT 1');
        if (Date.now() - lastRetention > 3600000) {
          await retainPrivateData(pool, config.meetings.retentionDays);
          lastRetention = Date.now();
        }
        await writeFile(heartbeatPath, String(Date.now()), { mode: 0o600 });
      } catch {
        /* Expiration of the heartbeat makes the Docker healthcheck fail. */
      } finally {
        writing = false;
      }
    };
    await heartbeat();
    const timer = setInterval(() => {
      void heartbeat();
    }, 10000);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => {
        if (stopping) return;
        stopping = true;
        clearInterval(timer);
        void runtime
          .close()
          .finally(async () => {
            await pool.end();
            await unlink(heartbeatPath).catch(() => undefined);
          })
          .catch(() => {
            process.exitCode = 1;
          });
      });
  } catch (error) {
    await pool.end();
    throw error;
  }
} catch {
  console.error('Falha ao iniciar worker. Verifique configuração, migrations e dependências.');
  process.exitCode = 1;
}
