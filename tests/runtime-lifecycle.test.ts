import type pg from 'pg';
import { WaitingError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startWorker,
  WorkerStartupError,
  WorkerStoppingError,
} from '../apps/worker-node/src/runtime.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';

const doubles = vi.hoisted(() => ({
  queue: vi.fn(),
  worker: vi.fn(),
  dispatch: vi.fn(),
  process: vi.fn(),
}));
vi.mock('bullmq', async (importOriginal) => {
  const { WaitingError } = await importOriginal<typeof import('bullmq')>();
  return {
    WaitingError,
    Queue: vi.fn(function (...args: unknown[]) {
      return doubles.queue(...args);
    }),
    Worker: vi.fn(function (...args: unknown[]) {
      return doubles.worker(...args);
    }),
  };
});
vi.mock('../apps/worker-node/src/outbox.js', () => ({
  OutboxProcessor: class {
    dispatchDue() {
      return doubles.dispatch();
    }
    process(id: string) {
      return doubles.process(id);
    }
  },
}));

function deferred<T = void>() {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = (value) => accept(value as T | PromiseLike<T>);
    reject = decline;
  });
  return { promise, resolve, reject };
}
async function until(condition: () => boolean) {
  for (let turn = 0; turn < 100; turn++) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('SYNTHETIC_CONDITION_NOT_REACHED');
}
async function flush() {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

const config = loadWorkerConfig({
  NODE_ENV: 'test',
  WORKER_ENABLED: 'true',
  REDIS_URL: 'redis://synthetic.invalid:6379',
  DATABASE_URL: 'postgresql://synthetic.invalid/test',
  NOTIFICATION_MODE: 'fake',
  OUTBOX_POLL_MS: '100',
});
const meetings = {
  processCalendarCreate: vi.fn(),
  processCalendarCancel: vi.fn(),
  processCalendarFailure: vi.fn(),
  getNotification: vi.fn(),
};
const query = vi.fn();
const pool = { query } as unknown as pg.Pool;
let events: string[];
let runLoop: ReturnType<typeof deferred>;
let queue: ReturnType<typeof fakeQueue>;
let worker: ReturnType<typeof fakeWorker>;
let processJob: (
  job: { data: unknown; moveToWait?: (token: string) => Promise<number> },
  token?: string,
) => Promise<void>;
let workerOptions: { autorun?: boolean; concurrency?: number };
const errors = { queue: [] as Array<() => void>, worker: [] as Array<() => void> };

function fakeQueue() {
  return {
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'error') errors.queue.push(listener);
    }),
    waitUntilReady: vi.fn(async (): Promise<void> => undefined),
    client: Promise.resolve({ get: vi.fn(async () => null) }),
    close: vi.fn(async () => {
      events.push('queue-close');
    }),
  };
}
function fakeWorker() {
  return {
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'error') errors.worker.push(listener);
    }),
    waitUntilReady: vi.fn(async (): Promise<void> => undefined),
    run: vi.fn(() => runLoop.promise),
    pause: vi.fn(async (doNotWaitActive: boolean) => {
      events.push(doNotWaitActive ? 'unexpected-force-pause' : 'local-pause');
    }),
    isRunning: vi.fn(() => true),
    close: vi.fn(async () => {
      events.push('worker-close');
      runLoop.resolve();
    }),
  };
}
const start = (signal?: AbortSignal) =>
  signal
    ? startWorker(config, pool, meetings, [], { signal })
    : startWorker(config, pool, meetings, []);
