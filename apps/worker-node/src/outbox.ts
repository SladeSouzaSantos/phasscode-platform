import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { WorkerConfig } from '../../../packages/shared-config/src/worker.js';
import type { NotificationSender } from '../../../packages/integrations/src/notifications.js';

export interface NotificationMeeting {
  id: string;
  version: number;
  status: string;
  name: string;
  email: string;
  start: Date;
  end: Date;
  timeZone: string;
  topic: string;
}
export interface MeetingJobs {
  processCalendarCreate(id: string): Promise<void>;
  processCalendarCancel(id: string): Promise<void>;
  getNotification(id: string): Promise<NotificationMeeting | null>;
  processCalendarFailure(id: string, code: string, expectedVersion: number): Promise<void>;
}
export interface OutboxQueue {
  add(
    name: string,
    data: { outboxId: string },
    options: { jobId: string; delay?: number; removeOnComplete: boolean; removeOnFail: boolean },
  ): Promise<unknown>;
}
interface OutboxRow {
  id: string;
  meeting_id: string;
  kind: string;
  version: number;
  attempts: number;
  leased_by: string;
}
const channelStatus: Record<string, string> = {
  NOTIFY_REQUESTED: 'PENDING',
  NOTIFY_APPROVED: 'APPROVED',
  NOTIFY_REJECTED: 'REJECTED',
  NOTIFY_CONFIRMED: 'CONFIRMED',
  NOTIFY_CANCELLED: 'CANCELLED',
  NOTIFY_FAILED: 'FAILED',
  NOTIFY_REMINDER: 'CONFIRMED',
};
const subjects: Record<string, string> = {
  NOTIFY_REQUESTED: 'Solicitação de reunião recebida',
  NOTIFY_APPROVED: 'Reunião aprovada; confirmação em processamento',
  NOTIFY_REJECTED: 'Solicitação de reunião recusada',
  NOTIFY_CONFIRMED: 'Reunião confirmada',
  NOTIFY_CANCELLED: 'Reunião cancelada',
  NOTIFY_FAILED: 'Não foi possível concluir a operação de calendário',
  NOTIFY_REMINDER: 'Lembrete de reunião confirmada',
};
export class OutboxProcessor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly meetings: MeetingJobs,
    private readonly senders: readonly NotificationSender[],
    private readonly config: WorkerConfig,
    private readonly queue: OutboxQueue,
  ) {}

  async dispatchDue(): Promise<number> {
    // Recover a crash after the final claim. Calendar cleanup remains visibly fatal;
    // notifications become terminal without changing the meeting itself.
    const recoveryOwner = randomUUID();
    const exhausted = await this.pool.query<OutboxRow>(
      `WITH candidate AS (SELECT id FROM meeting_outbox WHERE processed_at IS NULL AND attempts >= $1 AND (locked_until IS NULL OR locked_until < now()) AND last_error_code IS DISTINCT FROM 'OUTBOX_ATTEMPTS_EXHAUSTED' ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE meeting_outbox o SET leased_by=$2,locked_until=now()+($3::int*interval '1 millisecond') FROM candidate WHERE o.id=candidate.id RETURNING o.*`,
      [this.config.OUTBOX_MAX_ATTEMPTS, recoveryOwner, this.config.OUTBOX_LEASE_MS],
    );
    for (const row of exhausted.rows) {
      try {
        if (row.kind.startsWith('CALENDAR_'))
          await this.meetings.processCalendarFailure(
            row.meeting_id,
            'OUTBOX_ATTEMPTS_EXHAUSTED',
            row.version,
          );
        else {
          if (row.kind === 'NOTIFY_CONFIRMED') {
            const meeting = await this.meetings.getNotification(row.meeting_id);
            if (meeting?.status === 'CONFIRMED' && meeting.version === row.version)
              await this.scheduleReminder(meeting);
          }
          await this.pool.query(
            `UPDATE notification_deliveries SET status='FAILED',locked_until=NULL,lease_token=NULL,last_error_code='DELIVERY_ATTEMPTS_EXHAUSTED',updated_at=now() WHERE outbox_id=$1 AND status IN ('PENDING','SENDING')`,
            [row.id],
          );
        }
        await this.pool.query(
          `UPDATE meeting_outbox SET processed_at=CASE WHEN kind LIKE 'CALENDAR_%' THEN NULL ELSE now() END,last_error_code='OUTBOX_ATTEMPTS_EXHAUSTED',leased_by=NULL,locked_until=NULL WHERE id=$1 AND leased_by=$2`,
          [row.id, recoveryOwner],
        );
      } catch {
        await this.pool.query(
          'UPDATE meeting_outbox SET leased_by=NULL,locked_until=NULL WHERE id=$1 AND leased_by=$2',
          [row.id, recoveryOwner],
        );
      }
    }
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM meeting_outbox WHERE processed_at IS NULL AND attempts < $1 AND available_at <= now() AND (locked_until IS NULL OR locked_until < now()) ORDER BY available_at,created_at LIMIT 50`,
      [this.config.OUTBOX_MAX_ATTEMPTS],
    );
    for (const row of result.rows)
      await this.queue.add(
        'outbox',
        { outboxId: row.id },
        { jobId: `outbox-${row.id}`, removeOnComplete: true, removeOnFail: true },
      );
    return result.rowCount ?? 0;
  }

  async process(id: string): Promise<void> {
    const owner = randomUUID();
    const result = await this.pool.query<OutboxRow>(
      `WITH candidate AS (SELECT id FROM meeting_outbox WHERE id=$1 AND processed_at IS NULL AND attempts < $4 AND available_at <= now() AND (locked_until IS NULL OR locked_until < now()) FOR UPDATE SKIP LOCKED) UPDATE meeting_outbox o SET leased_by=$2,locked_until=now()+($3::int*interval '1 millisecond'),attempts=attempts+1 FROM candidate WHERE o.id=candidate.id RETURNING o.*`,
      [id, owner, this.config.OUTBOX_LEASE_MS, this.config.OUTBOX_MAX_ATTEMPTS],
    );
    const row = result.rows[0];
    if (!row) return;
    let ownsLease = true;
    let stoppingRenewals = false;
    const pendingRenewals = new Set<Promise<void>>();
    const heartbeat = setInterval(
      () => {
        if (stoppingRenewals) return;
        const renewal = (async () => {
          try {
            const value = await this.pool.query(
              `UPDATE meeting_outbox SET locked_until=now()+($3::int*interval '1 millisecond') WHERE id=$1 AND leased_by=$2 AND processed_at IS NULL`,
              [id, owner, this.config.OUTBOX_LEASE_MS],
            );
            if (!value.rowCount) ownsLease = false;
          } catch {
            ownsLease = false;
          }
        })();
        pendingRenewals.add(renewal);
        void renewal.then(() => pendingRenewals.delete(renewal));
      },
      Math.floor(this.config.OUTBOX_LEASE_MS / 3),
    );
    try {
      if (row.kind === 'CALENDAR_CREATE') await this.meetings.processCalendarCreate(row.meeting_id);
      else if (row.kind === 'CALENDAR_CANCEL')
        await this.meetings.processCalendarCancel(row.meeting_id);
      else await this.deliver(row, () => ownsLease);
      if (!ownsLease) throw new Error('OUTBOX_LEASE_LOST');
      await this.pool.query(
        `UPDATE meeting_outbox SET processed_at=now(),leased_by=NULL,locked_until=NULL,last_error_code=NULL WHERE id=$1 AND leased_by=$2`,
        [id, owner],
      );
    } catch {
      if (row.attempts >= this.config.OUTBOX_MAX_ATTEMPTS && row.kind.startsWith('CALENDAR_'))
        await this.meetings.processCalendarFailure(
          row.meeting_id,
          'OUTBOX_ATTEMPTS_EXHAUSTED',
          row.version,
        );
      // SQL remains authoritative across queue failures and process restarts. No error body is stored.
      await this.pool.query(
        `UPDATE meeting_outbox SET available_at=now()+($3::int*interval '1 second'),leased_by=NULL,locked_until=NULL,last_error_code=$4 WHERE id=$1 AND leased_by=$2`,
        [
          id,
          owner,
          Math.min(300, 2 ** row.attempts),
          row.attempts >= this.config.OUTBOX_MAX_ATTEMPTS && row.kind.startsWith('CALENDAR_')
            ? 'OUTBOX_ATTEMPTS_EXHAUSTED'
            : 'OUTBOX_RETRY',
        ],
      );
    } finally {
      // The runtime must not close the pool while an earlier heartbeat still uses it.
      stoppingRenewals = true;
      clearInterval(heartbeat);
      await Promise.all(pendingRenewals);
    }
  }

  private async deliver(row: OutboxRow, lease: () => boolean): Promise<void> {
    const meeting = await this.meetings.getNotification(row.meeting_id);
    if (
      !meeting ||
      meeting.version !== row.version ||
      (meeting.status !== channelStatus[row.kind] &&
        !(row.kind === 'NOTIFY_FAILED' && meeting.status === 'CANCELLED'))
    )
      return;
    if (row.kind === 'NOTIFY_REMINDER' && meeting.start.getTime() <= Date.now()) return;
    // A failed channel must not prevent the independent, durable reminder.
    if (row.kind === 'NOTIFY_CONFIRMED') await this.scheduleReminder(meeting);
    let retry = false;
    for (const sender of this.senders) {
      if (!lease()) throw new Error('OUTBOX_LEASE_LOST');
      await this.pool.query(
        `INSERT INTO notification_deliveries(id,outbox_id,channel) VALUES($1,$2,$3) ON CONFLICT(outbox_id,channel) DO NOTHING`,
        [randomUUID(), row.id, sender.channel],
      );
      const token = randomUUID();
      const claim = await this.pool.query<{ id: string; attempts: number }>(
        `UPDATE notification_deliveries SET status='SENDING',attempts=attempts+1,lease_token=$3,locked_until=now()+($4::int*interval '1 millisecond'),updated_at=now() WHERE outbox_id=$1 AND channel=$2 AND status IN ('PENDING','SENDING') AND attempts < $5 AND next_attempt_at <= now() AND (locked_until IS NULL OR locked_until < now()) RETURNING id,attempts`,
        [
          row.id,
          sender.channel,
          token,
          this.config.OUTBOX_LEASE_MS,
          this.config.OUTBOX_MAX_ATTEMPTS,
        ],
      );
      const delivery = claim.rows[0];
      if (!delivery) {
        const state = await this.pool.query<{ status: string }>(
          'SELECT status FROM notification_deliveries WHERE outbox_id=$1 AND channel=$2',
          [row.id, sender.channel],
        );
        if (state.rows[0]?.status !== 'SENT' && state.rows[0]?.status !== 'FAILED') retry = true;
        continue;
      }
      try {
        await sender.send({
          deliveryId: delivery.id,
          recipient: meeting.email,
          subject: subjects[row.kind] ?? 'Atualização de reunião',
          text: `${subjects[row.kind] ?? 'Atualização de reunião'}\nHorário: ${meeting.start.toISOString()}\nFuso: ${meeting.timeZone}\nReferência: ${meeting.id}\nAcompanhe a solicitação pelo portfólio.`,
        });
        await this.pool.query(
          `UPDATE notification_deliveries SET status='SENT',sent_at=now(),locked_until=NULL,lease_token=NULL,last_error_code=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`,
          [delivery.id, token],
        );
      } catch {
        const terminal = delivery.attempts >= this.config.OUTBOX_MAX_ATTEMPTS;
        await this.pool.query(
          `UPDATE notification_deliveries SET status=$3,locked_until=NULL,lease_token=NULL,last_error_code='NOTIFICATION_UNAVAILABLE',next_attempt_at=now()+($4::int*interval '1 second'),updated_at=now() WHERE id=$1 AND lease_token=$2`,
          [
            delivery.id,
            token,
            terminal ? 'FAILED' : 'PENDING',
            Math.min(300, 2 ** delivery.attempts),
          ],
        );
        if (!terminal) retry = true;
      }
    }
    if (retry) throw new Error('NOTIFICATION_RETRY');
  }

  private async scheduleReminder(meeting: NotificationMeeting): Promise<void> {
    const at = new Date(meeting.start.getTime() - this.config.REMINDER_BEFORE_MINUTES * 60000);
    if (at.getTime() <= Date.now()) return;
    const result = await this.pool.query<{ id: string; available_at: Date }>(
      `INSERT INTO meeting_outbox(id,meeting_id,kind,version,available_at) VALUES($1,$2,'NOTIFY_REMINDER',$3,$4) ON CONFLICT(meeting_id,kind,version) DO UPDATE SET version=excluded.version RETURNING id,available_at`,
      [randomUUID(), meeting.id, meeting.version, at],
    );
    const reminder = result.rows[0]!;
    await this.queue.add(
      'outbox',
      { outboxId: reminder.id },
      {
        jobId: `outbox-${reminder.id}`,
        delay: Math.max(0, reminder.available_at.getTime() - Date.now()),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
