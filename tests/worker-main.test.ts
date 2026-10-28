import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import tls from 'node:tls';

const fake = vi.hoisted(() => {
  const query = vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const end = vi.fn<() => Promise<void>>();
  const ready = vi.fn<() => Promise<void>>();
  const close = vi.fn<() => Promise<void>>();
  const pool = { query, end };
  const runtime = { ready, close };
  return {
    pool,
    runtime,
    query,
    end,
    ready,
    close,
    config: vi.fn<() => unknown>(),
    createPool: vi.fn<(...args: unknown[]) => typeof pool>(),
    retention: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    calendar: vi.fn<(...args: unknown[]) => unknown>(),
    senders: vi.fn<(...args: unknown[]) => unknown[]>(),
    store: vi.fn<(...args: unknown[]) => void>(),
    meetings: vi.fn<(...args: unknown[]) => void>(),
    start: vi.fn<(...args: unknown[]) => Promise<typeof runtime>>(),
    write: vi.fn<(...args: unknown[]) => Promise<void>>(),
    unlink: vi.fn<(...args: unknown[]) => Promise<void>>(),
  };
});

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  writeFile: fake.write,
  unlink: fake.unlink,
}));
vi.mock('../packages/shared-config/src/index.js', () => ({ loadConfig: fake.config }));
vi.mock('../packages/database/src/pool.js', () => ({ createPool: fake.createPool }));
vi.mock('../packages/database/src/privacy-retention.js', () => ({
  retainPrivateData: fake.retention,
}));
vi.mock('../packages/integrations/src/calendar.js', () => ({ createCalendar: fake.calendar }));
vi.mock('../packages/integrations/src/notifications.js', () => ({
  createNotificationSenders: fake.senders,
}));
vi.mock('../apps/orbe-node/src/meetings/postgres-store.js', () => ({
  PostgresMeetingStore: class {
    constructor(...args: unknown[]) {
      fake.store(...args);
    }
  },
}));
vi.mock('../apps/orbe-node/src/meetings/service.js', () => ({
  MeetingService: class {
    constructor(...args: unknown[]) {
      fake.meetings(...args);
    }
  },
}));
vi.mock('../apps/worker-node/src/runtime.js', () => ({
  startWorker: fake.start,
  WorkerStartupError: class extends Error {
    constructor(
      readonly cleanupComplete: boolean,
      readonly cancelled = false,
    ) {
      super('WORKER_START_FAILED');
    }
  },
  WorkerStoppingError: class extends Error {
    constructor() {
      super('WORKER_STOPPING');
    }
  },
}));

import { startWorkerProcess } from '../apps/worker-node/src/main.js';
import { WorkerStartupError, WorkerStoppingError } from '../apps/worker-node/src/runtime.js';

