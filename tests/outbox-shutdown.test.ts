import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OutboxProcessor,
  type MeetingJobs,
  type NotificationMeeting,
  type OutboxQueue,
} from '../apps/worker-node/src/outbox.js';
import type { NotificationSender } from '../packages/integrations/src/notifications.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';

const OUTBOX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEETING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DELIVERY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEASE_MS = 60000;
const HEARTBEAT_MS = LEASE_MS / 3;
const RENEWAL = 'UPDATE meeting_outbox SET locked_until=';
const ACK = 'UPDATE meeting_outbox SET processed_at=';
const RETRY = 'UPDATE meeting_outbox SET available_at=';
const SENT = "UPDATE notification_deliveries SET status='SENT'";
const DELIVERY_RETRY = 'UPDATE notification_deliveries SET status=$3';

interface Result {
  rows: Record<string, unknown>[];
  rowCount: number;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
const changed = (): Result => ({ rows: [], rowCount: 1 });

function fixture(kind = 'CALENDAR_CREATE', attempts = 1) {
  const work = deferred<void>();
  const renewals: ReturnType<typeof deferred<Result>>[] = [];
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  let closed = false;
  let claimed = true;
  let intercepted: ((sql: string) => Promise<Result> | undefined) | undefined;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []): Promise<Result> => {
    calls.push({ sql, values });
    if (closed) throw new Error('SYNTHETIC_POOL_ALREADY_CLOSED');
    const result = intercepted?.(sql);
    if (result) return result;
    if (sql.startsWith('WITH candidate AS (SELECT id FROM meeting_outbox WHERE id=$1')) {
      return {
        rows: claimed
          ? [{ id: OUTBOX_ID, meeting_id: MEETING_ID, kind, version: 3, attempts }]
          : [],
        rowCount: claimed ? 1 : 0,
      };
    }
    if (sql.startsWith(RENEWAL)) {
      const renewal = deferred<Result>();
      renewals.push(renewal);
      return renewal.promise;
    }
    if (sql.startsWith(ACK) || sql.startsWith(RETRY)) return changed();
    if (sql.startsWith('INSERT INTO notification_deliveries')) return changed();
    if (sql.startsWith("UPDATE notification_deliveries SET status='SENDING'")) {
      return { rows: [{ id: DELIVERY_ID, attempts }], rowCount: 1 };
    }
    if (sql.startsWith(SENT) || sql.startsWith(DELIVERY_RETRY)) return changed();
    throw new Error('UNEXPECTED_SYNTHETIC_QUERY');
  });
  const meeting: NotificationMeeting = {
    id: MEETING_ID,
    version: 3,
    status: 'PENDING',
    name: 'Synthetic visitor',
    email: 'synthetic@example.test',
    topic: 'Synthetic topic',
    start: new Date('2026-10-29T12:00:00Z'),
    end: new Date('2026-10-29T12:30:00Z'),
    timeZone: 'UTC',
  };
  const meetings: MeetingJobs = {
    processCalendarCreate: vi.fn(() => work.promise),
    processCalendarCancel: vi.fn(() => work.promise),
    processCalendarFailure: vi.fn(async () => undefined),
    getNotification: vi.fn(async () => meeting),
  };
  const queue: OutboxQueue = { add: vi.fn(async () => undefined) };
  const config = loadWorkerConfig({ NODE_ENV: 'test', OUTBOX_LEASE_MS: String(LEASE_MS) });
  const matches = (prefix: string) => calls.filter((call) => call.sql.startsWith(prefix));
  return {
    work,
    renewals,
    calls,
    meetings,
    queue,
    matches,
    owner: () => calls[0]!.values[1],
    closePool: () => {
      closed = true;
    },
    noClaim: () => {
      claimed = false;
    },
    intercept: (handler: (sql: string) => Promise<Result> | undefined) => {
      intercepted = handler;
    },
    processor: (senders: NotificationSender[] = []) =>
      new OutboxProcessor({ query } as unknown as pg.Pool, meetings, senders, config, queue),
  };
}

