import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { FakeCalendarAdapter } from '../packages/integrations/src/calendar.js';
import { loadMeetingConfig } from '../packages/shared-config/src/meetings.js';
import { MeetingService, hashMeetingSecret } from '../apps/orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../apps/orbe-node/src/meetings/postgres-store.js';
import type { CalendarPort } from '../apps/orbe-node/src/meetings/ports.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('Defina TEST_DATABASE_URL para um banco descartável de testes.');
const pool = createPool(process.env.TEST_DATABASE_URL);
const actor = randomUUID();
const ids: string[] = [];
const proposals: string[] = [];
const now = new Date('2026-10-22T12:00:00Z');
const policy = { ...loadMeetingConfig({}), enabled: true };
const store = new PostgresMeetingStore(pool);
const make = (calendar: CalendarPort = new FakeCalendarAdapter()) =>
  new MeetingService(policy, store, calendar, () => now);
async function request(
  service: MeetingService,
  start = '2026-10-24T12:00:00Z',
  key = randomUUID(),
) {
  const proposal = await service.prepareProposal({
    start,
    name: 'Visitante de teste',
    email: 'visitante@example.test',
    topic: 'Projeto demonstrativo',
  });
  proposals.push(proposal.proposalId);
  const body = {
    proposalId: proposal.proposalId,
    confirmationToken: proposal.confirmationToken,
    consent: true as const,
    consentVersion: proposal.consentVersion,
  };
  const meeting = await service.request(body, key);
  ids.push(meeting.id);
  return { proposal, body, meeting, key };
}
beforeAll(async () => {
  await migrate(pool);
  await pool.query('INSERT INTO auth_users(id,display_name) VALUES($1,$2)', [
    actor,
    'Administrador de teste',
  ]);
});
afterAll(async () => {
  try {
    await pool.query('DELETE FROM meeting_outbox WHERE meeting_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM meeting_audit WHERE meeting_id=ANY($1::uuid[])', [ids]);
    await pool.query('UPDATE meeting_proposals SET meeting_id=NULL WHERE id=ANY($1::uuid[])', [
      proposals,
    ]);
    await pool.query('DELETE FROM meetings WHERE id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM meeting_proposals WHERE id=ANY($1::uuid[])', [proposals]);
    await pool.query('DELETE FROM auth_users WHERE id=$1', [actor]);
  } finally {
    await pool.end();
  }
});
describe('reuniões com PostgreSQL real e calendário simulado', () => {
  it('PENDING não reserva; o mesmo horário aceita propostas e solicitações distintas', async () => {
    const service = make();
    const one = await request(service);
    const two = await request(service);
    expect(one.meeting.status).toBe('PENDING');
    expect(two.meeting.id).not.toBe(one.meeting.id);
    expect(await store.busy(new Date('2026-10-24T11:00Z'), new Date('2026-10-24T14:00Z'))).toEqual(
      [],
    );
    const stored = await pool.query(
      'SELECT token_hash,idempotency_hash,request_hash,reserved_start,consented_at FROM meetings WHERE id=$1',
      [one.meeting.id],
    );
    expect(stored.rows[0].token_hash).toBe(hashMeetingSecret(one.proposal.confirmationToken));
    expect(stored.rows[0].token_hash).not.toBe(one.proposal.confirmationToken);
    expect(stored.rows[0].reserved_start).toBeNull();
    expect(stored.rows[0].consented_at).toEqual(now);
    expect(
      (await pool.query('SELECT kind FROM meeting_outbox WHERE meeting_id=$1', [one.meeting.id]))
        .rows,
    ).toEqual([{ kind: 'NOTIFY_REQUESTED' }]);
  });
  it('retries simultâneos com mesma chave/corpo criam só uma reunião e um outbox', async () => {
    const service = make();
    const p = await service.prepareProposal({
      start: '2026-10-26T12:00:00Z',
      name: 'Visitante',
      email: 'v@example.test',
      topic: 'Projeto',
    });
    proposals.push(p.proposalId);
    const body = {
      proposalId: p.proposalId,
      confirmationToken: p.confirmationToken,
      consent: true as const,
      consentVersion: p.consentVersion,
    };
    const key = randomUUID();
    const result = await Promise.all([
      service.request(body, key),
      service.request(body, key),
      service.request(body, key),
    ]);
    ids.push(result[0]!.id);
    expect(new Set(result.map((item) => item.id)).size).toBe(1);
    expect(result.every((item) => item.meetingToken === p.confirmationToken)).toBe(true);
    expect(
      (await pool.query('SELECT id FROM meetings WHERE proposal_id=$1', [p.proposalId])).rowCount,
    ).toBe(1);
    expect(
      (await pool.query('SELECT id FROM meeting_outbox WHERE meeting_id=$1', [result[0]!.id]))
        .rowCount,
    ).toBe(1);
  });
  it('não reutiliza proposta nem chave para conteúdo diferente; consent false não persiste', async () => {
    const service = make();
    const first = await request(service, '2026-10-27T12:00:00Z');
    await expect(service.request(first.body, randomUUID())).rejects.toMatchObject({
      code: 'PROPOSAL_ALREADY_USED',
      status: 409,
    });
    const p = await service.prepareProposal({
      start: '2026-10-27T13:00:00Z',
      name: 'Outro visitante',
      email: 'outro@example.test',
      topic: 'Outro projeto',
    });
    proposals.push(p.proposalId);
    const body = {
      proposalId: p.proposalId,
      confirmationToken: p.confirmationToken,
      consent: true as const,
      consentVersion: p.consentVersion,
    };
    await expect(service.request(body, first.key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      service.request({ ...body, consent: false } as never, randomUUID()),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await pool.query('SELECT id FROM meetings WHERE proposal_id=$1', [p.proposalId])).rowCount,
    ).toBe(0);
  });
  it('exclusion constraint faz uma única aprovação vencer concorrência e mantém outbox atômico', async () => {
    for (let round = 0; round < 5; round++) {
      const service = make();
      const start = new Date(Date.parse('2026-10-28T12:00:00Z') + round * 3600000).toISOString();
      const one = await request(service, start);
      const two = await request(service, start);
      const result = await Promise.allSettled([
        service.approve(one.meeting.id, actor),
        service.approve(two.meeting.id, actor),
      ]);
      expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      expect(result.find((item) => item.status === 'rejected')).toMatchObject({
        reason: { code: 'MEETING_SLOT_UNAVAILABLE', status: 409 },
      });
      const rows = (
        await pool.query('SELECT id,status FROM meetings WHERE id=ANY($1::uuid[])', [
          [one.meeting.id, two.meeting.id],
        ])
      ).rows;
      expect(rows.filter((row) => row.status === 'APPROVED')).toHaveLength(1);
      expect(rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
      const winner = rows.find((row) => row.status === 'APPROVED')!;
      expect(
        (
          await pool.query(
            "SELECT kind FROM meeting_outbox WHERE meeting_id=$1 AND kind IN ('CALENDAR_CREATE','NOTIFY_APPROVED')",
            [winner.id],
          )
        ).rowCount,
      ).toBe(2);
      await service.cancel(winner.id, actor);
      await service.processCalendarCancel(winner.id);
    }
  });
  it('reunião às 09h bloqueia 09h30 e permite 09h45, com intervalo de quinze minutos', async () => {
    const service = make();
    const first = await request(service, '2026-10-29T12:00:00Z');
    const adjacent = await request(service, '2026-10-29T12:30:00Z');
    const spaced = await request(service, '2026-10-29T12:45:00Z');
    await service.approve(first.meeting.id, actor);
    await expect(service.approve(adjacent.meeting.id, actor)).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.approve(spaced.meeting.id, actor)).resolves.toMatchObject({
      status: 'APPROVED',
    });
    await service.cancel(first.meeting.id, actor);
    await service.cancel(spaced.meeting.id, actor);
    await service.processCalendarCancel(first.meeting.id);
    await service.processCalendarCancel(spaced.meeting.id);
  });
  it('rede externa não mantém conexão ou transação de aprovação aberta', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calendar = new FakeCalendarAdapter();
    let slow = false;
    const port: CalendarPort = {
      simulated: true,
      ensureEvent: (input) => calendar.ensureEvent(input),
      cancelEvent: (input) => calendar.cancelEvent(input),
      freeBusy: async (start, end) => {
        if (slow) {
          entered();
          await blocked;
        }
        return calendar.freeBusy(start, end);
      },
    };
    const service = make(port);
    const item = await request(service, '2026-10-30T12:00:00Z');
    slow = true;
    const pending = service.approve(item.meeting.id, actor);
    await started;
    try {
      expect(pool.idleCount).toBe(pool.totalCount);
      await expect(pool.query('SELECT 1')).resolves.toMatchObject({ rowCount: 1 });
      expect((await store.get(item.meeting.id))?.status).toBe('PENDING');
    } finally {
      release();
      await pending;
    }
    await service.cancel(item.meeting.id, actor);
    await service.processCalendarCancel(item.meeting.id);
  });
  it('confirma somente após evento verificado; reprocessamento não duplica evento', async () => {
    const calendar = new FakeCalendarAdapter();
    const service = make(calendar);
    const item = await request(service, '2026-10-31T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    expect((await store.get(item.meeting.id))?.externalEventId).toBeNull();
    await service.processCalendarCreate(item.meeting.id);
    await service.processCalendarCreate(item.meeting.id);
    expect((await store.get(item.meeting.id))?.status).toBe('CONFIRMED');
    expect(calendar.events.size).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_CONFIRMED'",
          [item.meeting.id],
        )
      ).rowCount,
    ).toBe(1);
    await service.cancel(item.meeting.id, actor);
    await service.processCalendarCancel(item.meeting.id);
    await service.processCalendarCancel(item.meeting.id);
    expect(calendar.events.size).toBe(0);
  });
  it('falha externa preserva APPROVED para retry; conflito definitivo gera FAILED sem confirmação', async () => {
    const calendar = new FakeCalendarAdapter();
    let transient = true;
    const port: CalendarPort = {
      simulated: true,
      freeBusy: (start, end) => calendar.freeBusy(start, end),
      cancelEvent: (input) => calendar.cancelEvent(input),
      ensureEvent: async () => {
        if (transient) throw new Error('secret raw response');
        throw new AppError('CALENDAR_CONFLICT', 409, 'Ocupado');
      },
    };
    const service = make(port);
    const item = await request(service, '2026-11-02T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    await expect(service.processCalendarCreate(item.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_UNAVAILABLE',
    });
    expect((await store.get(item.meeting.id))?.status).toBe('APPROVED');
    transient = false;
    await service.processCalendarCreate(item.meeting.id);
    expect((await store.get(item.meeting.id))?.status).toBe('FAILED');
    expect((await store.get(item.meeting.id))?.externalEventId).toBeNull();
  });
  it('cancelamento durante criação persiste compensação e remove evento ao concluir a rede', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calendar = new FakeCalendarAdapter();
    const port: CalendarPort = {
      simulated: true,
      freeBusy: (start, end) => calendar.freeBusy(start, end),
      cancelEvent: (input) => calendar.cancelEvent(input),
      ensureEvent: async (input) => {
        entered();
        await blocked;
        return calendar.ensureEvent(input);
      },
    };
    const service = make(port);
    const item = await request(service, '2026-11-03T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    const creating = service.processCalendarCreate(item.meeting.id);
    await started;
    try {
      await service.cancel(item.meeting.id, actor);
      await expect(service.processCalendarCancel(item.meeting.id)).rejects.toMatchObject({
        code: 'CALENDAR_PENDING',
      });
      expect(
        (
          await pool.query(
            "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='CALENDAR_CANCEL'",
            [item.meeting.id],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      release();
      await creating;
    }
    const row = await store.get(item.meeting.id);
    expect(row?.status).toBe('CANCELLED');
    expect(row?.calendarCancelledAt).toEqual(now);
    expect(calendar.events.size).toBe(0);
  });
  it('status privado omite PII, paginação cursor não repete linhas e rejeição é auditada', async () => {
    const service = make();
    const item = await request(service, '2026-11-04T12:00:00Z');
    await expect(service.status(item.meeting.id, 'b'.repeat(43))).rejects.toMatchObject({
      status: 404,
    });
    const status = await service.status(item.meeting.id, item.meeting.meetingToken);
    expect(JSON.stringify(status)).not.toContain('visitante@example.test');
    const first = await service.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const next = await service.list({ limit: 2, cursor: first.nextCursor! });
    expect(next.items.some((row) => first.items.some((previous) => previous.id === row.id))).toBe(
      false,
    );
    await service.reject(item.meeting.id, actor);
    await expect(service.approve(item.meeting.id, actor)).rejects.toMatchObject({
      code: 'MEETING_INVALID_STATE',
    });
    expect(
      (
        await pool.query(
          "SELECT actor_id FROM meeting_audit WHERE meeting_id=$1 AND action='REJECTED'",
          [item.meeting.id],
        )
      ).rows[0].actor_id,
    ).toBe(actor);
  });
  it('resultado externo ambíguo esgotado mantém reserva até cancelamento verificado', async () => {
    const service = make();
    const first = await request(service, '2026-11-05T12:00:00Z');
    const second = await request(service, '2026-11-05T12:00:00Z');
    await service.approve(first.meeting.id, actor);
    await service.processCalendarFailure(
      first.meeting.id,
      'CALENDAR_RETRIES_EXHAUSTED',
      (await store.get(first.meeting.id))!.version,
    );
    expect((await store.get(first.meeting.id))?.status).toBe('FAILED');
    await expect(service.approve(second.meeting.id, actor)).rejects.toMatchObject({ status: 409 });
    await service.cancel(first.meeting.id, actor);
    await expect(service.approve(second.meeting.id, actor)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_CANCELLED'",
          [first.meeting.id],
        )
      ).rowCount,
    ).toBe(0);
    await service.processCalendarCancel(first.meeting.id);
    await expect(service.approve(second.meeting.id, actor)).resolves.toMatchObject({
      status: 'APPROVED',
    });
    await service.cancel(second.meeting.id, actor);
    await service.processCalendarCancel(second.meeting.id);
  });
  it('mismatch de evento nunca libera reserva como se nenhum evento existisse', async () => {
    const calendar = new FakeCalendarAdapter();
    const port: CalendarPort = {
      simulated: true,
      freeBusy: (start, end) => calendar.freeBusy(start, end),
      cancelEvent: (input) => calendar.cancelEvent(input),
      ensureEvent: async () => {
        throw new AppError('CALENDAR_EVENT_MISMATCH', 409, 'Evento divergente');
      },
    };
    const service = make(port);
    const item = await request(service, '2026-11-06T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    await service.processCalendarCreate(item.meeting.id);
    expect((await store.get(item.meeting.id))?.failureCode).toBe('CALENDAR_EVENT_MISMATCH');
    expect(
      await store.busy(new Date('2026-11-06T11:00Z'), new Date('2026-11-06T14:00Z')),
    ).toHaveLength(1);
    await service.cancel(item.meeting.id, actor);
    await expect(service.processCalendarCancel(item.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    expect((await store.get(item.meeting.id))?.calendarCancelledAt).toBeNull();
  });
  it('expira PENDING após sete dias e anonimiza PII depois da retenção sem apagar auditoria', async () => {
    const service = make();
    const item = await request(service, '2026-11-07T12:00:00Z');
    await pool.query(
      "UPDATE meetings SET created_at=$2::timestamptz-interval '8 days' WHERE id=$1",
      [item.meeting.id, now],
    );
    await service.retain();
    expect((await store.get(item.meeting.id))?.status).toBe('CANCELLED');
    expect((await store.get(item.meeting.id))?.failureCode).toBe('REQUEST_EXPIRED');
    const future = new Date(now.getTime() + 150 * 86400000);
    await store.retain(new Date(future.getTime() - 90 * 86400000), future);
    expect((await store.get(item.meeting.id))?.email).toBe('removed@invalid.example');
    await expect(service.status(item.meeting.id, item.meeting.meetingToken)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_audit WHERE meeting_id=$1 AND action='REQUEST_EXPIRED'",
          [item.meeting.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('SELECT email FROM meeting_proposals WHERE id=$1', [
          item.proposal.proposalId,
        ])
      ).rows[0].email,
    ).toBe('removed@invalid.example');
  });
  it('esgotamento recupera depois do lease ativo e mantém callback idempotente', async () => {
    const service = make();
    const item = await request(service, '2026-11-09T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    const expectedVersion = (await store.get(item.meeting.id))!.version;
    await store.claimCalendar(item.meeting.id, 'CREATE', 120, now);
    await expect(
      service.processCalendarFailure(item.meeting.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', expectedVersion),
    ).rejects.toMatchObject({ code: 'CALENDAR_PENDING' });
    expect((await store.get(item.meeting.id))?.status).toBe('APPROVED');
    await pool.query('UPDATE meetings SET calendar_lease_until=$2 WHERE id=$1', [
      item.meeting.id,
      now,
    ]);
    await service.processCalendarFailure(
      item.meeting.id,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      expectedVersion,
    );
    const version = (await store.get(item.meeting.id))?.version;
    await service.processCalendarFailure(
      item.meeting.id,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      expectedVersion,
    );
    expect((await store.get(item.meeting.id))?.status).toBe('FAILED');
    expect((await store.get(item.meeting.id))?.version).toBe(version);
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_FAILED'",
          [item.meeting.id],
        )
      ).rowCount,
    ).toBe(1);
    await service.approve(item.meeting.id, actor);
    const reapprovedVersion = (await store.get(item.meeting.id))!.version;
    await service.processCalendarFailure(
      item.meeting.id,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      expectedVersion,
    );
    expect((await store.get(item.meeting.id))?.status).toBe('APPROVED');
    expect((await store.get(item.meeting.id))?.version).toBe(reapprovedVersion);
    await service.cancel(item.meeting.id, actor);
    await service.processCalendarCancel(item.meeting.id);
  });
  it('cancelamento esgotado só reabre por decisão admin e libera reserva após remoção verificada', async () => {
    const calendar = new FakeCalendarAdapter();
    let failCancel = true;
    const port: CalendarPort = {
      simulated: true,
      freeBusy: (start, end) => calendar.freeBusy(start, end),
      ensureEvent: (input) => calendar.ensureEvent(input),
      cancelEvent: async (input) => {
        if (failCancel) throw new Error('Falha simulada');
        await calendar.cancelEvent(input);
      },
    };
    const service = make(port);
    const item = await request(service, '2026-11-10T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    await service.processCalendarCreate(item.meeting.id);
    await service.cancel(item.meeting.id, actor);
    for (let attempt = 0; attempt < 8; attempt++)
      await expect(service.processCalendarCancel(item.meeting.id)).rejects.toMatchObject({
        code: 'CALENDAR_UNAVAILABLE',
      });
    const oldOutboxVersion = (await store.get(item.meeting.id))!.version;
    await service.processCalendarFailure(
      item.meeting.id,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      oldOutboxVersion,
    );
    const exhaustedVersion = (await store.get(item.meeting.id))!.version;
    expect(calendar.events.size).toBe(1);
    expect(
      (await pool.query('SELECT reserved_start FROM meetings WHERE id=$1', [item.meeting.id]))
        .rows[0].reserved_start,
    ).not.toBeNull();
    await store.claimCalendar(item.meeting.id, 'CANCEL', 120, now);
    await service.cancel(item.meeting.id, actor);
    expect((await store.get(item.meeting.id))?.version).toBe(exhaustedVersion);
    await pool.query('UPDATE meetings SET calendar_lease_until=$2 WHERE id=$1', [
      item.meeting.id,
      now,
    ]);
    await Promise.all([
      service.cancel(item.meeting.id, actor),
      service.cancel(item.meeting.id, actor),
    ]);
    const retryVersion = (await store.get(item.meeting.id))!.version;
    expect(retryVersion).toBe(exhaustedVersion + 1);
    expect((await store.get(item.meeting.id))?.failureCode).toBeNull();
    await service.processCalendarFailure(
      item.meeting.id,
      'OUTBOX_ATTEMPTS_EXHAUSTED',
      oldOutboxVersion,
    );
    expect((await store.get(item.meeting.id))?.version).toBe(retryVersion);
    expect((await store.get(item.meeting.id))?.failureCode).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='CALENDAR_CANCEL'",
          [item.meeting.id],
        )
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT actor_id FROM meeting_audit WHERE meeting_id=$1 AND action='CANCEL_RETRY_REQUESTED'",
          [item.meeting.id],
        )
      ).rows,
    ).toEqual([{ actor_id: actor }]);
    failCancel = false;
    await service.processCalendarCancel(item.meeting.id);
    await service.cancel(item.meeting.id, actor);
    expect(calendar.events.size).toBe(0);
    expect((await store.get(item.meeting.id))?.calendarCancelledAt).toEqual(now);
    expect(
      (
        await pool.query('SELECT reserved_start,reserved_end FROM meetings WHERE id=$1', [
          item.meeting.id,
        ])
      ).rows[0],
    ).toEqual({ reserved_start: null, reserved_end: null });
    expect((await store.get(item.meeting.id))?.version).toBe(retryVersion);
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='CALENDAR_CANCEL'",
          [item.meeting.id],
        )
      ).rowCount,
    ).toBe(2);
  });
  it('timeout seguido de 404 não libera reserva; criação tardia é removida após recuperação admin', async () => {
    const calendar = new FakeCalendarAdapter();
    let commitRemote: (() => Promise<void>) | undefined;
    const port: CalendarPort = {
      simulated: true,
      freeBusy: (start, end) => calendar.freeBusy(start, end),
      cancelEvent: (input) => calendar.cancelEvent(input),
      ensureEvent: async (input) => {
        commitRemote = async () => {
          await calendar.ensureEvent(input);
        };
        throw new AppError('CALENDAR_UNAVAILABLE', 503, 'Timeout simulado');
      },
    };
    const service = make(port);
    const first = await request(service, '2026-11-11T12:00:00Z');
    const second = await request(service, '2026-11-11T12:00:00Z');
    await service.approve(first.meeting.id, actor);
    await expect(service.processCalendarCreate(first.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_UNAVAILABLE',
    });
    expect((await store.get(first.meeting.id))?.calendarCreateUncertain).toBe(true);
    await service.cancel(first.meeting.id, actor);
    await expect(service.processCalendarCancel(first.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    expect((await store.get(first.meeting.id))?.calendarCancelledAt).toBeNull();
    expect((await store.get(first.meeting.id))?.failureCode).toBe(
      'CALENDAR_RECONCILIATION_PENDING',
    );
    await expect(service.approve(second.meeting.id, actor)).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query(
          "SELECT id FROM meeting_outbox WHERE meeting_id=$1 AND kind='NOTIFY_CANCELLED'",
          [first.meeting.id],
        )
      ).rowCount,
    ).toBe(0);
    const version = (await store.get(first.meeting.id))!.version;
    await service.processCalendarFailure(first.meeting.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', version);
    await service.cancel(first.meeting.id, actor);
    await expect(service.processCalendarCancel(first.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    // The original remote write commits after the timeout and initial cancellation.
    expect(commitRemote).toBeDefined();
    await commitRemote!();
    expect(calendar.events.size).toBe(1);
    await service.processCalendarCancel(first.meeting.id);
    expect(calendar.events.size).toBe(0);
    expect(await store.get(first.meeting.id)).toMatchObject({
      status: 'CANCELLED',
      calendarCancelledAt: now,
      calendarCreateUncertain: false,
    });
    await expect(service.approve(second.meeting.id, actor)).resolves.toMatchObject({
      status: 'APPROVED',
    });
    await service.cancel(second.meeting.id, actor);
    await service.processCalendarCancel(second.meeting.id);
  });
  it('crash após registrar intenção preserva incerteza além da expiração da lease', async () => {
    const service = make();
    const item = await request(service, '2026-11-12T12:00:00Z');
    await service.approve(item.meeting.id, actor);
    const lease = await store.claimCalendar(item.meeting.id, 'CREATE', 120, now);
    expect(lease).not.toBeNull();
    expect(await store.calendarCreateStarted(item.meeting.id, lease!.leaseId, now)).toBe(true);
    await pool.query('UPDATE meetings SET calendar_lease_until=$2 WHERE id=$1', [
      item.meeting.id,
      now,
    ]);
    await service.cancel(item.meeting.id, actor);
    await expect(service.processCalendarCancel(item.meeting.id)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    expect(await store.get(item.meeting.id)).toMatchObject({
      status: 'CANCELLED',
      calendarCreateUncertain: true,
      calendarCancelledAt: null,
    });
    expect(
      await store.busy(new Date('2026-11-12T11:00Z'), new Date('2026-11-12T14:00Z')),
    ).toHaveLength(1);
  });
  it.each([false, true])(
    'conflito externo respeita resultado incerto anterior=%s',
    async (previousUncertainty) => {
      let attempts = 0;
      const port: CalendarPort = {
        simulated: true,
        freeBusy: async () => [],
        ensureEvent: async () => {
          if (previousUncertainty && attempts++ === 0)
            throw new AppError('CALENDAR_UNAVAILABLE', 503, 'Timeout simulado');
          throw new AppError('CALENDAR_CONFLICT', 409, 'Conflito observado antes do insert atual');
        },
        cancelEvent: async () => undefined,
      };
      const service = make(port);
      const start = previousUncertainty ? '2026-11-14T12:00:00Z' : '2026-11-13T12:00:00Z';
      const first = await request(service, start);
      const second = await request(service, start);
      await service.approve(first.meeting.id, actor);
      if (previousUncertainty)
        await expect(service.processCalendarCreate(first.meeting.id)).rejects.toMatchObject({
          status: 503,
        });
      await service.processCalendarCreate(first.meeting.id);
      expect(await store.get(first.meeting.id)).toMatchObject({
        status: 'FAILED',
        calendarCreateUncertain: previousUncertainty,
      });
      const reservation = await pool.query('SELECT reserved_start FROM meetings WHERE id=$1', [
        first.meeting.id,
      ]);
      if (previousUncertainty) {
        expect(reservation.rows[0].reserved_start).not.toBeNull();
        await expect(service.approve(second.meeting.id, actor)).rejects.toMatchObject({
          status: 409,
        });
      } else {
        expect(reservation.rows[0].reserved_start).toBeNull();
        await expect(service.approve(second.meeting.id, actor)).resolves.toMatchObject({
          status: 'APPROVED',
        });
      }
    },
  );
});
