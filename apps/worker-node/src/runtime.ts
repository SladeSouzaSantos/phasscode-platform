import { Queue, WaitingError, Worker } from 'bullmq';
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
export class WorkerStartupError extends Error {
  constructor(
    readonly cleanupComplete: boolean,
    readonly cancelled = false,
  ) {
    super('WORKER_START_FAILED');
  }
}

class WorkerStartupCancellation extends Error {
  constructor() {
    super('WORKER_START_ABORTED');
  }
}

export class WorkerStoppingError extends Error {
  constructor() {
    super('WORKER_STOPPING');
  }
}

export async function startWorker(
  config: WorkerConfig,
  pool: pg.Pool,
  meetings: MeetingJobs,
  senders: readonly NotificationSender[],
  options: { signal?: AbortSignal } = {},
) {
  let queue: Queue | undefined;
  let worker: Worker | undefined;
  let processor: OutboxProcessor | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopping = false;
  let allocationUncertain = false;
  let cleanupFailed = false;
  let runFailed = false;
  let startupWorkFailed = false;
  let dispatchFlight: Promise<void> | undefined;
  let pauseFlight: Promise<void> | undefined;
  let runFlight: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let rejectStartup: ((reason: Error) => void) | undefined;
  const jobs = new Set<Promise<void>>();
  const startupFlights = new Set<Promise<unknown>>();
  const signal = options.signal;

  const beginDrain = () => {
    stopping = true;
    clearInterval(timer);
    if (worker && !pauseFlight) {
      try {
        // This pauses only this consumer, never the shared Redis queue.
        pauseFlight = worker.pause(false).catch(() => {
          cleanupFailed = true;
        });
      } catch {
        cleanupFailed = true;
        pauseFlight = Promise.resolve();
      }
    }
  };
  const onAbort = () => {
    beginDrain();
    rejectStartup?.(new WorkerStartupCancellation());
  };
  const close = (): Promise<void> => {
    beginDrain();
    if (closing) return closing;
    closing = (async () => {
      await Promise.all([pauseFlight, dispatchFlight]);
      while (jobs.size) await Promise.allSettled([...jobs]);
      try {
        await worker?.close();
      } catch {
        cleanupFailed = true;
      }
      try {
        await queue?.close();
      } catch {
        cleanupFailed = true;
      }
      await runFlight;
      // Closing Redis can settle pending readiness; never certify orphaned startup work.
      while (startupFlights.size) await Promise.allSettled([...startupFlights]);
      signal?.removeEventListener('abort', onAbort);
      if (cleanupFailed || allocationUncertain) throw new Error('WORKER_SHUTDOWN_FAILED');
    })();
    return closing;
  };
  const checkStarting = () => {
    if (stopping || signal?.aborted) throw new WorkerStartupCancellation();
    if (runFailed) throw new Error('WORKER_START_FAILED');
  };
  const trackStartup = <T>(pending: Promise<T>): Promise<T> => {
    startupFlights.add(pending);
    const settled = () => {
      startupFlights.delete(pending);
    };
    void pending.then(settled, (error: unknown) => {
      if (!(error instanceof WorkerStartupCancellation)) startupWorkFailed = true;
      settled();
    });
    return pending;
  };
  const duringStartup = async <T>(operation: () => Promise<T>): Promise<T> => {
    checkStarting();
    const abort = new Promise<never>((_resolve, reject) => {
      rejectStartup = reject;
    });
    const pending = trackStartup(
      Promise.resolve().then(() => {
        checkStarting();
        return operation();
      }),
    );
    try {
      return await Promise.race([pending, abort]);
    } finally {
      rejectStartup = undefined;
    }
  };
  const tick = (): Promise<void> => {
    if (stopping) return Promise.resolve();
    if (dispatchFlight) return dispatchFlight;
    const activeProcessor = processor;
    const pending = Promise.resolve()
      .then(async () => {
        if (!stopping) await activeProcessor!.dispatchDue();
      })
      .catch(() => {
        /* SQL remains authoritative; no sensitive dispatcher diagnostics. */
      });
    dispatchFlight = pending;
    void pending.then(() => {
      if (dispatchFlight === pending) dispatchFlight = undefined;
    });
    return pending;
  };
  const onResourceError = () => {
    if (stopping) cleanupFailed = true;
    /* no driver, URL, tokens or visitor content */
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    checkStarting();
    if (!config.WORKER_ENABLED) throw new Error('WORKER_DISABLED');
    const connection = redisConnection(config.REDIS_URL!);
    allocationUncertain = true;
    queue = new Queue('phasscode-meetings', { connection });
    allocationUncertain = false;
    queue.on('error', onResourceError);
    checkStarting();
    processor = new OutboxProcessor(pool, meetings, senders, config, queue);
    const activeProcessor = processor;
    allocationUncertain = true;
    worker = new Worker(
      'phasscode-meetings',
      (job, token) => {
        const pending = Promise.resolve().then(async () => {
          if (stopping) {
            try {
              // Omitting the token would bypass BullMQ's ownership check.
              if (typeof token !== 'string' || token.length === 0 || token === '0')
                throw new Error('WORKER_JOB_HANDOFF_FAILED');
              await job.moveToWait(token);
            } catch {
              cleanupFailed = true;
              throw new Error('WORKER_JOB_HANDOFF_FAILED');
            }
            // The job already returned to wait; BullMQ must neither fail nor complete it.
            throw new WaitingError();
          }
          try {
            const payload = z.strictObject({ outboxId: z.uuid() }).parse(job.data);
            await activeProcessor.process(payload.outboxId);
          } catch {
            throw new Error('WORKER_JOB_FAILED');
          }
        });
        jobs.add(pending);
        return pending.finally(() => {
          jobs.delete(pending);
        });
      },
      { connection, concurrency: 4, autorun: false },
    );
    allocationUncertain = false;
    worker.on('error', onResourceError);
    const activeQueue = queue;
    const activeWorker = worker;
    await duringStartup(() => {
      const queueReady = trackStartup(
        Promise.resolve().then(() => {
          checkStarting();
          return activeQueue.waitUntilReady();
        }),
      );
      const workerReady = trackStartup(
        Promise.resolve().then(() => {
          checkStarting();
          return activeWorker.waitUntilReady();
        }),
      );
      return Promise.all([queueReady, workerReady]);
    });
    checkStarting();
    runFlight = activeWorker.run().catch(() => {
      runFailed = true;
    });
    await duringStartup(tick);
    checkStarting();
    timer = setInterval(() => {
      void tick();
    }, config.OUTBOX_POLL_MS);
    return {
      processor,
      ready: async () => {
        if (stopping) throw new WorkerStoppingError();
        if (runFailed) throw new Error('WORKER_UNAVAILABLE');
        const client = await activeQueue.client;
        if (stopping) throw new WorkerStoppingError();
        await client.get('phasscode:worker:health');
        if (stopping) throw new WorkerStoppingError();
        await pool.query('SELECT id FROM meeting_outbox LIMIT 0');
        if (stopping) throw new WorkerStoppingError();
        if (runFailed || !activeWorker.isRunning()) throw new Error('WORKER_UNAVAILABLE');
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch {
      throw new WorkerStartupError(false);
    }
    throw new WorkerStartupError(
      true,
      error instanceof WorkerStartupCancellation && !startupWorkFailed,
    );
  }
}