function observe(operation: Promise<void>) {
  let finished = false;
  const outcome = operation
    .then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )
    .then((result) => {
      finished = true;
      return result;
    });
  return { outcome, finished: () => finished };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('outbox process joins lease renewals before runtime cleanup', () => {
  it('returns immediately without a renewal timer when no row was claimed', async () => {
    const fake = fixture();
    fake.noClaim();
    await fake.processor().process(OUTBOX_ID);
    expect(fake.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an already-started renewal after ACK and stops scheduling new ones', async () => {
    const fake = fixture();
    const operation = observe(fake.processor().process(OUTBOX_ID));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(fake.renewals).toHaveLength(1);
    fake.work.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.matches(ACK)).toHaveLength(1);
    expect(operation.finished()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LEASE_MS);
    expect(fake.renewals).toHaveLength(1);
    expect(fake.matches(RENEWAL)[0]!.values).toEqual([OUTBOX_ID, fake.owner(), LEASE_MS]);
    fake.renewals[0]!.resolve(changed());
    expect(await operation.outcome).toEqual({ status: 'fulfilled' });
    const calls = fake.calls.length;
    fake.closePool();
    await vi.advanceTimersByTimeAsync(LEASE_MS);
    expect(fake.calls).toHaveLength(calls);
  });

  it('waits for every overlapping renewal, including a rejected query', async () => {
    const fake = fixture();
    const operation = observe(fake.processor().process(OUTBOX_ID));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(fake.renewals).toHaveLength(2);
    fake.work.resolve();
    await vi.advanceTimersByTimeAsync(0);
    fake.renewals[1]!.reject(new Error('SYNTHETIC_RENEWAL_FAILED_AFTER_ACK'));
    await vi.advanceTimersByTimeAsync(0);
    expect(operation.finished()).toBe(false);
    fake.renewals[0]!.resolve(changed());
    expect(await operation.outcome).toEqual({ status: 'fulfilled' });
    expect(fake.matches(ACK)).toHaveLength(1);
    expect(fake.matches(RETRY)).toHaveLength(0);
  });

  it('joins renewals after Calendar failure while preserving existing retry fields', async () => {
    const fake = fixture('CALENDAR_CANCEL', 2);
    const operation = observe(fake.processor().process(OUTBOX_ID));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    fake.work.reject(new Error('SYNTHETIC_PROVIDER_RESULT_UNCERTAIN'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.matches(ACK)).toHaveLength(0);
    expect(fake.matches(RETRY)[0]!.values).toEqual([OUTBOX_ID, fake.owner(), 4, 'OUTBOX_RETRY']);
    expect(operation.finished()).toBe(false);
    fake.renewals[0]!.resolve(changed());
    expect(await operation.outcome).toEqual({ status: 'fulfilled' });
    expect(fake.meetings.processCalendarCancel).toHaveBeenCalledExactlyOnceWith(MEETING_ID);
  });

  it('does not reject a failed SQL cleanup until its pending renewals have settled', async () => {
    const fake = fixture();
    const failure = new Error('SYNTHETIC_RETRY_PERSISTENCE_FAILED');
    fake.intercept((sql) => (sql.startsWith(RETRY) ? Promise.reject(failure) : undefined));
    const operation = observe(fake.processor().process(OUTBOX_ID));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    fake.work.reject(new Error('SYNTHETIC_CALENDAR_FAILED'));
    await vi.advanceTimersByTimeAsync(0);
    expect(operation.finished()).toBe(false);
    fake.renewals[0]!.resolve(changed());
    expect(await operation.outcome).toEqual({ status: 'rejected', error: failure });
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const lost of ['no matching owner', 'renewal failure']) {
    it(`preserves lease loss handling for ${lost} before provider completion`, async () => {
      const fake = fixture();
      const operation = observe(fake.processor().process(OUTBOX_ID));
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      if (lost === 'no matching owner') fake.renewals[0]!.resolve({ rows: [], rowCount: 0 });
      else fake.renewals[0]!.reject(new Error('SYNTHETIC_RENEWAL_FAILED'));
      await vi.advanceTimersByTimeAsync(0);
      fake.work.resolve();
      expect(await operation.outcome).toEqual({ status: 'fulfilled' });
      expect(fake.matches(ACK)).toHaveLength(0);
      expect(fake.matches(RETRY)[0]!.values).toEqual([OUTBOX_ID, fake.owner(), 2, 'OUTBOX_RETRY']);
    });
  }

  it('preserves Calendar exhaustion version and awaits the outstanding renewal', async () => {
    const fake = fixture('CALENDAR_CREATE', 8);
    const operation = observe(fake.processor().process(OUTBOX_ID));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    fake.work.reject(new Error('SYNTHETIC_CALENDAR_UNCERTAIN'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.meetings.processCalendarFailure).toHaveBeenCalledExactlyOnceWith(
      MEETING_ID,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      3,
    );
    expect(fake.matches(RETRY)[0]!.values).toEqual([
      OUTBOX_ID,
      fake.owner(),
      256,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
    ]);
    expect(operation.finished()).toBe(false);
    fake.renewals[0]!.resolve(changed());
    expect(await operation.outcome).toEqual({ status: 'fulfilled' });
  });
});

describe('provider acceptance does not prove a durable notification ACK', () => {
  for (const channel of ['smtp', 'telegram'] as const) {
    it(`${channel}: retains retry after external acceptance followed by SENT persistence failure`, async () => {
      const fake = fixture('NOTIFY_REQUESTED');
      const accepted = deferred<void>();
      const sender: NotificationSender = { channel, send: vi.fn(() => accepted.promise) };
      fake.intercept((sql) =>
        sql.startsWith(SENT) ? Promise.reject(new Error('SYNTHETIC_SENT_ACK_FAILED')) : undefined,
      );
      const operation = observe(fake.processor([sender]).process(OUTBOX_ID));
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      expect(sender.send).toHaveBeenCalledTimes(1);
      accepted.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.matches(SENT)).toHaveLength(1);
      expect(fake.matches(DELIVERY_RETRY)[0]!.values).toEqual([
        DELIVERY_ID,
        expect.any(String),
        'PENDING',
        2,
      ]);
      expect(fake.matches(DELIVERY_RETRY)[0]!.sql).toContain(
        "last_error_code='NOTIFICATION_UNAVAILABLE'",
      );
      expect(fake.matches(RETRY)[0]!.values).toEqual([OUTBOX_ID, fake.owner(), 2, 'OUTBOX_RETRY']);
      expect(fake.matches(ACK)).toHaveLength(0);
      expect(operation.finished()).toBe(false);
      fake.renewals[0]!.resolve(changed());
      expect(await operation.outcome).toEqual({ status: 'fulfilled' });
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  }
});
