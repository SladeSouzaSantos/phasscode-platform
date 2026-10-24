import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { InjectOptions } from 'fastify';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { AuthService, authHash } from '../apps/orbe-node/src/auth/service.js';
import { MeetingService } from '../apps/orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../apps/orbe-node/src/meetings/postgres-store.js';
import { FakeCalendarAdapter } from '../packages/integrations/src/calendar.js';
import {
  FakeNotificationSender,
  type NotificationMessage,
} from '../packages/integrations/src/notifications.js';
import { startWorker } from '../apps/worker-node/src/runtime.js';
import { fakeGoogle, login } from './auth-fixtures.js';
import { testApp } from './helpers.js';

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
  throw new Error('Use bancos descartáveis para o fluxo completo.');

class RecordingSender extends FakeNotificationSender {
  readonly messages: NotificationMessage[] = [];
  override async send(message: NotificationMessage) {
    this.messages.push(message);
    await super.send(message);
  }
}

async function eventually(check: () => Promise<boolean>) {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('O fluxo assíncrono não alcançou o estado esperado.');
}

it('visitante público → Google OIDC → admin/CSRF → Calendar → canais → cancelamento → logout', async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL!);
  await migrate(pool);
  const google = await fakeGoogle();
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PERSISTENCE: 'postgres',
    DATABASE_URL: process.env.TEST_DATABASE_URL!,
    REDIS_URL: process.env.TEST_REDIS_URL!,
    AUTH_ENABLED: 'true',
    AUTH_PUBLIC_URL: 'http://localhost:3000',
    AUTH_FRONTEND_URL: 'http://localhost:5173/login-complete',
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AUTH_GOOGLE_ISSUER: google.issuer,
    AUTH_COOKIE_SECURE: 'false',
    AUTH_JWT_PRIVATE_KEY: google.privatePem,
    AUTH_JWT_KEY_ID: 'flow-test-key',
    MEETINGS_ENABLED: 'true',
    MEETINGS_TIMEZONE: 'America/Fortaleza',
    MEETINGS_WORKDAYS: '1,2,3,4,5,6',
    MEETINGS_WORK_START: '09:00',
    MEETINGS_WORK_END: '18:00',
    MEETINGS_DURATION_MINUTES: '30',
    MEETINGS_MIN_NOTICE_MINUTES: '1440',
    MEETINGS_BUFFER_MINUTES: '15',
    MEETINGS_MAX_HORIZON_DAYS: '60',
    GOOGLE_CALENDAR_MODE: 'fake',
    WORKER_ENABLED: 'true',
    NOTIFICATION_MODE: 'fake',
    OUTBOX_POLL_MS: '100',
  });
  const calendar = new FakeCalendarAdapter();
  const meetings = new MeetingService(config.meetings, new PostgresMeetingStore(pool), calendar);
  const auth = await AuthService.create(config.auth, pool);
  const redis = new Redis(process.env.TEST_REDIS_URL!);
  const app = await testApp({ config, auth, meetings, redis });
  const remoteAddress = `flow-${randomUUID()}`;
  const inject = (options: InjectOptions) => app.inject({ ...options, remoteAddress });
  const smtp = new RecordingSender('smtp');
  const telegram = new RecordingSender('telegram');
  const runtime = await startWorker(config.worker, pool, meetings, [smtp, telegram]);
  let userId: string | undefined;
  let meetingId: string | undefined;
  let proposalId: string | undefined;
  let stateHash: string | undefined;
  try {
    expect(
      (await inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'oi' } }))
        .statusCode,
    ).toBe(200);
    expect((await inject({ url: '/api/v1/admin/meetings' })).statusCode).toBe(401);
    const logged = await login(app, auth, google, { sub: randomUUID() }, false, remoteAddress);
    stateHash = authHash(
      new URL(logged.callbackUrl, 'http://localhost:3000').searchParams.get('state')!,
    );
    expect(logged.callback.statusCode).toBe(302);
    expect(logged.state.authenticated).toBe(true);
    userId = logged.state.user.id;
    expect(logged.state.user.roles).toEqual(['user']);
    const headers = {
      cookie: logged.sessionCookie,
      origin: 'http://localhost:5173',
      'x-csrf-token': logged.state.csrfToken,
    };
    expect((await inject({ url: '/api/v1/admin/meetings', headers })).statusCode).toBe(403);
    // Explicit test operator action; login never performs this grant.
    await pool.query("INSERT INTO auth_user_roles(user_id,role) VALUES($1,'admin')", [userId]);
    const start = new Date(Date.now() + 2 * 86400000);
    start.setUTCHours(12, 0, 0, 0);
    if (start.getUTCDay() === 0) start.setUTCDate(start.getUTCDate() + 1);
    const availability = await inject({
      url: `/api/v1/meetings/availability?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date(start.getTime() + 86400000).toISOString())}`,
    });
    expect(availability.statusCode).toBe(200);
    expect(availability.json().simulated).toBe(true);
    // Choose the API's free slot: failed/interrupted runs may conservatively retain a reservation.
    // Do not release another run's uncertain reservation just to make a fixture reusable.
    expect(availability.json().slots.length).toBeGreaterThan(0);
    const selectedStart = availability.json().slots[0].start as string;
    const proposal = await inject({
      method: 'POST',
      url: '/api/v1/meetings/proposals',
      payload: {
        start: selectedStart,
        name: 'Synthetic visitor',
        email: 'flow@example.test',
        topic: 'Integração demonstrativa',
      },
    });
    expect(proposal.statusCode).toBe(201);
    const draft = proposal.json();
    proposalId = draft.proposalId;
    const payload = {
      proposalId,
      confirmationToken: draft.confirmationToken,
      consent: true,
      consentVersion: draft.consentVersion,
    };
    const idempotencyKey = randomUUID();
    const request = await inject({
      method: 'POST',
      url: '/api/v1/meetings/requests',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(request.statusCode).toBe(201);
    const pending = request.json();
    meetingId = pending.id;
    expect(pending.status).toBe('PENDING');
    expect(calendar.events.size).toBe(0);
    const replay = await inject({
      method: 'POST',
      url: '/api/v1/meetings/requests',
      headers: { 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replay.json().id).toBe(meetingId);
    await eventually(async () => smtp.sent.length >= 1 && telegram.sent.length >= 1);
    expect(
      (
        await inject({
          method: 'POST',
          url: `/api/v1/admin/meetings/${meetingId}/approve`,
          headers: { cookie: logged.sessionCookie, origin: headers.origin },
        })
      ).statusCode,
    ).toBe(403);
    const approved = await inject({
      method: 'POST',
      url: `/api/v1/admin/meetings/${meetingId}/approve`,
      headers,
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe('APPROVED');
    await eventually(
      async () => (await meetings.status(meetingId!, pending.meetingToken)).status === 'CONFIRMED',
    );
    expect(calendar.events.size).toBe(1);
    await eventually(async () =>
      smtp.messages.some((delivery) => delivery.subject === 'Reunião confirmada'),
    );
    const status = await inject({
      url: `/api/v1/meetings/requests/${meetingId}/status`,
      headers: { 'x-meeting-token': pending.meetingToken },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('CONFIRMED');
    expect(status.body).not.toContain('flow@example.test');
    expect(
      (await inject({ method: 'POST', url: `/api/v1/admin/meetings/${meetingId}/cancel`, headers }))
        .statusCode,
    ).toBe(200);
    await eventually(async () => calendar.events.size === 0);
    await eventually(async () =>
      smtp.messages.some((delivery) => delivery.subject === 'Reunião cancelada'),
    );
    expect(
      (await pool.query('SELECT reserved_start FROM meetings WHERE id=$1', [meetingId])).rows[0]
        .reserved_start,
    ).toBeNull();
    expect((await inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode).toBe(
      204,
    );
    expect((await inject({ url: '/api/v1/admin/meetings', headers })).statusCode).toBe(401);
    expect(
      (await inject({ method: 'POST', url: '/api/v1/chat', payload: { message: 'oi' } }))
        .statusCode,
    ).toBe(200);
  } finally {
    await runtime.close();
    await app.close();
    await google.close();
    if (meetingId) {
      await pool.query('DELETE FROM meeting_outbox WHERE meeting_id=$1', [meetingId]);
      await pool.query('DELETE FROM meeting_audit WHERE meeting_id=$1', [meetingId]);
      await pool.query('UPDATE meeting_proposals SET meeting_id=NULL WHERE id=$1', [proposalId]);
      await pool.query('DELETE FROM meetings WHERE id=$1', [meetingId]);
    }
    if (proposalId) await pool.query('DELETE FROM meeting_proposals WHERE id=$1', [proposalId]);
    if (userId) {
      await pool.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM auth_user_roles WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM auth_external_identities WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM auth_users WHERE id=$1', [userId]);
    }
    if (stateHash)
      await pool.query('DELETE FROM auth_oauth_transactions WHERE state_hash=$1', [stateHash]);
    await pool.end();
  }
});
