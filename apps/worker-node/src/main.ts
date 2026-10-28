import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../../../packages/shared-config/src/index.js';
import { createPool } from '../../../packages/database/src/pool.js';
import { retainPrivateData } from '../../../packages/database/src/privacy-retention.js';
import { createCalendar } from '../../../packages/integrations/src/calendar.js';
import { createNotificationSenders } from '../../../packages/integrations/src/notifications.js';
import { MeetingService } from '../../orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../../orbe-node/src/meetings/postgres-store.js';
import { startWorker, WorkerStartupError, WorkerStoppingError } from './runtime.js';

const heartbeatPath = join(tmpdir(), 'phasscode-worker-heartbeat');
export type ShutdownResult = 'completed' | 'incomplete';
export type WorkerProcessPhase =
  | 'starting'
  | 'running'
  | 'stopping'
  | 'startup-failed'
  | 'shutdown-completed'
  | 'shutdown-incomplete';
export type ShutdownFailure =
  | 'deadline-exceeded'
  | 'startup-cleanup-unsafe'
  | 'startup-failed'
  | 'heartbeat-failed'
  | 'resource-cleanup-failed';
export interface WorkerProcessStatus {
  readonly phase: WorkerProcessPhase;
  readonly startupFailed: boolean;
  readonly shutdownFailure: ShutdownFailure | null;
  readonly resourcesClosed: boolean;
  readonly supervisedRecoveryRequired: boolean;
}
const shutdownDiagnostics: Record<ShutdownFailure, string> = {
  'deadline-exceeded': 'WORKER_SHUTDOWN_DEADLINE_EXCEEDED',
  'startup-cleanup-unsafe': 'WORKER_STARTUP_CLEANUP_UNSAFE',
  'startup-failed': 'WORKER_SHUTDOWN_AFTER_STARTUP_FAILURE',
  'heartbeat-failed': 'WORKER_HEARTBEAT_FAILED_DURING_SHUTDOWN',
  'resource-cleanup-failed': 'WORKER_RESOURCE_CLEANUP_FAILED',
};

