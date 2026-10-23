import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleCalendarAdapter,
  FakeCalendarAdapter,
  googleEventId,
  type CalendarEventInput,
} from '../packages/integrations/src/calendar.js';
import {
  SmtpNotificationSender,
  TelegramNotificationSender,
} from '../packages/integrations/src/notifications.js';
import { loadCalendarConfig } from '../packages/shared-config/src/calendar.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});
const input: CalendarEventInput = {
  meetingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 2,
  start: new Date('2026-11-03T13:00:00Z'),
  end: new Date('2026-11-03T13:30:00Z'),
  timeZone: 'America/Fortaleza',
  attendee: { name: 'Synthetic Visitor', email: 'synthetic@example.com' },
  topic: 'Synthetic private topic',
};
const event = () => ({
  id: googleEventId(input.meetingId),
  status: 'confirmed',
  start: { dateTime: input.start.toISOString() },
  end: { dateTime: input.end.toISOString() },
  extendedProperties: { private: { meetingId: input.meetingId } },
});
async function fakeServer(
  handler: (method: string, path: string, body: unknown) => { status: number; body?: unknown },
) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body: unknown = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const call = { method: request.method!, path: request.url!, body };
    calls.push(call);
    const result = handler(call.method, call.path, body);
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(result.body === undefined ? undefined : JSON.stringify(result.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    calls,
    baseUrl,
    calendar: new GoogleCalendarAdapter(
      { GOOGLE_CALENDAR_ID: 'private-calendar', GOOGLE_CALENDAR_HTTP_TIMEOUT_MS: 1000 },
      async () => 'synthetic-access-token',
      fetch,
      baseUrl,
    ),
  };
}
describe('Calendar HTTP real com servidor local simulado', () => {
  it('retorna somente intervalos freebusy e recusa erros por calendário', async () => {
    let fail = false;
    const stub = await fakeServer(() => ({
      status: 200,
      body: {
        calendars: {
          'private-calendar': {
            busy: [{ start: input.start.toISOString(), end: input.end.toISOString() }],
            ...(fail ? { errors: [{ reason: 'secret-provider-error' }] } : {}),
            title: 'Private title',
          },
        },
      },
    }));
    expect(await stub.calendar.freeBusy(input.start, input.end)).toEqual([
      { start: input.start, end: input.end },
    ]);
    fail = true;
    await expect(stub.calendar.freeBusy(input.start, input.end)).rejects.toMatchObject({
      code: 'CALENDAR_UNAVAILABLE',
      status: 503,
    });
  });
  it('cria com ID determinístico, verifica por GET e reutiliza evento após retry', async () => {
    let created = false;
    const stub = await fakeServer((method, path) => {
      if (path === '/freeBusy')
        return { status: 200, body: { calendars: { 'private-calendar': { busy: [] } } } };
      if (method === 'POST') {
        created = true;
        return { status: 200, body: event() };
      }
      return created ? { status: 200, body: event() } : { status: 404 };
    });
    expect(await stub.calendar.ensureEvent(input)).toEqual({
      eventId: googleEventId(input.meetingId),
    });
    expect(await stub.calendar.ensureEvent(input)).toEqual({
      eventId: googleEventId(input.meetingId),
    });
    expect(
      stub.calls.filter((call) => call.method === 'POST' && call.path !== '/freeBusy'),
    ).toHaveLength(1);
    expect(stub.calls.at(-1)?.method).toBe('GET');
  });
  it('reconsulta conflito com buffer antes de criar e não grava evento ocupado', async () => {
    const stub = await fakeServer((_method, path) =>
      path === '/freeBusy'
        ? {
            status: 200,
            body: {
              calendars: {
                'private-calendar': {
                  busy: [{ start: '2026-11-03T12:50:00Z', end: '2026-11-03T12:55:00Z' }],
                },
              },
            },
          }
        : { status: 404 },
    );
    await expect(stub.calendar.ensureEvent({ ...input, bufferMinutes: 15 })).rejects.toMatchObject({
      code: 'CALENDAR_CONFLICT',
    });
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1]?.body).toMatchObject({
      timeMin: '2026-11-03T12:45:00.000Z',
      timeMax: '2026-11-03T13:45:00.000Z',
    });
  });
  it('resolve 409 por verificação e rejeita evento pertencente a outra reunião', async () => {
    let created = false;
    const stub = await fakeServer((method, path) => {
      if (path === '/freeBusy')
        return { status: 200, body: { calendars: { 'private-calendar': { busy: [] } } } };
      if (method === 'POST') {
        created = true;
        return { status: 409 };
      }
      return created ? { status: 200, body: event() } : { status: 404 };
    });
    await expect(stub.calendar.ensureEvent(input)).resolves.toEqual({
      eventId: googleEventId(input.meetingId),
    });
    await expect(
      stub.calendar.ensureEvent({ ...input, start: new Date('2026-11-03T14:00:00Z') }),
    ).rejects.toMatchObject({ code: 'CALENDAR_EVENT_MISMATCH' });
  });
  it('cancelamento verifica ausência e é idempotente', async () => {
    const stub = await fakeServer(() => ({ status: 404 }));
    await expect(
      stub.calendar.cancelEvent({ meetingId: input.meetingId, version: 3 }),
    ).resolves.toBeUndefined();
    expect(stub.calls.map((call) => call.method)).toEqual(['GET']);
  });
  it('404 não encerra cancelamento quando uma criação anterior pode chegar depois', async () => {
    let exists = false;
    const stub = await fakeServer((method) => {
      if (method === 'DELETE') {
        exists = false;
        return { status: 204 };
      }
      return exists ? { status: 200, body: event() } : { status: 404 };
    });
    const cancellation = { meetingId: input.meetingId, version: 3, requireEventEvidence: true };
    await expect(stub.calendar.cancelEvent(cancellation)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
      status: 503,
    });
    expect(stub.calls.map((call) => call.method)).toEqual(['GET']);
    // The timed-out create commits only after the first cancellation attempt.
    exists = true;
    await expect(stub.calendar.cancelEvent(cancellation)).resolves.toBeUndefined();
    expect(exists).toBe(false);
    expect(stub.calls.map((call) => call.method)).toEqual(['GET', 'GET', 'DELETE', 'GET']);
  });
  it('tombstone 410 ou status cancelled comprova remoção mesmo após criação incerta', async () => {
    const cancellation = { meetingId: input.meetingId, version: 3, requireEventEvidence: true };
    const gone = await fakeServer(() => ({ status: 410 }));
    await expect(gone.calendar.cancelEvent(cancellation)).resolves.toBeUndefined();
    const cancelled = await fakeServer(() => ({ status: 200, body: { status: 'cancelled' } }));
    await expect(cancelled.calendar.cancelEvent(cancellation)).resolves.toBeUndefined();
  });
  it('consulta de 31 dias admite buffer máximo nas duas extremidades e continua limitada', async () => {
    const stub = await fakeServer(() => ({
      status: 200,
      body: { calendars: { 'private-calendar': { busy: [] } } },
    }));
    const from = new Date('2026-11-01T00:00:00Z');
    const to = new Date(from.getTime() + 31 * 86400000);
    const buffer = 120 * 60000;
    await expect(
      stub.calendar.freeBusy(new Date(+from - buffer), new Date(+to + buffer)),
    ).resolves.toEqual([]);
    await expect(
      stub.calendar.freeBusy(from, new Date(+from + 32 * 86400000 + 1)),
    ).rejects.toMatchObject({ code: 'CALENDAR_UNAVAILABLE' });
    expect(stub.calls).toHaveLength(1);
  });
  it('fake diferencia evento ausente de tombstone e não ressuscita ID cancelado', async () => {
    const calendar = new FakeCalendarAdapter();
    const cancellation = { meetingId: input.meetingId, version: 3, requireEventEvidence: true };
    await expect(calendar.cancelEvent(cancellation)).rejects.toMatchObject({
      code: 'CALENDAR_RECONCILIATION_PENDING',
    });
    await calendar.ensureEvent(input);
    await calendar.cancelEvent(cancellation);
    await expect(calendar.cancelEvent(cancellation)).resolves.toBeUndefined();
    await expect(calendar.ensureEvent(input)).rejects.toMatchObject({
      code: 'CALENDAR_EVENT_MISMATCH',
    });
  });
  it('verifica propriedade antes de DELETE e confirma ausência depois de cancelar', async () => {
    let exists = true;
    const stub = await fakeServer((method) => {
      if (method === 'DELETE') {
        exists = false;
        return { status: 204 };
      }
      return exists ? { status: 200, body: event() } : { status: 404 };
    });
    await stub.calendar.cancelEvent({ meetingId: input.meetingId, version: 3 });
    expect(stub.calls.map((call) => call.method)).toEqual(['GET', 'DELETE', 'GET']);
    const foreign = await fakeServer(() => ({
      status: 200,
      body: { ...event(), extendedProperties: { private: { meetingId: 'foreign-meeting' } } },
    }));
    await expect(
      foreign.calendar.cancelEvent({ meetingId: input.meetingId, version: 3 }),
    ).rejects.toMatchObject({ code: 'CALENDAR_EVENT_MISMATCH', status: 409 });
    expect(foreign.calls.map((call) => call.method)).toEqual(['GET']);
  });
  it('não declara criação concluída quando a leitura de confirmação excede timeout', async () => {
    let calls = 0;
    const transport = vi.fn<typeof fetch>(async (_url, options) => {
      calls++;
      if (calls === 1) return new Response(null, { status: 404 });
      if (calls === 2) return Response.json({ calendars: { 'private-calendar': { busy: [] } } });
      if (calls === 3) return Response.json(event());
      return new Promise<Response>((_resolve, reject) =>
        options?.signal?.addEventListener(
          'abort',
          () => reject(new Error('synthetic-timeout-secret')),
          { once: true },
        ),
      );
    });
    const calendar = new GoogleCalendarAdapter(
      { GOOGLE_CALENDAR_ID: 'private-calendar', GOOGLE_CALENDAR_HTTP_TIMEOUT_MS: 100 },
      async () => 'synthetic',
      transport,
    );
    await expect(calendar.ensureEvent(input)).rejects.toMatchObject({
      code: 'CALENDAR_UNAVAILABLE',
      status: 503,
    });
    expect(calls).toBe(4);
  });
  it('não inclui erros, tokens nem corpo privado em falhas públicas', async () => {
    const stub = await fakeServer(() => ({
      status: 503,
      body: { secret: 'synthetic-secret-body' },
    }));
    const error = await stub.calendar
      .freeBusy(input.start, input.end)
      .catch((value: unknown) => value);
    expect(String(error)).not.toContain('synthetic-secret');
    expect(String(error)).not.toContain('private-calendar');
  });
});
describe('notificações e configuração segura', () => {
  it('SMTP usa Message-ID estável e remove injeção de header', async () => {
    const sendMail = vi.fn(async () => ({ accepted: ['synthetic@example.com'] }));
    const sender = new SmtpNotificationSender({ sendMail }, 'staff@example.com');
    await sender.send({
      deliveryId: input.meetingId,
      recipient: input.attendee.email,
      subject: 'Atualização\r\nInjected',
      text: 'Synthetic text',
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: `<${input.meetingId}@notifications.phasscode>`,
        subject: 'Atualização  Injected',
      }),
    );
  });
  it('Telegram recebe apenas assunto operacional e referência, sem conteúdo visitante', async () => {
    const stub = await fakeServer(() => ({ status: 200, body: { ok: true } }));
    await new TelegramNotificationSender(
      'synthetic-token',
      'synthetic-chat',
      1000,
      fetch,
      stub.baseUrl,
    ).send({
      deliveryId: input.meetingId,
      recipient: input.attendee.email,
      subject: 'Reunião confirmada',
      text: `${input.attendee.name} ${input.attendee.email} ${input.topic}`,
    });
    const body = JSON.stringify(stub.calls[0]?.body);
    expect(body).toContain(input.meetingId);
    expect(body).not.toContain(input.attendee.email);
    expect(body).not.toContain(input.topic);
  });
  it('produção rejeita simuladores e Calendar não reaproveita credenciais OIDC', () => {
    expect(() =>
      loadCalendarConfig({ NODE_ENV: 'production', GOOGLE_CALENDAR_MODE: 'fake' }),
    ).toThrow();
    expect(() =>
      loadCalendarConfig({
        GOOGLE_CALENDAR_MODE: 'google',
        GOOGLE_OIDC_CLIENT_ID: 'not-calendar',
        GOOGLE_OIDC_CLIENT_SECRET: 'not-calendar',
      }),
    ).toThrow('Google Calendar requer');
    expect(() => loadWorkerConfig({ NODE_ENV: 'production', NOTIFICATION_MODE: 'fake' })).toThrow();
    expect(() =>
      loadWorkerConfig({
        NODE_ENV: 'production',
        WORKER_ENABLED: 'true',
        DATABASE_URL: 'synthetic',
        REDIS_URL: 'synthetic',
      }),
    ).toThrow();
  });
});