const importEffects = {
  configuration: fake.config.mock.calls.length,
  pool: fake.createPool.mock.calls.length,
  runtime: fake.start.mock.calls.length,
};
const canary = 'private-worker-main-canary@example.test?token=synthetic-private';
const config = {
  DATABASE_URL: `postgresql://offline:${canary}@invalid/offline`,
  worker: { WORKER_ENABLED: true },
  meetings: { retentionDays: 90 },
  calendar: {},
};
const signals = new Map<string, (...args: unknown[]) => void>();
const processes: ReturnType<typeof startWorkerProcess>[] = [];
let previousExitCode: typeof process.exitCode;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}
function signal(name: 'SIGINT' | 'SIGTERM') {
  const listener = signals.get(name);
  expect(listener, `handler for ${name} must exist before any dependency runs`).toBeTypeOf(
    'function',
  );
  listener!();
}
function start(deadline?: number) {
  const instance = startWorkerProcess(deadline);
  processes.push(instance);
  return instance;
}
function startupSignal() {
  return (fake.start.mock.calls[0]?.[4] as { signal?: AbortSignal } | undefined)?.signal;
}
function assertSanitizedLogs() {
  const logged = JSON.stringify([
    vi.mocked(console.info).mock.calls,
    vi.mocked(console.error).mock.calls,
  ]);
  expect(logged).not.toContain(canary);
  expect(process.exit).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(net.Socket.prototype.connect).not.toHaveBeenCalled();
  expect(tls.connect).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  signals.clear();
  processes.length = 0;
  fake.config.mockReturnValue(config);
  fake.createPool.mockReturnValue(fake.pool);
  fake.query.mockResolvedValue({ rows: [] });
  fake.end.mockResolvedValue(undefined);
  fake.ready.mockResolvedValue(undefined);
  fake.close.mockResolvedValue(undefined);
  fake.retention.mockResolvedValue({ meetings: 0, transactions: 0, sessions: 0 });
  fake.calendar.mockReturnValue({});
  fake.senders.mockReturnValue([]);
  fake.start.mockResolvedValue(fake.runtime);
  fake.write.mockResolvedValue(undefined);
  fake.unlink.mockResolvedValue(undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('PROCESS_EXIT_FORBIDDEN');
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('REAL_NETWORK_FORBIDDEN'));
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('REAL_NETWORK_FORBIDDEN');
  });
  vi.spyOn(tls, 'connect').mockImplementation(() => {
    throw new Error('REAL_NETWORK_FORBIDDEN');
  });
  const originalOn = process.on;
  const originalOff = process.off;
  vi.spyOn(process, 'on').mockImplementation(((event: string | symbol, listener: unknown) => {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      signals.set(event, listener as (...args: unknown[]) => void);
      return process;
    }
    return Reflect.apply(originalOn, process, [event, listener]) as NodeJS.Process;
  }) as typeof process.on);
  vi.spyOn(process, 'off').mockImplementation(((event: string | symbol, listener: unknown) => {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      if (signals.get(event) === listener) signals.delete(event);
      return process;
    }
    return Reflect.apply(originalOff, process, [event, listener]) as NodeJS.Process;
  }) as typeof process.off);
});

afterEach(async () => {
  for (const instance of processes) void instance.shutdown();
  await flush();
  assertSanitizedLogs();
  vi.clearAllTimers();
  vi.useRealTimers();
  signals.clear();
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
});

