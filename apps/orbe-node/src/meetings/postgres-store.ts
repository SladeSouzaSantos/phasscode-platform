import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../domain/errors.js';
import type { MeetingStatus } from '../../../../packages/contracts/src/meetings.js';
import type {
  CalendarLease,
  MeetingCursor,
  MeetingRecord,
  MeetingStore,
  ProposalRecord,
} from './ports.js';

type Row = {
  id: string;
  status: MeetingStatus;
  name: string;
  email: string;
  topic: string;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  created_at: Date;
  updated_at: Date;
  version: number;
  token_hash: string;
  failure_code: string | null;
  external_event_id: string | null;
  calendar_create_uncertain: boolean;
  calendar_cancelled_at: Date | null;
};
const record = (row: Row): MeetingRecord => ({
  id: row.id,
  status: row.status,
  name: row.name,
  email: row.email,
  topic: row.topic,
  start: row.starts_at,
  end: row.ends_at,
  timeZone: row.time_zone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
  tokenHash: row.token_hash,
  failureCode: row.failure_code,
  externalEventId: row.external_event_id,
  calendarCreateUncertain: row.calendar_create_uncertain,
  calendarCancelledAt: row.calendar_cancelled_at,
});
const missing = () =>
  new AppError('MEETING_NOT_FOUND', 404, 'Solicitação indisponível ou token inválido.');
const state = () =>
  new AppError('MEETING_INVALID_STATE', 409, 'A solicitação não permite esta transição.');
const idempotency = () =>
  new AppError(
    'IDEMPOTENCY_CONFLICT',
    409,
    'Chave de idempotência já utilizada para outra solicitação.',
  );