const syntheticToken = 'synthetic-worker:1';
function acquiredJob() {
  return {
    data: { outboxId: 'a6c07e8d-d9cd-4075-b235-d46ede5763ab' },
    attemptsMade: 0,
    attemptsStarted: 1,
    moveToWait: vi.fn<(token: string) => Promise<number>>().mockResolvedValue(0),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  doubles.dispatch.mockReset().mockResolvedValue(0);
  doubles.process.mockReset().mockResolvedValue(undefined);
  query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  events = [];
  errors.queue.length = 0;
  errors.worker.length = 0;
  runLoop = deferred();
  queue = fakeQueue();
  worker = fakeWorker();
  doubles.queue.mockReset().mockImplementation(() => queue);
  doubles.worker.mockReset().mockImplementation((_name, processor, options) => {
    processJob = processor;
    workerOptions = options;
    return worker;
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('worker runtime lifecycle with no real clients or providers', () => {
  it('preserves the four-argument API and starts the consumer explicitly', async () => {
    const runtime = await start();
    expect(workerOptions).toMatchObject({ autorun: false, concurrency: 4 });
    expect(worker.run).toHaveBeenCalledOnce();
    expect(doubles.dispatch).toHaveBeenCalledOnce();
    await runtime.ready();
    expect(query).toHaveBeenCalledWith('SELECT id FROM meeting_outbox LIMIT 0');
    await runtime.close();
    expect(events).toEqual(['local-pause', 'worker-close', 'queue-close']);
  });

  it('rejects an already aborted startup before allocating resources', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(start(controller.signal)).rejects.toMatchObject({
      message: 'WORKER_START_FAILED',
      cleanupComplete: true,
      cancelled: true,
    });
    expect(doubles.queue).not.toHaveBeenCalled();
    expect(doubles.worker).not.toHaveBeenCalled();
  });

  it('keeps the consumer stopped until both readiness promises finish', async () => {
    const ready = deferred();
    worker.waitUntilReady.mockReturnValue(ready.promise);
    const starting = start();
    await until(() => worker.waitUntilReady.mock.calls.length === 1);
    expect(worker.run).not.toHaveBeenCalled();
    expect(doubles.dispatch).not.toHaveBeenCalled();
    ready.resolve();
    await (await starting).close();
  });

  it('aborts pending readiness and cleans both resources before startup rejects', async () => {
    const controller = new AbortController();
    const ready = deferred();
    worker.waitUntilReady.mockReturnValue(ready.promise);
    worker.close.mockImplementationOnce(async () => {
      events.push('worker-close');
      ready.resolve();
      runLoop.resolve();
    });
    const starting = start(controller.signal);
    const outcome = expect(starting).rejects.toMatchObject({
      cleanupComplete: true,
      cancelled: true,
    });
    await until(() => worker.waitUntilReady.mock.calls.length === 1);
    controller.abort();
    await outcome;
    expect(worker.run).not.toHaveBeenCalled();
    expect(doubles.dispatch).not.toHaveBeenCalled();
    expect(events).toEqual(['local-pause', 'worker-close', 'queue-close']);
  });

  it('does not certify abort cleanup while a readiness promise remains unsettled', async () => {
    const controller = new AbortController();
    const ready = deferred();
    worker.waitUntilReady.mockReturnValue(ready.promise);
    let settled = false;
    const outcome = start(controller.signal).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await until(() => worker.waitUntilReady.mock.calls.length === 1);
    controller.abort();
    await until(() => queue.close.mock.calls.length === 1);
    await flush();
    expect(settled).toBe(false);
    expect(worker.run).not.toHaveBeenCalled();
    ready.reject(new Error('synthetic readiness closed'));
    expect(await outcome).toMatchObject({ cleanupComplete: true, cancelled: false });
  });

  it('joins the other readiness promise after the first readiness check fails', async () => {
    const ready = deferred();
    queue.waitUntilReady.mockRejectedValueOnce(new Error('synthetic queue readiness error'));
    worker.waitUntilReady.mockReturnValue(ready.promise);
    let settled = false;
    const outcome = start().catch((error: unknown) => {
      settled = true;
      return error;
    });
    await until(() => queue.close.mock.calls.length === 1);
    await flush();
    expect(settled).toBe(false);
    expect(worker.run).not.toHaveBeenCalled();
    ready.resolve();
    expect(await outcome).toMatchObject({ cleanupComplete: true, cancelled: false });
  });

  it('does not run a startup operation queued before abort', async () => {
    const controller = new AbortController();
    const starting = start(controller.signal);
    const outcome = expect(starting).rejects.toMatchObject({
      cleanupComplete: true,
      cancelled: true,
    });
    controller.abort();
    await outcome;
    expect(queue.waitUntilReady).not.toHaveBeenCalled();
    expect(worker.waitUntilReady).not.toHaveBeenCalled();
    expect(worker.run).not.toHaveBeenCalled();
    expect(doubles.dispatch).not.toHaveBeenCalled();
  });

  it('cleans resources after a readiness rejection', async () => {
    queue.waitUntilReady.mockRejectedValue(new Error('synthetic private driver error'));
    await expect(start()).rejects.toMatchObject({
      message: 'WORKER_START_FAILED',
      cleanupComplete: true,
      cancelled: false,
    });
    expect(worker.run).not.toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalledOnce();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('reports uncertain partial allocation if the queue constructor throws', async () => {
    doubles.queue.mockImplementation(() => {
      throw new Error('synthetic constructor failure');
    });
    await expect(start()).rejects.toMatchObject({ cleanupComplete: false });
    expect(doubles.worker).not.toHaveBeenCalled();
  });

  it('closes the queue and reports uncertainty if the worker constructor throws', async () => {
    doubles.worker.mockImplementation(() => {
      throw new Error('synthetic constructor failure');
    });
    await expect(start()).rejects.toMatchObject({ cleanupComplete: false });
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('does not allocate a consumer after abort in queue construction', async () => {
    const controller = new AbortController();
    doubles.queue.mockImplementation(() => {
      controller.abort();
      return queue;
    });
    await expect(start(controller.signal)).rejects.toMatchObject({ cleanupComplete: true });
    expect(doubles.worker).not.toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('joins dispatch started during startup before abort cleanup completes', async () => {
    const controller = new AbortController();
    const dispatch = deferred<number>();
    doubles.dispatch.mockReturnValueOnce(dispatch.promise);
    const starting = start(controller.signal);
    let settled = false;
    const outcome = starting.catch((error: unknown) => {
      settled = true;
      return error;
    });
    await until(() => doubles.dispatch.mock.calls.length === 1);
    controller.abort();
    await flush();
    expect(settled).toBe(false);
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    dispatch.resolve(0);
    expect(await outcome).toMatchObject({ cleanupComplete: true });
    expect(events).toEqual(['local-pause', 'worker-close', 'queue-close']);
  });

  it('only pauses locally on abort after startup, leaving resources for explicit close', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    controller.abort();
    expect(worker.pause).toHaveBeenCalledExactlyOnceWith(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(doubles.dispatch).toHaveBeenCalledOnce();
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('shares the exact close promise and closes each resource once', async () => {
    const runtime = await start();
    const first = runtime.close();
    const second = runtime.close();
    expect(first).toBe(second);
    await first;
    expect(worker.pause).toHaveBeenCalledOnce();
    expect(worker.close).toHaveBeenCalledOnce();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('joins a periodic dispatch, prevents overlap and blocks future dispatch synchronously', async () => {
    const runtime = await start();
    const dispatch = deferred<number>();
    doubles.dispatch.mockReturnValueOnce(dispatch.promise);
    await vi.advanceTimersByTimeAsync(500);
    expect(doubles.dispatch).toHaveBeenCalledTimes(2);
    const closing = runtime.close();
    await vi.advanceTimersByTimeAsync(10000);
    expect(doubles.dispatch).toHaveBeenCalledTimes(2);
    expect(worker.close).not.toHaveBeenCalled();
    dispatch.resolve(0);
    await closing;
    expect(events).toEqual(['local-pause', 'worker-close', 'queue-close']);
  });

  it('joins tracked jobs even if the consumer pause promise already resolved', async () => {
    const runtime = await start();
    const sending = deferred();
    doubles.process.mockReturnValueOnce(sending.promise);
    const job = processJob({ data: { outboxId: 'a6c07e8d-d9cd-4075-b235-d46ede5763ab' } });
    await until(() => doubles.process.mock.calls.length === 1);
    const closing = runtime.close();
    await flush();
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    sending.resolve();
    await job;
    await closing;
  });

  it('returns a job delivered after abort to wait without a business failure', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    const job = acquiredJob();
    controller.abort();
    await expect(processJob(job, syntheticToken)).rejects.toBeInstanceOf(WaitingError);
    expect(job.moveToWait).toHaveBeenCalledExactlyOnceWith(syntheticToken);
    expect(job.attemptsMade).toBe(0);
    expect(job.attemptsStarted).toBe(1);
    expect(doubles.process).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('hands off an acquired job if abort wins before its processor microtask', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    const job = acquiredJob();
    const processing = processJob(job, syntheticToken);
    const outcome = expect(processing).rejects.toBeInstanceOf(WaitingError);
    controller.abort();
    await outcome;
    expect(job.moveToWait).toHaveBeenCalledExactlyOnceWith(syntheticToken);
    expect(doubles.process).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('hands off without waiting for a pending local pause to finish', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    const pause = deferred();
    worker.pause.mockReturnValueOnce(pause.promise);
    controller.abort();
    const job = acquiredJob();
    await expect(processJob(job, syntheticToken)).rejects.toBeInstanceOf(WaitingError);
    expect(job.moveToWait).toHaveBeenCalledOnce();
    const closing = runtime.close();
    await flush();
    expect(worker.close).not.toHaveBeenCalled();
    pause.resolve();
    await closing;
  });

  it('joins an in-flight handoff before closing its worker or queue', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    controller.abort();
    const handoff = deferred<number>();
    const job = acquiredJob();
    job.moveToWait.mockReturnValueOnce(handoff.promise);
    const outcome = expect(processJob(job, syntheticToken)).rejects.toBeInstanceOf(WaitingError);
    await until(() => job.moveToWait.mock.calls.length === 1);
    const closing = runtime.close();
    await flush();
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    handoff.resolve(0);
    await outcome;
    await closing;
  });

  it('does not hand off a job whose business processing already began', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    const provider = deferred();
    doubles.process.mockReturnValueOnce(provider.promise);
    const job = acquiredJob();
    const processing = processJob(job, syntheticToken);
    await until(() => doubles.process.mock.calls.length === 1);
    controller.abort();
    const closing = runtime.close();
    await flush();
    expect(job.moveToWait).not.toHaveBeenCalled();
    expect(worker.close).not.toHaveBeenCalled();
    provider.resolve();
    await processing;
    await closing;
  });

  it.each([undefined, '', '0'])(
    'rejects unsafe handoff token %s without bypassing ownership',
    async (token) => {
      const controller = new AbortController();
      const runtime = await start(controller.signal);
      controller.abort();
      const job = acquiredJob();
      const failure: unknown = await processJob(job, token).catch((error: unknown) => error);
      expect(failure).toMatchObject({ message: 'WORKER_JOB_HANDOFF_FAILED' });
      expect(failure).not.toBeInstanceOf(WaitingError);
      expect(job.moveToWait).not.toHaveBeenCalled();
      expect(doubles.process).not.toHaveBeenCalled();
      await expect(runtime.close()).rejects.toThrow('WORKER_SHUTDOWN_FAILED');
    },
  );

  it('does not claim a waiting transition when the handoff rejects', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    controller.abort();
    const job = acquiredJob();
    job.moveToWait.mockRejectedValueOnce(new Error('synthetic lost lock'));
    const failure: unknown = await processJob(job, syntheticToken).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'WORKER_JOB_HANDOFF_FAILED' });
    expect(failure).not.toBeInstanceOf(WaitingError);
    expect(doubles.process).not.toHaveBeenCalled();
    await expect(runtime.close()).rejects.toThrow('WORKER_SHUTDOWN_FAILED');
  });

  it('preserves ordinary business failures instead of treating them as shutdown handoffs', async () => {
    const runtime = await start();
    const job = acquiredJob();
    doubles.process.mockRejectedValueOnce(new WaitingError());
    const failure: unknown = await processJob(job, syntheticToken).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'WORKER_JOB_FAILED' });
    expect(failure).not.toBeInstanceOf(WaitingError);
    expect(job.moveToWait).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('waits for local pause before closing worker and queue', async () => {
    const runtime = await start();
    const pause = deferred();
    worker.pause.mockReturnValueOnce(pause.promise);
    const closing = runtime.close();
    await flush();
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    pause.resolve();
    await closing;
  });

  it('attempts resource cleanup but reports a rejected local pause as shutdown failure', async () => {
    const runtime = await start();
    worker.pause.mockRejectedValueOnce(new Error('synthetic private pause error'));
    await expect(runtime.close()).rejects.toThrow('WORKER_SHUTDOWN_FAILED');
    expect(worker.close).toHaveBeenCalledOnce();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('still attempts queue cleanup when worker close rejects', async () => {
    const runtime = await start();
    worker.close.mockImplementationOnce(async () => {
      events.push('worker-close');
      runLoop.resolve();
      throw new Error('synthetic private close error');
    });
    await expect(runtime.close()).rejects.toThrow('WORKER_SHUTDOWN_FAILED');
    expect(events).toEqual(['local-pause', 'worker-close', 'queue-close']);
  });

  it('reports startup cleanup failure instead of permitting pool disposal', async () => {
    queue.waitUntilReady.mockRejectedValueOnce(new Error('synthetic readiness error'));
    queue.close.mockRejectedValueOnce(new Error('synthetic cleanup error'));
    await expect(start()).rejects.toBeInstanceOf(WorkerStartupError);
    queue.waitUntilReady.mockRejectedValueOnce(new Error('synthetic readiness error'));
    queue.close.mockRejectedValueOnce(new Error('synthetic cleanup error'));
    await expect(start()).rejects.toMatchObject({ cleanupComplete: false });
  });

  it('does not certify shutdown when a resource emits an error while closing', async () => {
    const runtime = await start();
    worker.pause.mockImplementationOnce(async () => {
      errors.worker[0]!();
    });
    await expect(runtime.close()).rejects.toThrow('WORKER_SHUTDOWN_FAILED');
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('cleans up when the explicit consumer loop fails during startup', async () => {
    worker.run.mockRejectedValueOnce(new Error('synthetic run error'));
    await expect(start()).rejects.toMatchObject({ cleanupComplete: true });
    expect(worker.close).toHaveBeenCalledOnce();
    expect(queue.close).toHaveBeenCalledOnce();
  });

  it('keeps resources open for an in-flight readiness check after abort', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    const response = deferred<null>();
    const client = await queue.client;
    client.get.mockReturnValueOnce(response.promise);
    const readiness = expect(runtime.ready()).rejects.toBeInstanceOf(WorkerStoppingError);
    await until(() => client.get.mock.calls.length === 1);
    controller.abort();
    expect(worker.close).not.toHaveBeenCalled();
    expect(queue.close).not.toHaveBeenCalled();
    response.resolve(null);
    await readiness;
    expect(query).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('uses the stopping marker only for intentional readiness cancellation', async () => {
    const controller = new AbortController();
    const runtime = await start(controller.signal);
    controller.abort();
    await expect(runtime.ready()).rejects.toBeInstanceOf(WorkerStoppingError);
    await expect(runtime.ready()).rejects.toThrow('WORKER_STOPPING');
    expect(query).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('keeps an unavailable consumer distinct from intentional stopping', async () => {
    const runtime = await start();
    worker.isRunning.mockReturnValue(false);
    const failure: unknown = await runtime.ready().catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'WORKER_UNAVAILABLE' });
    expect(failure).not.toBeInstanceOf(WorkerStoppingError);
    await runtime.close();
  });

  it('keeps consumer-loop failure distinct from intentional stopping', async () => {
    const runtime = await start();
    runLoop.reject(new Error('synthetic loop failure'));
    await flush();
    const failure: unknown = await runtime.ready().catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'WORKER_UNAVAILABLE' });
    expect(failure).not.toBeInstanceOf(WorkerStoppingError);
    await runtime.close();
  });

  it('does not relabel a real probe failure as intentional stopping', async () => {
    const runtime = await start();
    const client = await queue.client;
    const expected = new Error('synthetic probe failure');
    client.get.mockRejectedValueOnce(expected);
    const failure: unknown = await runtime.ready().catch((error: unknown) => error);
    expect(failure).toBe(expected);
    expect(failure).not.toBeInstanceOf(WorkerStoppingError);
    await runtime.close();
  });

  it('never retries dispatch after stop, while an ordinary dispatch failure remains recoverable', async () => {
    doubles.dispatch.mockRejectedValueOnce(new Error('synthetic private SQL error'));
    const runtime = await start();
    await vi.advanceTimersByTimeAsync(100);
    expect(doubles.dispatch).toHaveBeenCalledTimes(2);
    await runtime.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(doubles.dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not force pending closure after the old 45 second grace period', async () => {
    const runtime = await start();
    const closure = deferred();
    worker.close.mockImplementationOnce(() => closure.promise);
    let settled = false;
    const closing = runtime.close().then(() => {
      settled = true;
    });
    await until(() => worker.close.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(45001);
    expect(settled).toBe(false);
    expect(queue.close).not.toHaveBeenCalled();
    closure.resolve();
    runLoop.resolve();
    await closing;
  });
});
