import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import type pg from 'pg';
import type { WorkerConfig } from '../../../packages/shared-config/src/worker.js';
import type { NotificationSender } from '../../../packages/integrations/src/notifications.js';
import { OutboxProcessor, type MeetingJobs } from './outbox.js';

export function redisConnection(url: string) {
  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('URL Redis inválida.');
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0 || db > 15) throw new Error('Banco Redis inválido.');
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    db,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
export async function startWorker(
  config: WorkerConfig,
  pool: pg.Pool,
  meetings: MeetingJobs,
  senders: readonly NotificationSender[],
) {
  if (!config.WORKER_ENABLED) throw new Error('Worker não foi habilitado explicitamente.');
  const connection = redisConnection(config.REDIS_URL!);
  const queue = new Queue('phasscode-meetings', { connection });
  const processor = new OutboxProcessor(pool, meetings, senders, config, queue);
  const worker = new Worker(
    'phasscode-meetings',
    async (job) => {
      try {
        const payload = z.strictObject({ outboxId: z.uuid() }).parse(job.data);
        await processor.process(payload.outboxId);
      } catch {
        throw new Error('WORKER_JOB_FAILED');
      }
    },
    { connection, concurrency: 4 },
  );
  queue.on('error', () => {
    /* no driver, URL, tokens or visitor content */
  });
  worker.on('error', () => {
    /* SQL outbox is retried by the dispatcher */
  });
  let dispatching = false;
  const tick = async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      await processor.dispatchDue();
    } catch {
      /* no sensitive diagnostics */
    } finally {
      dispatching = false;
    }
  };
  await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
  await tick();
  const timer = setInterval(() => {
    void tick();
  }, config.OUTBOX_POLL_MS);
  return {
    processor,
    ready: async () => {
      await (await queue.client).get('phasscode:worker:health');
      await pool.query('SELECT id FROM meeting_outbox LIMIT 0');
      if (!worker.isRunning()) throw new Error('Worker indisponível.');
    },
    close: async () => {
      clearInterval(timer);
      await worker.close();
      await queue.close();
    },
  };
}