describe('worker main lifecycle with fully simulated dependencies', () => {
  it('imports without starting a process or loading configuration', () => {
    expect(importEffects).toEqual({ configuration: 0, pool: 0, runtime: 0 });
    expect(fake.config).not.toHaveBeenCalled();
    expect(fake.createPool).not.toHaveBeenCalled();
    expect(signals.size).toBe(0);
  });

  it('exposes detached lifecycle snapshots without claiming health or starting recovery', async () => {
    const query = deferred();
    fake.query.mockReturnValueOnce(query.promise);
    const instance = start();
    const starting = instance.getStatus();
    expect(starting).toEqual({
      phase: 'starting',
      startupFailed: false,
      shutdownFailure: null,
      resourcesClosed: false,
      supervisedRecoveryRequired: false,
    });
    query.resolve();
    await instance.startup;
    expect(instance.getStatus().phase).toBe('running');
    expect(starting.phase).toBe('starting');
    expect(instance.getStatus()).not.toBe(starting);
    const closing = deferred();
    fake.close.mockReturnValueOnce(closing.promise);
    const shutdown = instance.shutdown();
    expect(instance.getStatus().phase).toBe('stopping');
    closing.resolve();
    await expect(shutdown).resolves.toBe('completed');
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-completed',
      startupFailed: false,
      shutdownFailure: null,
      resourcesClosed: true,
      supervisedRecoveryRequired: false,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid deadline %s before any startup effect',
    (deadline) => {
      expect(() => startWorkerProcess(deadline)).toThrow('WORKER_SHUTDOWN_DEADLINE_INVALID');
      expect(fake.config).not.toHaveBeenCalled();
      expect(signals.size).toBe(0);
    },
  );

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'handles %s reentrantly while loading config',
    async (name) => {
      fake.config.mockImplementationOnce(() => {
        signal(name);
        return config;
      });
      const instance = start();
      await instance.startup;
      await expect(instance.shutdown()).resolves.toBe('completed');
      expect(fake.createPool).not.toHaveBeenCalled();
      expect(fake.start).not.toHaveBeenCalled();
      expect(fake.end).not.toHaveBeenCalled();
    },
  );

  it('does not close a pool before a reentrant creation returns and startup settles', async () => {
    fake.createPool.mockImplementationOnce(() => {
      signal('SIGTERM');
      expect(fake.end).not.toHaveBeenCalled();
      return fake.pool;
    });
    const instance = start();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.start).not.toHaveBeenCalled();
    expect(fake.end).toHaveBeenCalledTimes(1);
  });

  it('joins the initial SQL query before closing pool and skips runtime allocation', async () => {
    const query = deferred();
    fake.query.mockImplementationOnce(() => query.promise);
    const instance = start();
    signal('SIGINT');
    await flush();
    expect(fake.end).not.toHaveBeenCalled();
    expect(fake.start).not.toHaveBeenCalled();
    query.resolve();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.calendar).not.toHaveBeenCalled();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'does not misreport a genuine startup SQL failure after %s as clean cancellation',
    async (name) => {
      const query = deferred();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        fake.query.mockReturnValueOnce(query.promise);
        const instance = start();
        signal(name);
        expect(fake.end).not.toHaveBeenCalled();
        query.reject(new Error(canary));
        await instance.startup;
        await expect(instance.shutdown()).resolves.toBe('incomplete');
        expect(instance.getStatus()).toEqual({
          phase: 'shutdown-incomplete',
          startupFailed: true,
          shutdownFailure: 'startup-failed',
          resourcesClosed: true,
          supervisedRecoveryRequired: true,
        });
        expect(fake.start).not.toHaveBeenCalled();
        expect(fake.end).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledWith('WORKER_START_FAILED');
        expect(console.error).toHaveBeenCalledWith('WORKER_SHUTDOWN_AFTER_STARTUP_FAILURE');
        expect(console.error).toHaveBeenCalledWith('WORKER_SUPERVISED_RECOVERY_REQUIRED');
        expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
        await flush();
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    },
  );

  it.each(['calendar', 'senders'] as const)(
    'skips runtime after reentrant %s signal',
    async (phase) => {
      fake[phase].mockImplementationOnce(() => {
        signal('SIGTERM');
        return [];
      });
      const instance = start();
      await instance.startup;
      await expect(instance.shutdown()).resolves.toBe('completed');
      expect(fake.start).not.toHaveBeenCalled();
      expect(fake.retention).not.toHaveBeenCalled();
    },
  );

  it('passes an abort signal into startup and waits for the returned runtime cleanup', async () => {
    const boot = deferred<typeof fake.runtime>();
    fake.start.mockReturnValueOnce(boot.promise);
    const instance = start();
    await flush();
    expect(startupSignal()?.aborted).toBe(false);
    signal('SIGTERM');
    expect(startupSignal()?.aborted).toBe(true);
    await flush();
    expect(fake.end).not.toHaveBeenCalled();
    expect(fake.close).not.toHaveBeenCalled();
    boot.resolve(fake.runtime);
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.ready).not.toHaveBeenCalled();
    expect(fake.end).toHaveBeenCalledTimes(1);
  });

  it('accepts startup cancellation only when the runtime explicitly completed cleanup', async () => {
    const boot = deferred<typeof fake.runtime>();
    fake.start.mockReturnValueOnce(boot.promise);
    const instance = start();
    await flush();
    signal('SIGINT');
    boot.reject(new WorkerStartupError(true, true));
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-completed',
      startupFailed: false,
      shutdownFailure: null,
      resourcesClosed: true,
      supervisedRecoveryRequired: false,
    });
  });

  it('requires typed cancellation intent in addition to completed startup cleanup', async () => {
    const boot = deferred<typeof fake.runtime>();
    fake.start.mockReturnValueOnce(boot.promise);
    const instance = start();
    await flush();
    signal('SIGTERM');
    boot.reject(new WorkerStartupError(true));
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(instance.getStatus()).toMatchObject({
      phase: 'shutdown-incomplete',
      startupFailed: true,
      shutdownFailure: 'startup-failed',
      resourcesClosed: true,
      supervisedRecoveryRequired: true,
    });
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it('does not trust a cancelled marker without a requested shutdown', async () => {
    fake.start.mockRejectedValueOnce(new WorkerStartupError(true, true));
    const instance = start();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(instance.getStatus().startupFailed).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('marks fatal startup immediately while its safe pool cleanup remains pending', async () => {
    const end = deferred();
    fake.start.mockRejectedValueOnce(new WorkerStartupError(true));
    fake.end.mockReturnValueOnce(end.promise);
    const instance = start();
    await instance.startup;
    await flush();
    expect(instance.getStatus()).toEqual({
      phase: 'startup-failed',
      startupFailed: true,
      shutdownFailure: null,
      resourcesClosed: false,
      supervisedRecoveryRequired: true,
    });
    expect(process.exitCode).toBe(1);
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.unlink).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
    signal('SIGINT');
    signal('SIGTERM');
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.end).toHaveBeenCalledTimes(1);
    end.resolve();
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(instance.getStatus().resourcesClosed).toBe(true);
  });

  it.each([new WorkerStartupError(false), new Error(canary)])(
    'keeps pool open when startup cannot attest partial-resource cleanup',
    async (error) => {
      fake.start.mockRejectedValueOnce(error);
      const instance = start();
      await instance.startup;
      await expect(instance.shutdown()).resolves.toBe('incomplete');
      expect(fake.end).not.toHaveBeenCalled();
      expect(fake.unlink).not.toHaveBeenCalled();
      expect(signals.has('SIGTERM')).toBe(true);
      expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
      expect(instance.getStatus()).toEqual({
        phase: 'shutdown-incomplete',
        startupFailed: true,
        shutdownFailure: 'startup-cleanup-unsafe',
        resourcesClosed: false,
        supervisedRecoveryRequired: true,
      });
      signal('SIGINT');
      signal('SIGTERM');
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(fake.end).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('WORKER_STARTUP_CLEANUP_UNSAFE');
    },
  );

  it('reports a startup failure after safe partial cleanup without leaking its cause', async () => {
    fake.start.mockRejectedValueOnce(new WorkerStartupError(true));
    const instance = start();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('WORKER_START_FAILED');
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it.each(['config', 'createPool', 'query'] as const)(
    'sanitizes %s startup failure',
    async (phase) => {
      if (phase === 'config')
        fake.config.mockImplementationOnce(() => {
          throw new Error(canary);
        });
      else if (phase === 'createPool')
        fake.createPool.mockImplementationOnce(() => {
          throw new Error(canary);
        });
      else fake.query.mockRejectedValueOnce(new Error(canary));
      const instance = start();
      await instance.startup;
      await expect(instance.shutdown()).resolves.toBe('incomplete');
      expect(fake.start).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('WORKER_START_FAILED');
    },
  );

  it('waits for heartbeat readiness and skips its next query when stopped', async () => {
    const ready = deferred();
    fake.ready.mockReturnValueOnce(ready.promise);
    const instance = start();
    await flush();
    signal('SIGTERM');
    await flush();
    expect(fake.close).not.toHaveBeenCalled();
    expect(fake.end).not.toHaveBeenCalled();
    ready.resolve();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.query).toHaveBeenCalledTimes(1);
    expect(fake.retention).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
  });

  it('joins the heartbeat SQL query and never starts retention after stop', async () => {
    const query = deferred();
    fake.query.mockImplementation((sql) =>
      sql === 'SELECT 1' ? query.promise : Promise.resolve({ rows: [] }),
    );
    const instance = start();
    await flush();
    expect(fake.query).toHaveBeenCalledWith('SELECT 1');
    signal('SIGINT');
    await flush();
    expect(fake.end).not.toHaveBeenCalled();
    query.resolve();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.retention).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
  });

  it('joins the full retention promise before closing runtime or database', async () => {
    const retention = deferred();
    fake.retention.mockReturnValueOnce(retention.promise);
    const instance = start();
    await flush();
    expect(fake.retention).toHaveBeenCalledWith(fake.pool, 90);
    signal('SIGTERM');
    await flush();
    expect(fake.close).not.toHaveBeenCalled();
    expect(fake.end).not.toHaveBeenCalled();
    retention.resolve();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.end).toHaveBeenCalledTimes(1);
  });

  it('joins a heartbeat write before unlink so shutdown cannot leave a fresh heartbeat', async () => {
    const write = deferred();
    const events: string[] = [];
    fake.write.mockImplementationOnce(async () => {
      await write.promise;
      events.push('write-completed');
    });
    fake.unlink.mockImplementationOnce(async () => {
      events.push('unlink');
    });
    const instance = start();
    await flush();
    expect(fake.write).toHaveBeenCalledTimes(1);
    signal('SIGINT');
    await flush();
    expect(fake.unlink).not.toHaveBeenCalled();
    expect(fake.end).not.toHaveBeenCalled();
    write.resolve();
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(events).toEqual(['write-completed', 'unlink']);
  });

  it('coalesces periodic heartbeat work and stops future ticks without provider calls', async () => {
    const instance = start();
    await instance.startup;
    const ready = deferred();
    fake.ready.mockReturnValueOnce(ready.promise);
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    expect(fake.ready).toHaveBeenCalledTimes(2);
    signal('SIGTERM');
    ready.resolve();
    await expect(instance.shutdown()).resolves.toBe('completed');
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(fake.ready).toHaveBeenCalledTimes(2);
    expect(fake.retention).toHaveBeenCalledTimes(1);
    expect(fake.write).toHaveBeenCalledTimes(1);
  });

  it('returns the identical shutdown promise across repeated and reentrant signals', async () => {
    const instance = start();
    await instance.startup;
    startupSignal()!.addEventListener(
      'abort',
      () => {
        signal('SIGINT');
      },
      { once: true },
    );
    const first = instance.shutdown();
    signal('SIGTERM');
    expect(instance.shutdown()).toBe(first);
    await expect(first).resolves.toBe('completed');
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.unlink).toHaveBeenCalledTimes(1);
    expect(signals.size).toBe(0);
  });

  it('joins an expected typed stopping rejection without reporting a false incomplete shutdown', async () => {
    const ready = deferred();
    fake.ready.mockReturnValueOnce(ready.promise);
    const instance = start();
    await flush();
    signal('SIGTERM');
    ready.reject(new WorkerStoppingError());
    await instance.startup;
    await expect(instance.shutdown()).resolves.toBe('completed');
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.query).toHaveBeenCalledTimes(1);
    expect(fake.retention).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_INCOMPLETE');
    expect(console.info).toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it.each([new Error(canary), new Error('WORKER_UNAVAILABLE'), new Error('WORKER_STOPPING')])(
    'reports generic heartbeat failures after a signal without trusting their message',
    async (error) => {
      const ready = deferred();
      fake.ready.mockReturnValueOnce(ready.promise);
      const instance = start();
      await flush();
      signal('SIGTERM');
      ready.reject(error);
      await instance.startup;
      await expect(instance.shutdown()).resolves.toBe('incomplete');
      expect(fake.close).toHaveBeenCalledTimes(1);
      expect(fake.end).toHaveBeenCalledTimes(1);
      expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
    },
  );

  it('keeps the normal unhealthy-heartbeat policy for an unexpected stopping marker before stop', async () => {
    fake.ready.mockRejectedValueOnce(new WorkerStoppingError());
    const instance = start();
    await instance.startup;
    expect(startupSignal()?.aborted).toBe(false);
    expect(fake.retention).not.toHaveBeenCalled();
    expect(fake.write).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_STARTED');
    await expect(instance.shutdown()).resolves.toBe('completed');
  });

  it('keeps a transient readiness failure recoverable instead of declaring fatal startup', async () => {
    fake.ready.mockRejectedValueOnce(new Error(canary));
    const instance = start();
    await instance.startup;
    expect(instance.getStatus()).toEqual({
      phase: 'running',
      startupFailed: false,
      shutdownFailure: null,
      resourcesClosed: false,
      supervisedRecoveryRequired: false,
    });
    expect(fake.write).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalledWith('WORKER_START_FAILED');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.ready).toHaveBeenCalledTimes(2);
    expect(fake.write).toHaveBeenCalledTimes(1);
    expect(fake.start).toHaveBeenCalledTimes(1);
    await expect(instance.shutdown()).resolves.toBe('completed');
  });

  it('does not close pool or remove guards after a failed runtime close', async () => {
    const instance = start();
    await instance.startup;
    fake.close.mockRejectedValueOnce(new Error(canary));
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(fake.end).not.toHaveBeenCalled();
    expect(fake.unlink).not.toHaveBeenCalled();
    expect(signals.has('SIGTERM')).toBe(true);
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-incomplete',
      startupFailed: false,
      shutdownFailure: 'resource-cleanup-failed',
      resourcesClosed: false,
      supervisedRecoveryRequired: true,
    });
    signal('SIGTERM');
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('reports pool cleanup failure without falsely completing or retrying it', async () => {
    const instance = start();
    await instance.startup;
    fake.end.mockRejectedValueOnce(new Error(canary));
    const stopping = instance.shutdown();
    await expect(stopping).resolves.toBe('incomplete');
    expect(instance.shutdown()).toBe(stopping);
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.unlink).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it('tolerates only ENOENT while removing an already absent heartbeat', async () => {
    const instance = start();
    await instance.startup;
    fake.unlink.mockRejectedValueOnce(Object.assign(new Error(canary), { code: 'ENOENT' }));
    await expect(instance.shutdown()).resolves.toBe('completed');
  });

  it('reports other heartbeat cleanup failures after safe pool closure', async () => {
    const instance = start();
    await instance.startup;
    fake.unlink.mockRejectedValueOnce(Object.assign(new Error(canary), { code: 'EACCES' }));
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it('uses the 40-second deadline only to report incomplete drain, never to force cleanup', async () => {
    const instance = start();
    await instance.startup;
    const close = deferred();
    fake.close.mockReturnValueOnce(close.promise);
    const stopping = instance.shutdown();
    await flush();
    vi.advanceTimersByTime(39_999);
    await flush();
    expect(console.error).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_INCOMPLETE');
    expect(fake.end).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(stopping).resolves.toBe('incomplete');
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-incomplete',
      startupFailed: false,
      shutdownFailure: 'deadline-exceeded',
      resourcesClosed: false,
      supervisedRecoveryRequired: true,
    });
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith('WORKER_SHUTDOWN_DEADLINE_EXCEEDED');
    expect(console.error).toHaveBeenCalledWith('WORKER_SUPERVISED_RECOVERY_REQUIRED');
    expect(fake.end).not.toHaveBeenCalled();
    expect(fake.unlink).not.toHaveBeenCalled();
    close.resolve();
    await flush();
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.unlink).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
    expect(instance.shutdown()).toBe(stopping);
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-incomplete',
      startupFailed: false,
      shutdownFailure: 'deadline-exceeded',
      resourcesClosed: true,
      supervisedRecoveryRequired: true,
    });
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('keeps pool open past deadline until initial retention and startup actually settle', async () => {
    const retention = deferred();
    fake.retention.mockReturnValueOnce(retention.promise);
    const instance = start(25);
    await flush();
    signal('SIGTERM');
    vi.advanceTimersByTime(25);
    await expect(instance.shutdown()).resolves.toBe('incomplete');
    expect(fake.close).not.toHaveBeenCalled();
    expect(fake.end).not.toHaveBeenCalled();
    retention.resolve();
    await instance.startup;
    await flush();
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.end).toHaveBeenCalledTimes(1);
    expect(fake.write).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
  });

  it('preserves incomplete status when a pending startup fails after its deadline', async () => {
    const query = deferred();
    fake.query.mockReturnValueOnce(query.promise);
    const instance = start(25);
    signal('SIGTERM');
    vi.advanceTimersByTime(25);
    const shutdown = instance.shutdown();
    await expect(shutdown).resolves.toBe('incomplete');
    expect(instance.getStatus()).toMatchObject({
      phase: 'shutdown-incomplete',
      startupFailed: false,
      shutdownFailure: 'deadline-exceeded',
      resourcesClosed: false,
      supervisedRecoveryRequired: true,
    });
    expect(fake.end).not.toHaveBeenCalled();
    expect(signals.has('SIGTERM')).toBe(true);
    query.reject(new Error(canary));
    await instance.startup;
    await flush();
    expect(instance.getStatus()).toEqual({
      phase: 'shutdown-incomplete',
      startupFailed: true,
      shutdownFailure: 'deadline-exceeded',
      resourcesClosed: true,
      supervisedRecoveryRequired: true,
    });
    expect(instance.shutdown()).toBe(shutdown);
    expect(console.info).not.toHaveBeenCalledWith('WORKER_SHUTDOWN_COMPLETED');
    expect(fake.start).not.toHaveBeenCalled();
    expect(fake.end).toHaveBeenCalledTimes(1);
  });
});
