import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { loadMeetingConfig } from '../packages/shared-config/src/meetings.js';
import { meetingRequestInputSchema } from '../packages/contracts/src/meetings.js';
import { MeetingService, hashMeetingSecret } from '../apps/orbe-node/src/meetings/service.js';
import { registerMeetingRoutes } from '../apps/orbe-node/src/meetings/routes.js';
import type {
  CalendarPort,
  MeetingRecord,
  MeetingStore,
  ProposalRecord,
} from '../apps/orbe-node/src/meetings/ports.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';

const now = new Date('2026-10-22T12:00:00.000Z');
const start = new Date('2026-10-24T12:00:00.000Z');
const end = new Date('2026-10-24T12:30:00.000Z');
const token = 'a'.repeat(43);
const policy = { ...loadMeetingConfig({}), enabled: true };
function setup() {
  const row: MeetingRecord = {
    id: randomUUID(),
    status: 'PENDING',
    name: 'Visitante Exemplo',
    email: 'visitante@example.test',
    topic: 'Projeto de software',
    start,
    end,
    timeZone: policy.timeZone,
    createdAt: now,
    updatedAt: now,
    version: 1,
    tokenHash: hashMeetingSecret(token),
    failureCode: null,
    externalEventId: null,
    calendarCreateUncertain: false,
    calendarCancelledAt: null,
  };
  const proposal: ProposalRecord = {
    id: randomUUID(),
    tokenHash: hashMeetingSecret(token),
    name: row.name,
    email: row.email,
    topic: row.topic,
    start,
    end,
    timeZone: policy.timeZone,
    consentVersion: policy.consentVersion,
    expiresAt: new Date(now.getTime() + 1800000),
  };
  const store = {
    createProposal: vi.fn<MeetingStore['createProposal']>().mockResolvedValue(undefined),
    getProposal: vi.fn(async () => proposal),
    findIdempotent: vi.fn(async (): Promise<MeetingRecord | null> => null),
    consumeProposal: vi.fn<MeetingStore['consumeProposal']>().mockResolvedValue(row),
    get: vi.fn(async (): Promise<MeetingRecord | null> => row),
    getPrivate: vi.fn(async (): Promise<MeetingRecord | null> => row),
    busy: vi.fn(async () => [] as { start: Date; end: Date }[]),
    list: vi.fn(async () => [] as MeetingRecord[]),
    approve: vi.fn(async () => ({ ...row, status: 'APPROVED' as const, version: 2 })),
    transition: vi.fn(async () => ({ ...row, status: 'CANCELLED' as const })),
    claimCalendar: vi.fn(async (): Promise<{ meeting: MeetingRecord; leaseId: string } | null> => ({
      meeting: { ...row, status: 'APPROVED' },
      leaseId: randomUUID(),
    })),
    calendarCreated: vi.fn(async () => true),
    calendarCreateStarted: vi.fn<MeetingStore['calendarCreateStarted']>().mockResolvedValue(true),
    calendarCancelled: vi.fn(async () => undefined),
    calendarFailed: vi.fn(async () => undefined),
    exhaustCalendar: vi.fn(async () => false),
    retain: vi.fn(async () => 0),
  } satisfies MeetingStore;
  const calendar = {
    simulated: true,
    freeBusy: vi.fn(async () => [] as { start: Date; end: Date }[]),
    ensureEvent: vi.fn(async () => ({ eventId: `m${row.id.replaceAll('-', '')}` })),
    cancelEvent: vi.fn(async () => undefined),
  } satisfies CalendarPort;
  return {
    row,
    proposal,
    store,
    calendar,
    service: new MeetingService(policy, store, calendar, () => now),
  };
}
describe('política de reuniões e consentimento', () => {
  it('desabilita por padrão e exige política explícita ao habilitar', () => {
    expect(loadMeetingConfig({}).enabled).toBe(false);
    expect(() => loadMeetingConfig({ MEETINGS_ENABLED: 'true' })).toThrow('política explícita');
    expect(() => loadMeetingConfig({ MEETINGS_WORKDAYS: '1,1' })).toThrow();
    expect(() => loadMeetingConfig({ MEETINGS_WORK_START: '24:00' })).toThrow();
    expect(() => loadMeetingConfig({ MEETINGS_TIMEZONE: 'Invalid/Timezone' })).toThrow();
  });
  it('aceita política confirmada do proprietário sem presumir agendamento habilitado', () => {
    expect(policy).toMatchObject({
      timeZone: 'America/Fortaleza',
      workdays: [1, 2, 3, 4, 5, 6],
      workStartMinutes: 540,
      workEndMinutes: 1080,
      durationMinutes: 30,
      minNoticeMinutes: 1440,
      bufferMinutes: 15,
    });
  });
  it('não permite geração de proposta quando desabilitado', async () => {
    const { store, calendar } = setup();
    const service = new MeetingService(loadMeetingConfig({}), store, calendar, () => now);
    await expect(
      service.prepareProposal({
        start: start.toISOString(),
        name: 'Visitante',
        email: 'a@example.test',
        topic: 'Projeto',
      }),
    ).rejects.toMatchObject({ code: 'MEETINGS_DISABLED' });
    expect(calendar.freeBusy).not.toHaveBeenCalled();
  });
  it.each([
    '2026-10-25T12:00:00Z',
    '2026-10-24T21:00:00Z',
    '2026-10-23T11:30:00Z',
    '2026-10-24T12:10:00Z',
    '2027-02-01T12:00:00Z',
  ])('recusa domingo, fora do expediente, antecedência, grade ou horizonte: %s', async (value) => {
    const { service, calendar } = setup();
    await expect(
      service.prepareProposal({
        start: value,
        name: 'Visitante',
        email: 'a@example.test',
        topic: 'Projeto',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(calendar.freeBusy).not.toHaveBeenCalled();
  });
  it('considera intervalo externo e buffer, sem expor títulos ou participantes', async () => {
    const { service, calendar } = setup();
    calendar.freeBusy.mockResolvedValue([
      { start: new Date('2026-10-24T12:30:00Z'), end: new Date('2026-10-24T13:00:00Z') },
    ]);
    const result = await service.availability('2026-10-24T12:00:00Z', '2026-10-24T14:00:00Z');
    expect(result.simulated).toBe(true);
    expect(result.slots.map((slot) => slot.start)).toEqual([
      '2026-10-24T13:15:00.000Z',
      '2026-10-24T13:30:00.000Z',
    ]);
    expect(Object.keys(result)).toEqual(['timeZone', 'durationMinutes', 'simulated', 'slots']);
  });
  it('considera reservas internas aprovadas e não produz horários em domingo', async () => {
    const { service, store } = setup();
    store.busy.mockResolvedValue([{ start, end }]);
    expect(
      (await service.availability('2026-10-24T12:00:00Z', '2026-10-24T13:30:00Z')).slots.map(
        (slot) => slot.start,
      ),
    ).toEqual(['2026-10-24T12:45:00.000Z', '2026-10-24T13:00:00.000Z']);
    expect(
      (await service.availability('2026-10-25T12:00:00Z', '2026-10-25T13:30:00Z')).slots,
    ).toEqual([]);
  });
  it('limita a amplitude de consulta para conter trabalho e consultas externas', async () => {
    const { service, calendar } = setup();
    await expect(
      service.availability('2026-10-24T12:00:00Z', '2026-11-10T12:00:00Z'),
    ).rejects.toMatchObject({ status: 400 });
    expect(calendar.freeBusy).not.toHaveBeenCalled();
  });
  it('suporta consulta configurada para 31 dias com buffer e grade limitada', async () => {
    const { store, calendar } = setup();
    const service = new MeetingService(
      { ...policy, maxAvailabilityDays: 31, bufferMinutes: 120 },
      store,
      calendar,
      () => now,
    );
    const result = await service.availability('2026-11-01T00:00:00Z', '2026-12-02T00:00:00Z');
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.length).toBeLessThanOrEqual(1000);
    expect(calendar.freeBusy).toHaveBeenCalledWith(
      new Date('2026-10-31T22:00:00Z'),
      new Date('2026-12-02T02:00:00Z'),
    );
  });
  it('preparar proposta só persiste hash e não cria reunião nem evento', async () => {
    const { service, store, calendar } = setup();
    const response = await service.prepareProposal({
      start: start.toISOString(),
      name: 'Visitante',
      email: 'a@example.test',
      topic: 'Projeto',
    });
    expect(response.confirmationToken).toHaveLength(43);
    expect(response.simulated).toBe(true);
    expect(store.createProposal.mock.calls[0]?.[0]).toMatchObject({
      tokenHash: hashMeetingSecret(response.confirmationToken),
    });
    expect(JSON.stringify(store.createProposal.mock.calls)).not.toContain(
      response.confirmationToken,
    );
    expect(store.consumeProposal).not.toHaveBeenCalled();
    expect(calendar.ensureEvent).not.toHaveBeenCalled();
  });
  it('exige confirmação explícita e rejeita tentativa de alterar conteúdo da proposta', () => {
    const input = {
      proposalId: randomUUID(),
      confirmationToken: token,
      consent: true,
      consentVersion: 'meetings-v1',
    };
    expect(meetingRequestInputSchema.safeParse(input).success).toBe(true);
    expect(meetingRequestInputSchema.safeParse({ ...input, consent: false }).success).toBe(false);
    expect(
      meetingRequestInputSchema.safeParse({ ...input, email: 'outro@example.test' }).success,
    ).toBe(false);
  });
  it('solicitação conserva token só como hash, fornece status token e não confirma Calendar', async () => {
    const { service, store, proposal, calendar } = setup();
    const response = await service.request(
      {
        proposalId: proposal.id,
        confirmationToken: token,
        consent: true,
        consentVersion: proposal.consentVersion,
      },
      'request-key-0001',
    );
    expect(response).toMatchObject({ status: 'PENDING', meetingToken: token });
    expect(store.consumeProposal.mock.calls[0]?.[0]).toMatchObject({
      tokenHash: hashMeetingSecret(token),
    });
    expect(calendar.ensureEvent).not.toHaveBeenCalled();
  });
  it('retry idempotente retorna a mesma solicitação mesmo depois de expirar a proposta', async () => {
    const { service, store, row, proposal, calendar } = setup();
    store.findIdempotent.mockResolvedValue(row);
    const result = await service.request(
      {
        proposalId: proposal.id,
        confirmationToken: token,
        consent: true,
        consentVersion: proposal.consentVersion,
      },
      'request-key-0001',
    );
    expect(result.id).toBe(row.id);
    expect(store.getProposal).not.toHaveBeenCalled();
    expect(calendar.freeBusy).not.toHaveBeenCalled();
  });
  it('token incorreto não revela detalhes de contato ou existência da solicitação', async () => {
    const { service, store, row } = setup();
    store.getPrivate.mockResolvedValue(null);
    await expect(service.status(row.id, 'b'.repeat(43))).rejects.toMatchObject({
      code: 'MEETING_NOT_FOUND',
      status: 404,
    });
    expect(store.getPrivate).toHaveBeenCalledWith(row.id, hashMeetingSecret('b'.repeat(43)));
  });
  it('aprovação verifica FreeBusy antes da mutação e retorna APPROVED sem criar evento', async () => {
    const { service, store, calendar, row } = setup();
    const result = await service.approve(row.id, randomUUID());
    expect(result.status).toBe('APPROVED');
    expect(calendar.freeBusy.mock.invocationCallOrder[0]).toBeLessThan(
      store.approve.mock.invocationCallOrder[0]!,
    );
    expect(calendar.ensureEvent).not.toHaveBeenCalled();
  });
  it('conflito externo impede aprovação antes de reservar banco', async () => {
    const { service, calendar, store, row } = setup();
    calendar.freeBusy.mockResolvedValue([{ start, end }]);
    await expect(service.approve(row.id, randomUUID())).rejects.toMatchObject({ status: 409 });
    expect(store.approve).not.toHaveBeenCalled();
  });
  it('evento verificado pelo adaptador antecede a confirmação no banco', async () => {
    const { service, store, calendar, row } = setup();
    await service.processCalendarCreate(row.id);
    expect(store.calendarCreateStarted.mock.invocationCallOrder[0]).toBeLessThan(
      calendar.ensureEvent.mock.invocationCallOrder[0]!,
    );
    expect(calendar.ensureEvent.mock.invocationCallOrder[0]).toBeLessThan(
      store.calendarCreated.mock.invocationCallOrder[0]!,
    );
    expect(calendar.ensureEvent).toHaveBeenCalledWith(
      expect.objectContaining({ bufferMinutes: 15 }),
    );
  });
  it('falha transitória externa mantém erro recuperável e nunca confirma', async () => {
    const { service, store, calendar, row } = setup();
    calendar.ensureEvent.mockRejectedValue(new Error('secret provider body'));
    await expect(service.processCalendarCreate(row.id)).rejects.toMatchObject({
      code: 'CALENDAR_UNAVAILABLE',
      status: 503,
    });
    expect(store.calendarCreated).not.toHaveBeenCalled();
    expect(store.calendarFailed).toHaveBeenCalledWith(
      row.id,
      expect.any(String),
      'CALENDAR_UNAVAILABLE',
      false,
      now,
      false,
    );
  });
  it('conflito definitivo gera FAILED pelo store e impede falsa confirmação', async () => {
    const { service, store, calendar, row } = setup();
    calendar.ensureEvent.mockRejectedValue(new AppError('CALENDAR_CONFLICT', 409, 'Conflito'));
    await service.processCalendarCreate(row.id);
    expect(store.calendarFailed).toHaveBeenCalledWith(
      row.id,
      expect.any(String),
      'CALENDAR_CONFLICT',
      true,
      now,
      true,
    );
    expect(store.calendarCreated).not.toHaveBeenCalled();
  });
  it('não executa efeito externo se perdeu a lease antes de registrar incerteza', async () => {
    const { service, store, calendar, row } = setup();
    store.calendarCreateStarted.mockResolvedValue(false);
    await expect(service.processCalendarCreate(row.id)).rejects.toMatchObject({ status: 503 });
    expect(calendar.ensureEvent).not.toHaveBeenCalled();
  });
  it('conflito depois de criação incerta não autoriza liberar a reserva antiga', async () => {
    const { service, store, calendar, row } = setup();
    row.calendarCreateUncertain = true;
    calendar.ensureEvent.mockRejectedValue(new AppError('CALENDAR_CONFLICT', 409, 'Conflito'));
    await service.processCalendarCreate(row.id);
    expect(store.calendarFailed).toHaveBeenCalledWith(
      row.id,
      expect.any(String),
      'CALENDAR_CONFLICT',
      true,
      now,
      false,
    );
  });
  it('cancelamento de criação ambígua exige evidência e preserva a falha de reconciliação', async () => {
    const { service, store, calendar, row } = setup();
    row.status = 'CANCELLED';
    row.calendarCreateUncertain = true;
    calendar.cancelEvent.mockRejectedValue(
      new AppError('CALENDAR_RECONCILIATION_PENDING', 503, 'Pendente'),
    );
    await expect(service.processCalendarCancel(row.id)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    expect(calendar.cancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ requireEventEvidence: true }),
    );
    expect(store.calendarCancelled).not.toHaveBeenCalled();
    expect(store.calendarFailed).toHaveBeenCalledWith(
      row.id,
      expect.any(String),
      'CALENDAR_RECONCILIATION_PENDING',
      false,
      now,
    );
  });
  it('cancelamento com criação em andamento exige retry, mesmo sem ID externo ainda', async () => {
    const { service, store, row } = setup();
    row.status = 'CANCELLED';
    store.claimCalendar.mockResolvedValue(null);
    await expect(service.processCalendarCancel(row.id)).rejects.toMatchObject({
      code: 'CALENDAR_PENDING',
      status: 503,
    });
    expect(store.calendarCancelled).not.toHaveBeenCalled();
  });
  it('cursor inválido é rejeitado antes de consultar o banco', async () => {
    const { service, store } = setup();
    await expect(service.list({ limit: 25, cursor: 'malformed' })).rejects.toMatchObject({
      status: 400,
    });
    expect(store.list).not.toHaveBeenCalled();
  });
  it('não conclui outbox de cancelamento quando a gravação perde o lease/CAS', async () => {
    const { service, store, row, calendar } = setup();
    row.status = 'CANCELLED';
    await expect(service.processCalendarCancel(row.id)).rejects.toMatchObject({ status: 503 });
    expect(calendar.cancelEvent).toHaveBeenCalled();
    expect(store.calendarCancelled).toHaveBeenCalled();
  });
  it('esgotamento com lease ativo exige retry até persistir FAILED', async () => {
    const { service, store, row } = setup();
    row.status = 'APPROVED';
    await expect(
      service.processCalendarFailure(row.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', row.version),
    ).rejects.toMatchObject({ code: 'CALENDAR_PENDING', status: 503 });
    row.status = 'FAILED';
    row.failureCode = 'OUTBOX_ATTEMPTS_EXHAUSTED';
    await expect(
      service.processCalendarFailure(row.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', row.version),
    ).resolves.toBeUndefined();
    expect(store.exhaustCalendar).toHaveBeenCalledTimes(2);
  });
  it('cancelar novamente encaminha ao store a decisão administrativa de recuperar cleanup esgotado', async () => {
    const { service, store, row } = setup();
    row.status = 'CANCELLED';
    row.failureCode = 'OUTBOX_ATTEMPTS_EXHAUSTED';
    const actorId = randomUUID();
    await service.cancel(row.id, actorId);
    expect(store.transition).toHaveBeenCalledWith(row.id, 'CANCELLED', actorId, now);
  });
  it('callback esgotado de versão antiga não encerra uma aprovação nova', async () => {
    const { service, store, row } = setup();
    row.status = 'APPROVED';
    row.version = 4;
    await expect(
      service.processCalendarFailure(row.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', 2),
    ).resolves.toBeUndefined();
    expect(store.exhaustCalendar).toHaveBeenCalledWith(row.id, 'OUTBOX_ATTEMPTS_EXHAUSTED', 2, now);
  });
});

describe('rotas administrativas de reuniões', () => {
  it('exige autenticação, papel admin e CSRF antes de chamar a aprovação', async () => {
    const { service, row, store } = setup();
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) =>
      reply
        .status(error instanceof AppError ? error.status : 500)
        .send({ code: error instanceof AppError ? error.code : 'INTERNAL_ERROR' }),
    );
    const requirePrincipal = vi.fn(
      async (
        request: import('fastify').FastifyRequest,
        options?: { admin?: boolean; csrf?: boolean },
      ) => {
        const auth = request.headers.authorization;
        if (!auth) throw new AppError('UNAUTHENTICATED', 401, 'Login necessário.');
        if (auth !== 'Bearer admin') throw new AppError('FORBIDDEN', 403, 'Sem permissão.');
        if (options?.csrf && request.headers['x-csrf-token'] !== 'test-csrf')
          throw new AppError('CSRF_INVALID', 403, 'CSRF inválido.');
        return { userId: randomUUID(), roles: ['admin'] };
      },
    );
    registerMeetingRoutes(app, { service, auth: { requirePrincipal } });
    try {
      const url = `/api/v1/admin/meetings/${row.id}/approve`;
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer user' } }))
          .statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer admin' } }))
          .statusCode,
      ).toBe(403);
      expect(store.approve).not.toHaveBeenCalled();
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            headers: { authorization: 'Bearer admin', 'x-csrf-token': 'test-csrf' },
          })
        ).statusCode,
      ).toBe(200);
      expect(requirePrincipal).toHaveBeenLastCalledWith(expect.anything(), {
        admin: true,
        csrf: true,
      });
    } finally {
      await app.close();
    }
  });
});
