import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import type { Job, Processor, QueueOptions, WorkerOptions } from 'bullmq';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Payload = { outboxId: string };
const isolated = vi.hoisted(() => ({
  approved: false,
  port: 0,
  name: '',
  queues: [] as unknown[],
  workers: [] as unknown[],
  beforeProcessor: undefined as (() => void) | undefined,
  afterProcessor: undefined as (() => void) | undefined,
  dispatch: vi.fn<() => Promise<number>>(),
  process: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock('bullmq', async (original) => {
  const real = await original<typeof import('bullmq')>();
  function connectionGuard(options: QueueOptions | WorkerOptions | undefined) {
    const connection = options?.connection as
      | {
          host?: unknown;
          port?: unknown;
          db?: unknown;
          username?: unknown;
          password?: unknown;
          tls?: unknown;
          path?: unknown;
        }
      | undefined;
    if (
      !isolated.approved ||
      !/^worker-151-[a-f0-9-]{36}$/.test(isolated.name) ||
      connection?.host !== '127.0.0.1' ||
      connection.port !== isolated.port ||
      (connection.db ?? 0) !== 0 ||
      connection.username !== undefined ||
      connection.password !== undefined ||
      connection.tls !== undefined ||
      connection.path !== undefined
    )
      throw new Error('ISOLATED_REDIS_CONNECTION_REQUIRED');
  }
  return {
    ...real,
    Queue: class extends real.Queue<Payload, void, string> {
      constructor(_name: string, options?: QueueOptions) {
        connectionGuard(options);
        super(isolated.name, options);
        isolated.queues.push(this);
      }
    },
    Worker: class extends real.Worker<Payload, void, string> {
      constructor(
        _name: string,
        processor?: string | URL | null | Processor<Payload, void, string>,
        options?: WorkerOptions,
      ) {
        connectionGuard(options);
        super(isolated.name, processor, options);
        isolated.workers.push(this);
      }
      protected override callProcessJob(
        job: Job<Payload, void, string>,
        token: string,
        signal?: AbortSignal,
      ): Promise<void> {
        isolated.beforeProcessor?.();
        const result = super.callProcessJob(job, token, signal);
        isolated.afterProcessor?.();
        return result;
      }
    },
  };
});
vi.mock('../apps/worker-node/src/outbox.js', () => ({
  // Business effects and PostgreSQL are simulated. Only BullMQ and Redis are real.
  OutboxProcessor: class {
    dispatchDue() {
      return isolated.dispatch();
    }
    process(id: string) {
      return isolated.process(id);
    }
  },
}));

import { Queue, Worker } from 'bullmq';
import { startWorker } from '../apps/worker-node/src/runtime.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';

const enabled = process.env.PHASSCODE_WORKER_REDIS_TEST === '1';
const suite = enabled ? describe : describe.skip;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REDIS_IMAGE = 'sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499';
let dockerConfig: string;
const runtimes: Awaited<ReturnType<typeof startWorker>>[] = [];
const releaseHeld: Array<() => void> = [];
const completed: string[] = [];
const failed: Array<{ id: string; attemptsMade: number }> = [];
const business: string[] = [];
const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as unknown as pg.Pool;
const meetings = {
  processCalendarCreate: async () => undefined,
  processCalendarCancel: async () => undefined,
  processCalendarFailure: async () => undefined,
  getNotification: async () => null,
};

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('OWNED_REDIS_INSPECTION_INVALID');
  return value as Record<string, unknown>;
}
function dockerRead(args: string[], json = true): unknown {
  if (
    !lstatSync(dockerConfig).isDirectory() ||
    lstatSync(dockerConfig).isSymbolicLink() ||
    realpathSync(dockerConfig).toLowerCase() !== dockerConfig.toLowerCase() ||
    readdirSync(dockerConfig).length !== 0
  ) {
    throw new Error('EMPTY_OWNED_DOCKER_CONFIG_REQUIRED');
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  try {
    const output = execFileSync(
      'docker',
      ['--config', dockerConfig, '--host', 'npipe:////./pipe/docker_engine', ...args],
      {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1000000,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    return json ? (JSON.parse(output) as unknown) : output;
  } catch {
    throw new Error('OWNED_REDIS_DOCKER_INSPECTION_FAILED');
  }
}
function requireOwnedRedis() {
  // This separate opt-in is restricted to an isolated GitHub-hosted PR runner.
  // The existing Windows Docker Desktop ownership checks below remain unchanged.
  if (process.env.PHASSCODE_WORKER_REDIS_CI === '1') {
    if (
      process.platform !== 'linux' ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_EVENT_NAME !== 'pull_request' ||
      process.env.GITHUB_REPOSITORY !== 'SladeSouzaSantos/phasscode-workspace' ||
      process.env.PHASSCODE_WORKER_REDIS_TEST !== '1' ||
      process.env.PHASSCODE_WORKER_REDIS_PORT !== '16379' ||
      process.env.PHASSCODE_WORKER_REDIS_OWNER ||
      process.env.PHASSCODE_WORKER_REDIS_CONTAINER
    ) {
      throw new Error('ISOLATED_CI_REDIS_REQUIRED');
    }
    // The workflow provisions a disposable Redis service in this job alone.
    // Every connection is still guarded to loopback, this port, DB 0 and no credentials.
    isolated.port = 16379;
    isolated.approved = true;
    return;
  }
  const owner = process.env.PHASSCODE_WORKER_REDIS_OWNER;
  const containerName = process.env.PHASSCODE_WORKER_REDIS_CONTAINER;
  const port = process.env.PHASSCODE_WORKER_REDIS_PORT;
  if (
    process.platform !== 'win32' ||
    !owner ||
    !/^[a-f0-9]{32}$/.test(owner) ||
    containerName !== `phasscode-worker-151-${owner}` ||
    !port ||
    !/^[1-9][0-9]{3,4}$/.test(port) ||
    Number(port) > 65535
  )
    throw new Error('OWNED_REDIS_OPT_IN_INVALID');
  dockerConfig = resolve(ROOT, '.docker-local', `worker-15-1-${owner}`, 'docker-config');
  const info = record(
    dockerRead([
      'info',
      '--format',
      '{"os":{{json .OSType}},"system":{{json .OperatingSystem}},"swarm":{{json .Swarm.LocalNodeState}}}',
    ]),
  );
  if (
    info.os !== 'linux' ||
    info.system !== 'Docker Desktop' ||
    info.swarm !== 'inactive' ||
    dockerRead(['version', '--format', '{{.Server.Version}}'], false) !== '29.9.2'
  ) {
    throw new Error('LOCAL_DOCKER_DESKTOP_REQUIRED');
  }
  const template =
    '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"scope":{{json (index .Config.Labels "phasscode.test.scope")}},"owner":{{json (index .Config.Labels "phasscode.test.owner")}},"user":{{json .Config.User}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"networks":{{json .NetworkSettings.Networks}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"privileged":{{json .HostConfig.Privileged}}}';
  const container = record(
    dockerRead(['inspect', '--type', 'container', '--format', template, containerName]),
  );
  if (
    container.name !== `/${containerName}` ||
    container.image !== REDIS_IMAGE ||
    container.scope !== 'worker-15-1' ||
    container.owner !== owner ||
    container.running !== true ||
    (container.health !== null && container.health !== 'healthy') ||
    container.user !== '999:999' ||
    container.privileged !== false ||
    typeof container.id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(container.id)
  ) {
    throw new Error('OWNED_REDIS_CONTAINER_REQUIRED');
  }
  const ports = record(container.ports);
  const bindings = ports['6379/tcp'];
  if (
    Object.keys(ports).length !== 1 ||
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    record(bindings[0]).HostIp !== '127.0.0.1' ||
    record(bindings[0]).HostPort !== port
  ) {
    throw new Error('OWNED_REDIS_LOOPBACK_PORT_REQUIRED');
  }
  if (
    !Array.isArray(container.mounts) ||
    container.mounts.some(
      (mount: unknown) => record(mount).Type !== 'tmpfs' || record(mount).Destination !== '/data',
    ) ||
    typeof record(container.tmpfs)['/data'] !== 'string'
  )
    throw new Error('OWNED_REDIS_TMPFS_ONLY_REQUIRED');
  const networks = record(container.networks);
  const networkName = `${containerName}-net`;
  if (Object.keys(networks).length !== 1 || !Object.hasOwn(networks, networkName))
    throw new Error('OWNED_REDIS_NETWORK_REQUIRED');
  const networkId = record(networks[networkName]).NetworkID;
  if (typeof networkId !== 'string' || !/^[a-f0-9]{64}$/.test(networkId))
    throw new Error('OWNED_REDIS_NETWORK_REQUIRED');
  const networkTemplate =
    '{"id":{{json .Id}},"name":{{json .Name}},"driver":{{json .Driver}},"internal":{{json .Internal}},"scope":{{json (index .Labels "phasscode.test.scope")}},"owner":{{json (index .Labels "phasscode.test.owner")}},"options":{{json .Options}},"members":{{json .Containers}}}';
  const network = record(
    dockerRead(['network', 'inspect', '--format', networkTemplate, networkId]),
  );
  const members = record(network.members);
  const options = record(network.options);
  if (
    network.id !== networkId ||
    network.name !== networkName ||
    network.driver !== 'bridge' ||
    network.internal !== false ||
    network.scope !== 'worker-15-1' ||
    network.owner !== owner ||
    Object.keys(members).length !== 1 ||
    !Object.hasOwn(members, container.id) ||
    options['com.docker.network.bridge.enable_ip_masquerade'] !== 'false' ||
    options['com.docker.network.bridge.enable_icc'] !== 'false'
  )
    throw new Error('OWNED_REDIS_EXCLUSIVE_NETWORK_REQUIRED');
  isolated.port = Number(port);
  isolated.approved = true;
}

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((accept) => {
    resolvePromise = accept;
  });
  releaseHeld.push(resolvePromise);
  return { promise, resolve: resolvePromise };
}
async function until(check: () => boolean | Promise<boolean>, timeout = 8000) {
  const limit = performance.now() + timeout;
  while (!(await check())) {
    if (performance.now() >= limit) throw new Error('ISOLATED_BULLMQ_CONDITION_TIMEOUT');
    await new Promise((accept) => setTimeout(accept, 10));
  }
}
function connection() {
  return { host: '127.0.0.1', port: isolated.port, db: 0, maxRetriesPerRequest: null };
}
function controlQueue() {
  const queue = new Queue<Payload, void, string>('test-control', { connection: connection() });
  queue.on('error', () => undefined);
  return queue;
}
async function runtime(signal?: AbortSignal) {
  const config = loadWorkerConfig({
    NODE_ENV: 'test',
    WORKER_ENABLED: 'true',
    NOTIFICATION_MODE: 'fake',
    REDIS_URL: `redis://127.0.0.1:${isolated.port}/0`,
    DATABASE_URL: 'postgresql://synthetic.invalid/unused',
    OUTBOX_POLL_MS: '60000',
  });
  const instance = await startWorker(config, pool, meetings, [], signal ? { signal } : {});
  runtimes.push(instance);
  return instance;
}
function workerAt(index = 0) {
  const worker = isolated.workers[index] as Worker<Payload, void, string> | undefined;
  if (!worker) throw new Error('EXPECTED_TEST_WORKER_MISSING');
  return worker;
}
function watch(worker: Worker<Payload, void, string>) {
  worker.on('completed', (job) => {
    completed.push(job.id!);
  });
  worker.on('failed', (job) => {
    if (job?.id) failed.push({ id: job.id, attemptsMade: job.attemptsMade });
  });
}

suite('BullMQ real shutdown against an explicitly owned disposable local Redis', () => {
  beforeAll(() => {
    requireOwnedRedis();
  }, 30000);
  beforeEach(() => {
    isolated.name = `worker-151-${randomUUID()}`;
    isolated.beforeProcessor = undefined;
    isolated.afterProcessor = undefined;
    isolated.queues.length = 0;
    isolated.workers.length = 0;
    isolated.dispatch.mockReset().mockResolvedValue(0);
    isolated.process.mockReset().mockImplementation(async (id) => {
      business.push(id);
    });
    runtimes.length = 0;
    releaseHeld.length = 0;
    completed.length = 0;
    failed.length = 0;
    business.length = 0;
  });
  afterEach(async () => {
    isolated.beforeProcessor = undefined;
    isolated.afterProcessor = undefined;
    for (const release of releaseHeld) release();
    for (const instance of runtimes) await instance.close();
    // Connections only: no queue deletion, flush, retry/reset, Docker or SQL cleanup.
    for (const worker of isolated.workers as Worker<Payload, void, string>[]) await worker.close();
    for (const queue of isolated.queues as Queue<Payload, void, string>[]) await queue.close();
  }, 20000);

  for (const delivery of [
    'before processor invocation',
    'after invocation but before its microtask',
  ] as const) {
    it(`preserves an acquired job ${delivery} and processes it once after supervised restart`, async () => {
      const controller = new AbortController();
      const first = await runtime(controller.signal);
      const worker = workerAt();
      watch(worker);
      if (delivery === 'before processor invocation')
        isolated.beforeProcessor = () => {
          controller.abort();
        };
      else
        isolated.afterProcessor = () => {
          controller.abort();
        };
      const queue = controlQueue();
      const id = randomUUID();
      const jobId = `outbox-${id}`;
      await queue.add(
        'outbox',
        { outboxId: id },
        { jobId, removeOnComplete: true, removeOnFail: true },
      );
      await until(() => controller.signal.aborted);
      await first.close();
      const waiting = await queue.getJob(jobId);
      expect(waiting).toBeDefined();
      expect(await waiting!.getState()).toBe('waiting');
      expect(waiting!.attemptsMade).toBe(0);
      expect(waiting!.attemptsStarted).toBe(1);
      expect(business).toEqual([]);
      expect(completed).toEqual([]);
      expect(failed).toEqual([]);
      expect(await queue.isPaused()).toBe(false);
      expect(await queue.getActiveCount()).toBe(0);
      isolated.beforeProcessor = undefined;
      isolated.afterProcessor = undefined;
      const resumed = await runtime();
      watch(workerAt(1));
      await until(() => business.length === 1);
      await until(async () => !(await queue.getJob(jobId)));
      expect(business).toEqual([id]);
      expect(completed).toEqual([jobId]);
      expect(failed).toEqual([]);
      await resumed.close();
    }, 20000);
  }

  it('waits for an in-flight business job while pause(false) is pending and leaves later work waiting', async () => {
    const controller = new AbortController();
    const held = deferred();
    const activeId = randomUUID();
    const laterId = randomUUID();
    isolated.process.mockImplementation(async (id) => {
      if (id === activeId) await held.promise;
      business.push(id);
    });
    const instance = await runtime(controller.signal);
    const worker = workerAt();
    watch(worker);
    let paused = false;
    worker.on('paused', () => {
      paused = true;
    });
    const queue = controlQueue();
    const active = await queue.add('outbox', { outboxId: activeId }, { removeOnComplete: false });
    await until(() => isolated.process.mock.calls.length === 1);
    controller.abort();
    let closed = false;
    const closing = instance.close().then(() => {
      closed = true;
    });
    const later = await queue.add('outbox', { outboxId: laterId }, { removeOnComplete: false });
    expect(worker.isPaused()).toBe(true);
    expect(paused).toBe(false);
    expect(closed).toBe(false);
    expect(await queue.isPaused()).toBe(false);
    expect(await active.getState()).toBe('active');
    expect(await later.getState()).toBe('waiting');
    expect(isolated.process).toHaveBeenCalledTimes(1);
    held.resolve();
    await closing;
    expect(paused).toBe(true);
    expect(await active.getState()).toBe('completed');
    expect(await later.getState()).toBe('waiting');
    expect(business).toEqual([activeId]);
    expect(worker.isRunning()).toBe(false);
    const resumed = await runtime();
    watch(workerAt(1));
    await until(async () => (await later.getState()) === 'completed');
    expect(business).toEqual([activeId, laterId]);
    await resumed.close();
  }, 20000);

  it('uses real backoff and retry transitions for an ordinary pre-effect processor failure', async () => {
    let calls = 0;
    isolated.process.mockImplementation(async (id) => {
      calls++;
      if (calls === 1) throw new Error('SYNTHETIC_TRANSIENT_PROCESSOR_FAILURE');
      business.push(id);
    });
    const instance = await runtime();
    watch(workerAt());
    const queue = controlQueue();
    const id = randomUUID();
    const job = await queue.add(
      'outbox',
      { outboxId: id },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 80 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    await until(() => failed.length === 1);
    expect(await job.getState()).toBe('delayed');
    await until(async () => (await job.getState()) === 'completed');
    const stored = await queue.getJob(job.id!);
    expect(stored!.attemptsMade).toBe(2);
    expect(stored!.attemptsStarted).toBe(2);
    expect(business).toEqual([id]);
    expect(failed).toEqual([{ id: job.id, attemptsMade: 1 }]);
    expect(await queue.getFailedCount()).toBe(0);
    await instance.close();
  }, 20000);

  it('retains an ordinary terminal failure when explicitly requested, without false completion', async () => {
    isolated.process.mockRejectedValue(new Error('SYNTHETIC_PROCESSOR_FAILURE'));
    const instance = await runtime();
    watch(workerAt());
    const queue = controlQueue();
    const job = await queue.add(
      'outbox',
      { outboxId: randomUUID() },
      { attempts: 1, removeOnFail: false },
    );
    await until(async () => (await job.getState()) === 'failed');
    const stored = await queue.getJob(job.id!);
    expect(stored!.attemptsMade).toBe(1);
    expect(stored!.attemptsStarted).toBe(1);
    expect(business).toEqual([]);
    expect(completed).toEqual([]);
    await instance.close();
  }, 20000);

  it('preserves production remove-on-fail semantics and allows later durable-outbox redispatch', async () => {
    let claimed = false;
    isolated.process.mockImplementation(async (id) => {
      if (!claimed) throw new Error('SYNTHETIC_SQL_NOT_CLAIMED');
      business.push(id);
    });
    const instance = await runtime();
    watch(workerAt());
    const queue = controlQueue();
    const id = randomUUID();
    const jobId = `outbox-${id}`;
    const options = { jobId, removeOnComplete: true, removeOnFail: true };
    await queue.add('outbox', { outboxId: id }, options);
    await until(() => failed.length === 1);
    await until(async () => !(await queue.getJob(jobId)));
    expect(failed).toEqual([{ id: jobId, attemptsMade: 1 }]);
    expect(completed).toEqual([]);
    expect(business).toEqual([]);
    // Surrogate for a still-pending SQL row dispatched again; no queue retry/reset.
    claimed = true;
    await queue.add('outbox', { outboxId: id }, options);
    await until(() => completed.length === 1);
    expect(business).toEqual([id]);
    expect(isolated.process).toHaveBeenCalledTimes(2);
    expect(await queue.getJob(jobId)).toBeUndefined();
    await instance.close();
  }, 20000);

  it('does not repeat a fake externally accepted effect when a durable outbox surrogate already records completion', async () => {
    let processed = false;
    isolated.process.mockImplementation(async (id) => {
      if (processed) return;
      business.push(id);
      processed = true;
      throw new Error('SYNTHETIC_TRANSPORT_FAILURE_AFTER_DURABLE_ACK');
    });
    const instance = await runtime();
    watch(workerAt());
    const queue = controlQueue();
    const id = randomUUID();
    const job = await queue.add(
      'outbox',
      { outboxId: id },
      { attempts: 2, backoff: { type: 'fixed', delay: 30 }, removeOnComplete: false },
    );
    await until(async () => (await job.getState()) === 'completed');
    expect(isolated.process).toHaveBeenCalledTimes(2);
    expect(business).toEqual([id]);
    expect((await queue.getJob(job.id!))!.attemptsMade).toBe(2);
    // This proves the real queue's retry behavior, not PostgreSQL or provider idempotency.
    await instance.close();
  }, 20000);
});