// The deadline only reports failure; it never cancels joins or forces an exit.
// Leave a reporting margin before Compose's 45 s grace, without claiming it suffices.
export function startWorkerProcess(shutdownDeadlineMs = 40_000) {
  if (!Number.isFinite(shutdownDeadlineMs) || shutdownDeadlineMs <= 0)
    throw new Error('WORKER_SHUTDOWN_DEADLINE_INVALID');
  const controller = new AbortController();
  let phase: WorkerProcessPhase = 'starting';
  let shutdownFailure: ShutdownFailure | null = null;
  let resourcesClosed = false;
  let supervisedRecoveryRequired = false;
  let stopping = false;
  let startupFailed = false;
  let startupCleanupUnsafe = false;
  let runtimeStarting = false;
  let heartbeatFailedDuringStop = false;
  let heartbeatAttempted = false;
  let pool: ReturnType<typeof createPool> | undefined;
  let runtime: Awaited<ReturnType<typeof startWorker>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeatPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<ShutdownResult> | undefined;
  let settleStartup!: () => void;
  // Exists before a dependency can synchronously emit a signal.
  const startupSettled = new Promise<void>((resolve) => {
    settleStartup = resolve;
  });

  function shutdown(): Promise<ShutdownResult> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    if (!startupFailed) phase = 'stopping';
    let settleShutdown!: (result: ShutdownResult) => void;
    shutdownPromise = new Promise((resolve) => {
      settleShutdown = resolve;
    });
    // Publish the shared promise before abort listeners can re-enter shutdown.
    controller.abort();
    clearInterval(timer);
    console.info('WORKER_SHUTDOWN_STARTED');
    let incomplete = false;
    const markIncomplete = (reason: ShutdownFailure) => {
      if (incomplete) return;
      incomplete = true;
      phase = 'shutdown-incomplete';
      shutdownFailure = reason;
      supervisedRecoveryRequired = true;
      process.exitCode = 1;
      console.error(shutdownDiagnostics[reason]);
      console.error('WORKER_SHUTDOWN_INCOMPLETE');
      console.error('WORKER_SUPERVISED_RECOVERY_REQUIRED');
      settleShutdown('incomplete');
    };
    const deadline = setTimeout(() => markIncomplete('deadline-exceeded'), shutdownDeadlineMs);
    void (async () => {
      try {
        await startupSettled;
        if (startupCleanupUnsafe) {
          markIncomplete('startup-cleanup-unsafe');
          return;
        }
        // Abort stops intake, but runtime/Queue stay available to in-flight ready().
        await heartbeatPromise;
        await runtime?.close();
        // Failed runtime close must never fall through to pool.end().
        await pool?.end();
        resourcesClosed = true;
        if (heartbeatAttempted) {
          await unlink(heartbeatPath).catch((error: unknown) => {
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
              throw new Error('WORKER_HEARTBEAT_CLEANUP_FAILED');
          });
        }
        if (startupFailed) markIncomplete('startup-failed');
        else if (heartbeatFailedDuringStop) markIncomplete('heartbeat-failed');
        if (!incomplete) {
          phase = 'shutdown-completed';
          console.info('WORKER_SHUTDOWN_COMPLETED');
          settleShutdown('completed');
        }
      } catch {
        markIncomplete('resource-cleanup-failed');
      } finally {
        clearTimeout(deadline);
        // Keep guards if resources might still be alive after a failed cleanup.
        if (resourcesClosed) {
          process.off('SIGINT', onSignal);
          process.off('SIGTERM', onSignal);
        }
      }
    })();
    return shutdownPromise;
  }

  function onSignal() {
    void shutdown();
  }
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const startup = (async () => {
    try {
      const config = loadConfig();
      if (stopping) return;
      if (!config.worker.WORKER_ENABLED) throw new Error('WORKER_DISABLED');
      pool = createPool(config.DATABASE_URL!);
      if (stopping) return;
      await pool.query('SELECT 1 FROM meeting_outbox, notification_deliveries LIMIT 0');
      if (stopping) return;
      const meetings = new MeetingService(
        config.meetings,
        new PostgresMeetingStore(pool),
        createCalendar(config.calendar),
      );
      if (stopping) return;
      const senders = createNotificationSenders(config.worker);
      if (stopping) return;
      runtimeStarting = true;
      runtime = await startWorker(config.worker, pool, meetings, senders, {
        signal: controller.signal,
      });
      runtimeStarting = false;
      if (stopping) return;
      let lastRetention = 0;
      const heartbeat = (): Promise<void> => {
        if (heartbeatPromise) return heartbeatPromise;
        if (stopping) return Promise.resolve();
        heartbeatAttempted = true;
        heartbeatPromise = (async () => {
          try {
            await runtime!.ready();
            if (stopping) return;
            await pool!.query('SELECT 1');
            if (stopping) return;
            if (Date.now() - lastRetention > 3600000) {
              await retainPrivateData(pool!, config.meetings.retentionDays);
              lastRetention = Date.now();
            }
            if (stopping) return;
            await writeFile(heartbeatPath, String(Date.now()), { mode: 0o600 });
          } catch (error) {
            if (stopping && !(error instanceof WorkerStoppingError))
              heartbeatFailedDuringStop = true;
            // Preserve health policy: an expired heartbeat fails the healthcheck.
          }
        })().finally(() => {
          heartbeatPromise = undefined;
        });
        return heartbeatPromise;
      };
      await heartbeat();
      if (stopping) return;
      phase = 'running';
      timer = setInterval(() => {
        void heartbeat();
      }, 10000);
    } catch (error) {
      startupCleanupUnsafe =
        runtimeStarting && (!(error instanceof WorkerStartupError) || !error.cleanupComplete);
      const intentionalCancellation =
        stopping && error instanceof WorkerStartupError && error.cleanupComplete && error.cancelled;
      if (!intentionalCancellation) {
        startupFailed = true;
        if (phase !== 'shutdown-incomplete') phase = 'startup-failed';
        supervisedRecoveryRequired = true;
        process.exitCode = 1;
        console.error('WORKER_START_FAILED');
      }
      void shutdown();
    } finally {
      settleStartup();
    }
  })();
  return {
    startup,
    shutdown,
    // Lifecycle evidence only: running does not attest readiness or external effects.
    getStatus: (): WorkerProcessStatus => ({
      phase,
      startupFailed,
      shutdownFailure,
      resourcesClosed,
      supervisedRecoveryRequired,
    }),
  };
}

// Tests import the lifecycle without starting a process or reading configuration.
if (
  import.meta.main ??
  (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
)
  startWorkerProcess();