export class PostgresMeetingStore implements MeetingStore {
  constructor(private readonly pool: pg.Pool) {}
  private async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error.code === '23P01' || error.code === '40P01')
      )
        throw new AppError(
          'MEETING_SLOT_UNAVAILABLE',
          409,
          'O horário foi reservado por outra aprovação.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private async outbox(client: pg.PoolClient, row: MeetingRecord, kind: string, now: Date) {
    await client.query(
      'INSERT INTO meeting_outbox(id,meeting_id,kind,version,available_at,created_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(meeting_id,kind,version) DO NOTHING',
      [randomUUID(), row.id, kind, row.version, now],
    );
  }
  private async audit(
    client: pg.PoolClient,
    row: MeetingRecord,
    action: string,
    actorId: string | null,
    now: Date,
  ) {
    await client.query(
      'INSERT INTO meeting_audit(id,meeting_id,actor_id,action,version,created_at) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(), row.id, actorId, action, row.version, now],
    );
  }
  async createProposal(p: ProposalRecord, now: Date) {
    await this.pool.query(
      'INSERT INTO meeting_proposals(id,token_hash,name,email,topic,starts_at,ends_at,time_zone,consent_version,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        p.id,
        p.tokenHash,
        p.name,
        p.email,
        p.topic,
        p.start,
        p.end,
        p.timeZone,
        p.consentVersion,
        now,
        p.expiresAt,
      ],
    );
  }
  async getProposal(id: string, tokenHash: string): Promise<ProposalRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM meeting_proposals WHERE id=$1 AND token_hash=$2',
      [id, tokenHash],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          tokenHash: row.token_hash,
          name: row.name,
          email: row.email,
          topic: row.topic,
          start: row.starts_at,
          end: row.ends_at,
          timeZone: row.time_zone,
          consentVersion: row.consent_version,
          expiresAt: row.expires_at,
        }
      : null;
  }
  async findIdempotent(keyHash: string, bodyHash: string): Promise<MeetingRecord | null> {
    const result = await this.pool.query<Row & { request_hash: string }>(
      'SELECT * FROM meetings WHERE idempotency_hash=$1',
      [keyHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.request_hash !== bodyHash) throw idempotency();
    return record(row);
  }
  async consumeProposal(input: {
    proposalId: string;
    tokenHash: string;
    keyHash: string;
    bodyHash: string;
    consentVersion: string;
    now: Date;
  }): Promise<MeetingRecord> {
    try {
      return await this.transaction(async (client) => {
        const previous = await client.query<Row & { request_hash: string }>(
          'SELECT * FROM meetings WHERE idempotency_hash=$1',
          [input.keyHash],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].request_hash !== input.bodyHash) throw idempotency();
          return record(previous.rows[0]);
        }
        const proposal = (
          await client.query(
            'SELECT * FROM meeting_proposals WHERE id=$1 AND token_hash=$2 FOR UPDATE',
            [input.proposalId, input.tokenHash],
          )
        ).rows[0];
        if (
          !proposal ||
          proposal.expires_at <= input.now ||
          proposal.consent_version !== input.consentVersion
        )
          throw missing();
        if (proposal.consumed_at) {
          const replay = await client.query<
            Row & { request_hash: string; idempotency_hash: string }
          >('SELECT * FROM meetings WHERE id=$1', [proposal.meeting_id]);
          const row = replay.rows[0];
          if (row && row.idempotency_hash === input.keyHash && row.request_hash === input.bodyHash)
            return record(row);
          throw new AppError('PROPOSAL_ALREADY_USED', 409, 'Esta proposta já foi confirmada.');
        }
        const id = randomUUID();
        const inserted = await client.query<Row>(
          `INSERT INTO meetings(id,proposal_id,status,name,email,topic,starts_at,ends_at,time_zone,token_hash,consent_version,consented_at,idempotency_hash,request_hash,created_at,updated_at) VALUES($1,$2,'PENDING',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11,$11) RETURNING *`,
          [
            id,
            proposal.id,
            proposal.name,
            proposal.email,
            proposal.topic,
            proposal.starts_at,
            proposal.ends_at,
            proposal.time_zone,
            input.tokenHash,
            input.consentVersion,
            input.now,
            input.keyHash,
            input.bodyHash,
          ],
        );
        const row = record(inserted.rows[0]!);
        await client.query(
          'UPDATE meeting_proposals SET consumed_at=$2,meeting_id=$3 WHERE id=$1',
          [proposal.id, input.now, id],
        );
        await this.outbox(client, row, 'NOTIFY_REQUESTED', input.now);
        await this.audit(client, row, 'REQUESTED', null, input.now);
        return row;
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
        const previous = await this.findIdempotent(input.keyHash, input.bodyHash);
        if (previous) return previous;
      }
      throw error;
    }
  }
  async get(id: string) {
    const result = await this.pool.query<Row>('SELECT * FROM meetings WHERE id=$1', [id]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }
  async getPrivate(id: string, tokenHash: string) {
    const result = await this.pool.query<Row>(
      'SELECT * FROM meetings WHERE id=$1 AND token_hash=$2',
      [id, tokenHash],
    );
    return result.rows[0] ? record(result.rows[0]) : null;
  }
  async busy(start: Date, end: Date) {
    const result = await this.pool.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at,ends_at FROM meetings WHERE reserved_start IS NOT NULL AND reserved_start < $2 AND reserved_end > $1`,
      [start, end],
    );
    return result.rows.map((row) => ({ start: row.starts_at, end: row.ends_at }));
  }
  async list(input: { limit: number; cursor?: MeetingCursor; status?: MeetingStatus }) {
    const result = await this.pool.query<Row>(
      'SELECT * FROM meetings WHERE ($1::text IS NULL OR status=$1) AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4',
      [
        input.status ?? null,
        input.cursor?.createdAt ?? null,
        input.cursor?.id ?? null,
        input.limit,
      ],
    );
    return result.rows.map(record);
  }
  async approve(id: string, version: number, actorId: string, bufferMinutes: number, now: Date) {
    return this.transaction(async (client) => {
      // One owner/calendar: serialize the short reservation transaction before row locks.
      // GiST exclusion remains authoritative for writes from other implementations.
      // No network call runs while this transaction-scoped lock is held.
      await client.query('SELECT pg_advisory_xact_lock(81827420)');
      const existing = (
        await client.query<Row>('SELECT * FROM meetings WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!existing) throw missing();
      if (existing.status === 'APPROVED' || existing.status === 'CONFIRMED')
        return record(existing);
      if (!['PENDING', 'FAILED'].includes(existing.status) || existing.version !== version)
        throw state();
      const result = await client.query<Row>(
        `UPDATE meetings SET status='APPROVED',version=version+1,reserved_start=starts_at,reserved_end=ends_at+($2*interval '1 minute'),approved_by=$3,failure_code=NULL,updated_at=$4 WHERE id=$1 RETURNING *`,
        [id, bufferMinutes, actorId, now],
      );
      const row = record(result.rows[0]!);
      await this.outbox(client, row, 'CALENDAR_CREATE', now);
      await this.outbox(client, row, 'NOTIFY_APPROVED', now);
      await this.audit(client, row, 'APPROVED', actorId, now);
      return row;
    });
  }
  async transition(id: string, target: 'REJECTED' | 'CANCELLED', actorId: string, now: Date) {
    return this.transaction(async (client) => {
      const existing = (
        await client.query<Row>('SELECT * FROM meetings WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!existing) throw missing();
      if (existing.status === target) {
        if (target === 'CANCELLED') {
          // Only an explicit admin decision can reopen exhausted cleanup. Concurrent
          // replays see the cleared failure code and do not enqueue another cycle.
          const retry = await client.query<Row>(
            `UPDATE meetings SET version=version+1,failure_code=NULL,calendar_lease_id=NULL,calendar_lease_until=NULL,updated_at=$2 WHERE id=$1 AND reserved_start IS NOT NULL AND calendar_cancelled_at IS NULL AND failure_code='OUTBOX_ATTEMPTS_EXHAUSTED' AND (calendar_lease_until IS NULL OR calendar_lease_until<=$2) RETURNING *`,
            [id, now],
          );
          if (retry.rows[0]) {
            const row = record(retry.rows[0]);
            await this.outbox(client, row, 'CALENDAR_CANCEL', now);
            await this.audit(client, row, 'CANCEL_RETRY_REQUESTED', actorId, now);
            return row;
          }
        }
        return record(existing);
      }
      if (
        (target === 'REJECTED' && existing.status !== 'PENDING') ||
        (target === 'CANCELLED' &&
          !['PENDING', 'APPROVED', 'CONFIRMED', 'FAILED'].includes(existing.status))
      )
        throw state();
      const result = await client.query<Row>(
        'UPDATE meetings SET status=$2,version=version+1,updated_at=$3 WHERE id=$1 RETURNING *',
        [id, target, now],
      );
      const row = record(result.rows[0]!);
      if (target === 'CANCELLED') await this.outbox(client, row, 'CALENDAR_CANCEL', now);
      if (target === 'REJECTED') await this.outbox(client, row, 'NOTIFY_REJECTED', now);
      await this.audit(client, row, target, actorId, now);
      return row;
    });
  }
  async claimCalendar(
    id: string,
    kind: 'CREATE' | 'CANCEL',
    leaseSeconds: number,
    now: Date,
  ): Promise<CalendarLease | null> {
    const leaseId = randomUUID();
    const result = await this.pool.query<Row>(
      `UPDATE meetings SET calendar_lease_id=$2,calendar_lease_until=$3+($4*interval '1 second') WHERE id=$1 AND status=$5 AND (calendar_lease_until IS NULL OR calendar_lease_until <= $3) AND ($5 <> 'CANCELLED' OR calendar_cancelled_at IS NULL) RETURNING *`,
      [id, leaseId, now, leaseSeconds, kind === 'CREATE' ? 'APPROVED' : 'CANCELLED'],
    );
    return result.rows[0] ? { meeting: record(result.rows[0]), leaseId } : null;
  }
  async calendarCreated(id: string, leaseId: string, eventId: string, now: Date): Promise<boolean> {
    return this.transaction(async (client) => {
      const existing = (
        await client.query<Row>(
          'SELECT * FROM meetings WHERE id=$1 AND calendar_lease_id=$2 FOR UPDATE',
          [id, leaseId],
        )
      ).rows[0];
      if (!existing) return false;
      if (!['APPROVED', 'CANCELLED'].includes(existing.status)) return false;
      const confirmed = existing.status === 'APPROVED';
      const result = await client.query<Row>(
        `UPDATE meetings SET external_event_id=$3,calendar_create_uncertain=false,calendar_lease_id=NULL,calendar_lease_until=NULL,status=CASE WHEN status='APPROVED' THEN 'CONFIRMED' ELSE status END,version=version+1,updated_at=$4,failure_code=NULL WHERE id=$1 AND calendar_lease_id=$2 RETURNING *`,
        [id, leaseId, eventId, now],
      );
      const row = record(result.rows[0]!);
      await this.outbox(client, row, confirmed ? 'NOTIFY_CONFIRMED' : 'CALENDAR_CANCEL', now);
      await this.audit(client, row, confirmed ? 'CONFIRMED' : 'CREATE_AFTER_CANCEL', null, now);
      return confirmed;
    });
  }
  async calendarCreateStarted(id: string, leaseId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE meetings SET calendar_create_uncertain=true WHERE id=$1 AND calendar_lease_id=$2 AND calendar_lease_until>$3 AND status='APPROVED'`,
      [id, leaseId, now],
    );
    return (result.rowCount ?? 0) > 0;
  }
  async calendarCancelled(id: string, leaseId: string, now: Date) {
    await this.transaction(async (client) => {
      const result = await client.query<Row>(
        `UPDATE meetings SET calendar_lease_id=NULL,calendar_lease_until=NULL,calendar_create_uncertain=false,calendar_cancelled_at=$3,reserved_start=NULL,reserved_end=NULL,failure_code=NULL,updated_at=$3 WHERE id=$1 AND calendar_lease_id=$2 AND status='CANCELLED' RETURNING *`,
        [id, leaseId, now],
      );
      if (result.rows[0]) {
        const row = record(result.rows[0]);
        await this.audit(client, row, 'CALENDAR_CANCELLED', null, now);
        await this.outbox(client, row, 'NOTIFY_CANCELLED', now);
      }
    });
  }
  async calendarFailed(
    id: string,
    leaseId: string,
    code: string,
    terminal: boolean,
    now: Date,
    clearCreateUncertainty = false,
  ) {
    await this.transaction(async (client) => {
      const result = await client.query<Row>(
        `UPDATE meetings SET calendar_lease_id=NULL,calendar_lease_until=NULL,failure_code=$3,calendar_create_uncertain=CASE WHEN $6 THEN false ELSE calendar_create_uncertain END,reserved_start=CASE WHEN $4 AND $3='CALENDAR_CONFLICT' AND status='APPROVED' AND $6 THEN NULL ELSE reserved_start END,reserved_end=CASE WHEN $4 AND $3='CALENDAR_CONFLICT' AND status='APPROVED' AND $6 THEN NULL ELSE reserved_end END,status=CASE WHEN $4 AND status='APPROVED' THEN 'FAILED' ELSE status END,version=version+CASE WHEN $4 AND status='APPROVED' THEN 1 ELSE 0 END,updated_at=$5 WHERE id=$1 AND calendar_lease_id=$2 RETURNING *`,
        [id, leaseId, code, terminal, now, clearCreateUncertainty],
      );
      const row = result.rows[0];
      if (row && terminal) {
        const mapped = record(row);
        await this.outbox(client, mapped, 'NOTIFY_FAILED', now);
        await this.audit(client, mapped, 'CALENDAR_FAILED', null, now);
      }
    });
  }
  async exhaustCalendar(id: string, code: string, expectedVersion: number, now: Date) {
    return this.transaction(async (client) => {
      const result = await client.query<Row>(
        `UPDATE meetings SET failure_code=$2,status=CASE WHEN status='APPROVED' THEN 'FAILED' ELSE status END,calendar_lease_id=NULL,calendar_lease_until=NULL,version=version+1,updated_at=$3 WHERE id=$1 AND version=$4 AND (status='APPROVED' OR (status='CANCELLED' AND calendar_cancelled_at IS NULL)) AND failure_code IS DISTINCT FROM $2 AND (calendar_lease_until IS NULL OR calendar_lease_until<=$3) RETURNING *`,
        [id, code, now, expectedVersion],
      );
      if (result.rows[0]) {
        const row = record(result.rows[0]);
        await this.outbox(client, row, 'NOTIFY_FAILED', now);
        await this.audit(client, row, 'CALENDAR_RETRIES_EXHAUSTED', null, now);
      }
      return result.rows.length > 0;
    });
  }
  async retain(cutoff: Date, now: Date) {
    return this.transaction(async (client) => {
      await client.query(
        'DELETE FROM meeting_proposals WHERE expires_at<$1 AND consumed_at IS NULL',
        [now],
      );
      const expired = await client.query<Row>(
        `UPDATE meetings SET status='CANCELLED',failure_code='REQUEST_EXPIRED',calendar_cancelled_at=$1,version=version+1,updated_at=$1 WHERE status='PENDING' AND (ends_at<=$1 OR created_at<$1::timestamptz-interval '7 days') RETURNING *`,
        [now],
      );
      for (const expiredRow of expired.rows) {
        const row = record(expiredRow);
        await this.audit(client, row, 'REQUEST_EXPIRED', null, now);
        await this.outbox(client, row, 'NOTIFY_CANCELLED', now);
      }
      const result = await client.query(
        `UPDATE meetings SET name='Removido',email='removed@invalid.example',topic='Dados removidos',token_hash=repeat('0',64) WHERE ends_at<$1 AND updated_at<$1 AND status IN ('REJECTED','CANCELLED','FAILED','CONFIRMED') AND email<>'removed@invalid.example' RETURNING proposal_id`,
        [cutoff],
      );
      if (result.rows.length)
        await client.query(
          `UPDATE meeting_proposals SET name='Removido',email='removed@invalid.example',topic='Dados removidos',token_hash=repeat('0',64) WHERE id=ANY($1::uuid[])`,
          [result.rows.map((row: { proposal_id: string }) => row.proposal_id)],
        );
      return result.rowCount ?? 0;
    });
  }
}
