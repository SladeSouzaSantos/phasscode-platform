import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';
import {
  OutboxProcessor,
  type MeetingJobs,
  type NotificationMeeting,
  type OutboxQueue,
} from '../apps/worker-node/src/outbox.js';
import { redisConnection } from '../apps/worker-node/src/runtime.js';
import { FakeCalendarAdapter } from '../packages/integrations/src/calendar.js';

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
  throw new Error('Defina PostgreSQL e Redis descartáveis para testar worker.');
const pool = createPool(process.env.TEST_DATABASE_URL);
const meetings: string[] = [];
const proposals: string[] = [];
// Keep reservations disjoint even when failed/cancelled fixtures retain a range.
const fixtureStart = Date.now() + 3 * 86400000 + Math.floor(Math.random() * 86400000);
const config = loadWorkerConfig({
  NODE_ENV: 'test',
  WORKER_ENABLED: 'true',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  REDIS_URL: process.env.TEST_REDIS_URL,
  NOTIFICATION_MODE: 'fake',
});
const queued: { name: string; data: { outboxId: string }; options: unknown }[] = [];
const queue: OutboxQueue = {
  add: async (name, data, options) => {
    queued.push({ name, data, options });
  },
};
const service: MeetingJobs = {
  processCalendarCreate: async () => undefined,
  processCalendarCancel: async () => undefined,
  processCalendarFailure: async () => undefined,
  getNotification: async (id) => {
    const result = await pool.query<{
      id: string;
      version: number;
      status: string;
      name: string;
      email: string;
      starts_at: Date;
      ends_at: Date;
      time_zone: string;
      topic: string;
    }>('SELECT * FROM meetings WHERE id=$1', [id]);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          version: row.version,
          status: row.status,
          name: row.name,
          email: row.email,
          start: row.starts_at,
          end: row.ends_at,
          timeZone: row.time_zone,
          topic: row.topic,
        }
      : null;
  },
};
beforeAll(async () => {
  await migrate(pool);
});
afterAll(async () => {
  await pool.query(
    'DELETE FROM notification_deliveries WHERE outbox_id IN (SELECT id FROM meeting_outbox WHERE meeting_id=ANY($1::uuid[]))',
    [meetings],
  );
  await pool.query('DELETE FROM meeting_outbox WHERE meeting_id=ANY($1::uuid[])', [meetings]);
  await pool.query('DELETE FROM meetings WHERE id=ANY($1::uuid[])', [meetings]);
  await pool.query('DELETE FROM meeting_proposals WHERE id=ANY($1::uuid[])', [proposals]);
  await pool.end();
});
async function seed(kind = 'NOTIFY_REQUESTED', status = 'PENDING') {
  const proposal = randomUUID();
  const meeting = randomUUID();
  const outbox = randomUUID();
  proposals.push(proposal);
  meetings.push(meeting);
  const start = new Date(fixtureStart + meetings.length * 3600000);
  const end = new Date(start.getTime() + 1800000);
  await pool.query(
    `INSERT INTO meeting_proposals(id,token_hash,name,email,topic,starts_at,ends_at,time_zone,consent_version,created_at,expires_at) VALUES($1,$2,'Synthetic','synthetic@example.com','Synthetic topic',$3,$4,'America/Fortaleza','test',now(),now()+interval '1 hour')`,
    [proposal, 'a'.repeat(64), start, end],
  );
  const hash = createHash('sha256').update(meeting).digest('hex');
  await pool.query(
    `INSERT INTO meetings(id,proposal_id,status,name,email,topic,starts_at,ends_at,time_zone,token_hash,consent_version,consented_at,idempotency_hash,request_hash,created_at,updated_at,reserved_start,reserved_end) VALUES($1,$2,$3,'Synthetic','synthetic@example.com','Synthetic topic',$4,$5,'America/Fortaleza',$6,'test',now(),$7,$7,now(),now(),$8,$9)`,
    [
      meeting,
      proposal,
      status,
      start,
      end,
      'a'.repeat(64),
      hash,
      ['APPROVED', 'CONFIRMED'].includes(status) ? start : null,
      ['APPROVED', 'CONFIRMED'].includes(status) ? end : null,
    ],
  );
  await pool.query('INSERT INTO meeting_outbox(id,meeting_id,kind,version) VALUES($1,$2,$3,1)', [
    outbox,
    meeting,
    kind,
  ]);
  return { meeting, outbox };
}
describe('worker, outbox e entregas com PostgreSQL/Redis descartáveis', () => {
  it('lease SQL entre duas instâncias admite um único processamento concorrente', async () => {
    const fixture = await seed();
    let sent = 0;
    const sender = {
      channel: 'smtp' as const,
      send: async () => {
        sent++;
      },
    };
    const one = new OutboxProcessor(pool, service, [sender], config, queue);
    const two = new OutboxProcessor(pool, service, [sender], config, queue);
    await Promise.all(
      Array.from({ length: 16 }, (_, index) => (index % 2 ? one : two).process(fixture.outbox)),
    );
    expect(sent).toBe(1);
    expect(
      (
        await pool.query('SELECT status FROM notification_deliveries WHERE outbox_id=$1', [
          fixture.outbox,
        ])
      ).rows[0].status,
    ).toBe('SENT');
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).not.toBeNull();
  });
  it('falha em um canal não reenvia canal concluído nem altera reunião', async () => {
    const fixture = await seed();
    let smtp = 0;
    let telegram = 0;
    const processor = new OutboxProcessor(
      pool,
      service,
      [
        {
          channel: 'smtp',
          send: async () => {
            smtp++;
          },
        },
        {
          channel: 'telegram',
          send: async () => {
            telegram++;
            if (telegram === 1) throw new Error('synthetic-private-driver-error');
          },
        },
      ],
      config,
      queue,
    );
    await processor.process(fixture.outbox);
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).toBeNull();
    await pool.query('UPDATE meeting_outbox SET available_at=now() WHERE id=$1', [fixture.outbox]);
    await pool.query(
      'UPDATE notification_deliveries SET next_attempt_at=now() WHERE outbox_id=$1',
      [fixture.outbox],
    );
    await processor.process(fixture.outbox);
    expect({ smtp, telegram }).toEqual({ smtp: 1, telegram: 2 });
    expect(
      (await pool.query('SELECT status FROM meetings WHERE id=$1', [fixture.meeting])).rows[0]
        .status,
    ).toBe('PENDING');
    expect(
      JSON.stringify(
        (
          await pool.query(
            'SELECT last_error_code FROM notification_deliveries WHERE outbox_id=$1',
            [fixture.outbox],
          )
        ).rows,
      ),
    ).not.toContain('synthetic-private-driver');
  });
  it('preserva outbox quando Redis falha e BullMQ deduplica job pelo UUID sem PII', async () => {
    const fixture = await seed();
    const failing = new OutboxProcessor(pool, service, [], config, {
      add: async () => {
        throw new Error('synthetic-queue-failure');
      },
    });
    await expect(failing.dispatchDue()).rejects.toThrow();
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).toBeNull();
    const realQueue = new Queue(`test-outbox-${randomUUID()}`, {
      connection: redisConnection(process.env.TEST_REDIS_URL!),
    });
    try {
      const processor = new OutboxProcessor(pool, service, [], config, realQueue);
      await Promise.all([processor.dispatchDue(), processor.dispatchDue()]);
      const job = await realQueue.getJob(`outbox-${fixture.outbox}`);
      expect(job?.data).toEqual({ outboxId: fixture.outbox });
      expect(await realQueue.getWaitingCount()).toBe(1);
      await job?.remove();
      await pool.query('UPDATE meeting_outbox SET processed_at=now() WHERE id=$1', [
        fixture.outbox,
      ]);
    } finally {
      await realQueue.close();
    }
  });
  it('lembrete é persistido em SQL, agendado com delay e ignora versão cancelada', async () => {
    const fixture = await seed('NOTIFY_CONFIRMED', 'CONFIRMED');
    let sent = 0;
    const processor = new OutboxProcessor(
      pool,
      service,
      [
        {
          channel: 'smtp',
          send: async () => {
            sent++;
          },
        },
      ],
      config,
      queue,
    );
    await processor.process(fixture.outbox);
    const reminder = (
      await pool.query<{ id: string }>(
        `SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_REMINDER'`,
        [fixture.meeting],
      )
    ).rows[0]!;
    expect(
      queued.some(
        (job) => job.data.outboxId === reminder.id && JSON.stringify(job.options).includes('delay'),
      ),
    ).toBe(true);
    await pool.query(`UPDATE meetings SET status='CANCELLED',version=2 WHERE id=$1`, [
      fixture.meeting,
    ]);
    await pool.query('UPDATE meeting_outbox SET available_at=now() WHERE id=$1', [reminder.id]);
    await processor.process(reminder.id);
    expect(sent).toBe(1);
  });
  it('persiste lembrete antes do envio mesmo quando o canal de confirmação falha', async () => {
    const fixture = await seed('NOTIFY_CONFIRMED', 'CONFIRMED');
    const processor = new OutboxProcessor(
      pool,
      service,
      [
        {
          channel: 'smtp',
          send: async () => {
            throw new Error('synthetic-channel-failure');
          },
        },
      ],
      config,
      queue,
    );
    await processor.process(fixture.outbox);
    const reminder = (
      await pool.query<{ id: string }>(
        `SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_REMINDER' AND version=1`,
        [fixture.meeting],
      )
    ).rows[0];
    expect(reminder?.id).toBeDefined();
    expect(
      queued.some(
        (job) =>
          job.data.outboxId === reminder?.id && JSON.stringify(job.options).includes('delay'),
      ),
    ).toBe(true);
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).toBeNull();
    // Prevent this synthetic transient failure from entering another test's dispatcher.
    await pool.query('UPDATE meeting_outbox SET processed_at=now() WHERE id=$1', [fixture.outbox]);
  });
  it('retry após criação externa reaproveita evento antes de completar o estado local', async () => {
    const fixture = await seed('CALENDAR_CREATE', 'APPROVED');
    const calendar = new FakeCalendarAdapter();
    let first = true;
    const jobs: MeetingJobs = {
      ...service,
      processCalendarCreate: async (id) => {
        const meeting = (await service.getNotification(id)) as NotificationMeeting;
        const result = await calendar.ensureEvent({
          meetingId: meeting.id,
          version: meeting.version,
          start: meeting.start,
          end: meeting.end,
          timeZone: meeting.timeZone,
          attendee: { name: meeting.name, email: meeting.email },
          topic: meeting.topic,
        });
        if (first) {
          first = false;
          throw new Error('synthetic-crash-window');
        }
        await pool.query(
          `UPDATE meetings SET status='CONFIRMED',external_event_id=$2,version=version+1 WHERE id=$1`,
          [id, result.eventId],
        );
      },
    };
    const processor = new OutboxProcessor(pool, jobs, [], config, queue);
    await processor.process(fixture.outbox);
    expect(calendar.events.size).toBe(1);
    await pool.query('UPDATE meeting_outbox SET available_at=now() WHERE id=$1', [fixture.outbox]);
    await processor.process(fixture.outbox);
    expect(calendar.events.size).toBe(1);
    expect(
      (await pool.query('SELECT status FROM meetings WHERE id=$1', [fixture.meeting])).rows[0]
        .status,
    ).toBe('CONFIRMED');
  });
  it('recupera crash na última tentativa de notificação como falha terminal sem enviar novamente', async () => {
    const fixture = await seed();
    await pool.query(
      `UPDATE meeting_outbox SET attempts=$2,locked_until=now()-interval '1 second',leased_by=$3 WHERE id=$1`,
      [fixture.outbox, config.OUTBOX_MAX_ATTEMPTS, randomUUID()],
    );
    await pool.query(
      `INSERT INTO notification_deliveries(id,outbox_id,channel,status,attempts,locked_until) VALUES($1,$2,'smtp','SENDING',$3,now()-interval '1 second')`,
      [randomUUID(), fixture.outbox, config.OUTBOX_MAX_ATTEMPTS],
    );
    const processor = new OutboxProcessor(pool, service, [], config, queue);
    await processor.dispatchDue();
    expect(
      (
        await pool.query(
          'SELECT status,last_error_code FROM notification_deliveries WHERE outbox_id=$1',
          [fixture.outbox],
        )
      ).rows[0],
    ).toMatchObject({ status: 'FAILED', last_error_code: 'DELIVERY_ATTEMPTS_EXHAUSTED' });
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).not.toBeNull();
    expect(
      (await pool.query('SELECT status FROM meetings WHERE id=$1', [fixture.meeting])).rows[0]
        .status,
    ).toBe('PENDING');
  });
  it('recupera lembrete durável após crash na última confirmação sem reenviar o canal', async () => {
    const fixture = await seed('NOTIFY_CONFIRMED', 'CONFIRMED');
    await pool.query(
      `UPDATE meeting_outbox SET attempts=$2,locked_until=now()-interval '1 second',leased_by=$3 WHERE id=$1`,
      [fixture.outbox, config.OUTBOX_MAX_ATTEMPTS, randomUUID()],
    );
    await pool.query(
      `INSERT INTO notification_deliveries(id,outbox_id,channel,status,attempts,locked_until) VALUES($1,$2,'smtp','SENDING',$3,now()-interval '1 second')`,
      [randomUUID(), fixture.outbox, config.OUTBOX_MAX_ATTEMPTS],
    );
    let sent = 0;
    const processor = new OutboxProcessor(
      pool,
      service,
      [
        {
          channel: 'smtp',
          send: async () => {
            sent++;
          },
        },
      ],
      config,
      queue,
    );
    await processor.dispatchDue();
    await processor.dispatchDue();
    const reminders = await pool.query<{ id: string; available_at: Date }>(
      `SELECT id,available_at FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_REMINDER' AND version=1`,
      [fixture.meeting],
    );
    expect(reminders.rows).toHaveLength(1);
    expect(reminders.rows[0]!.available_at.getTime()).toBeGreaterThan(Date.now());
    expect(
      queued.some(
        (job) =>
          job.data.outboxId === reminders.rows[0]!.id &&
          JSON.stringify(job.options).includes('delay'),
      ),
    ).toBe(true);
    expect(sent).toBe(0);
    expect(
      (await pool.query('SELECT processed_at FROM meeting_outbox WHERE id=$1', [fixture.outbox]))
        .rows[0].processed_at,
    ).not.toBeNull();
    expect(
      (
        await pool.query('SELECT status FROM notification_deliveries WHERE outbox_id=$1', [
          fixture.outbox,
        ])
      ).rows[0].status,
    ).toBe('FAILED');
    const stale = await seed('NOTIFY_CONFIRMED', 'CONFIRMED');
    await pool.query(`UPDATE meetings SET status='CANCELLED',version=2 WHERE id=$1`, [
      stale.meeting,
    ]);
    await pool.query(`UPDATE meeting_outbox SET attempts=$2 WHERE id=$1`, [
      stale.outbox,
      config.OUTBOX_MAX_ATTEMPTS,
    ]);
    await processor.dispatchDue();
    expect(
      (
        await pool.query(
          `SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_REMINDER'`,
          [stale.meeting],
        )
      ).rowCount,
    ).toBe(0);
  });
  it('retenta a recuperação final do calendário quando a persistência está ocupada e mantém a reserva', async () => {
    const fixture = await seed('CALENDAR_CREATE', 'APPROVED');
    await pool.query(
      `UPDATE meeting_outbox SET attempts=$2,locked_until=now()-interval '1 second',leased_by=$3 WHERE id=$1`,
      [fixture.outbox, config.OUTBOX_MAX_ATTEMPTS, randomUUID()],
    );
    let recovered = 0;
    let calendarInvocations = 0;
    const expectedVersions: number[] = [];
    const processor = new OutboxProcessor(
      pool,
      {
        ...service,
        processCalendarCreate: async () => {
          calendarInvocations++;
        },
        processCalendarFailure: async (id, code, expectedVersion) => {
          expectedVersions.push(expectedVersion);
          recovered++;
          if (recovered === 1) throw new Error('synthetic-lease-active');
          await pool.query(`UPDATE meetings SET status='FAILED',failure_code=$2 WHERE id=$1`, [
            id,
            code,
          ]);
        },
      },
      [],
      config,
      queue,
    );
    await processor.dispatchDue();
    expect(
      (
        await pool.query('SELECT last_error_code,locked_until FROM meeting_outbox WHERE id=$1', [
          fixture.outbox,
        ])
      ).rows[0],
    ).toEqual({ last_error_code: null, locked_until: null });
    await processor.dispatchDue();
    await processor.dispatchDue();
    expect({ recovered, calendarInvocations }).toEqual({ recovered: 2, calendarInvocations: 0 });
    expect(expectedVersions).toEqual([1, 1]);
    expect(
      (
        await pool.query('SELECT status,reserved_start FROM meetings WHERE id=$1', [
          fixture.meeting,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'FAILED', reserved_start: expect.any(Date) });
    expect(
      (
        await pool.query('SELECT processed_at,last_error_code FROM meeting_outbox WHERE id=$1', [
          fixture.outbox,
        ])
      ).rows[0],
    ).toEqual({ processed_at: null, last_error_code: 'OUTBOX_ATTEMPTS_EXHAUSTED' });
  });
  it('última falha normal do calendário fica visível e não agenda nova chamada externa', async () => {
    const fixture = await seed('CALENDAR_CREATE', 'APPROVED');
    await pool.query('UPDATE meeting_outbox SET attempts=$2 WHERE id=$1', [
      fixture.outbox,
      config.OUTBOX_MAX_ATTEMPTS - 1,
    ]);
    let calls = 0;
    let recovered = 0;
    const expectedVersions: number[] = [];
    const processor = new OutboxProcessor(
      pool,
      {
        ...service,
        processCalendarCreate: async () => {
          calls++;
          throw new Error('synthetic-private-error');
        },
        processCalendarFailure: async (id, code, expectedVersion) => {
          expectedVersions.push(expectedVersion);
          recovered++;
          await pool.query(`UPDATE meetings SET status='FAILED',failure_code=$2 WHERE id=$1`, [
            id,
            code,
          ]);
        },
      },
      [],
      config,
      queue,
    );
    await processor.process(fixture.outbox);
    await processor.process(fixture.outbox);
    await processor.dispatchDue();
    expect({ calls, recovered }).toEqual({ calls: 1, recovered: 1 });
    expect(expectedVersions).toEqual([1]);
    expect(
      (
        await pool.query('SELECT status,reserved_start FROM meetings WHERE id=$1', [
          fixture.meeting,
        ])
      ).rows[0],
    ).toMatchObject({ status: 'FAILED', reserved_start: expect.any(Date) });
    expect(
      (
        await pool.query('SELECT processed_at,last_error_code FROM meeting_outbox WHERE id=$1', [
          fixture.outbox,
        ])
      ).rows[0],
    ).toEqual({ processed_at: null, last_error_code: 'OUTBOX_ATTEMPTS_EXHAUSTED' });
  });
  it('notifica falha de limpeza de cancelamento sem afirmar que o evento externo foi removido', async () => {
    const fixture = await seed('NOTIFY_FAILED', 'CANCELLED');
    const messages: { subject: string; text: string }[] = [];
    const processor = new OutboxProcessor(
      pool,
      service,
      [
        {
          channel: 'smtp',
          send: async (message) => {
            messages.push(message);
          },
        },
      ],
      config,
      queue,
    );
    await processor.process(fixture.outbox);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toBe('Não foi possível concluir a operação de calendário');
    expect(messages[0]?.text).not.toContain('Reunião cancelada');
    expect(
      (
        await pool.query('SELECT status,calendar_cancelled_at FROM meetings WHERE id=$1', [
          fixture.meeting,
        ])
      ).rows[0],
    ).toEqual({ status: 'CANCELLED', calendar_cancelled_at: null });
  });
});
