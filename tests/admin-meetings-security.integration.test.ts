import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, InjectOptions } from 'fastify';
import { Redis } from 'ioredis';
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { FakeCalendarAdapter } from '../packages/integrations/src/calendar.js';
import { AuthService, authHash } from '../apps/orbe-node/src/auth/service.js';
import { PgAuthStore } from '../apps/orbe-node/src/auth/postgres.js';
import { MeetingService } from '../apps/orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../apps/orbe-node/src/meetings/postgres-store.js';
import { fakeGoogle, login, type FakeGoogle } from './auth-fixtures.js';
import { testApp } from './helpers.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('Use TEST_DATABASE_URL e TEST_REDIS_URL descartáveis do compose.test.yaml.');

const pool = createPool(databaseUrl);
const authStore = new PgAuthStore(pool);
const origin = 'http://localhost:5173';
const email = 'admin-meetings-security@example.test';
const userIds = new Set<string>();
const stateHashes = new Set<string>();
const proposalIds = new Set<string>();
const meetingIds = new Set<string>();
const clock = new Date();
const ajv = new Ajv.default({ strict: false });
addFormats.default(ajv);
const validators = new Map<string, ValidateFunction>();
type Operation = {
  responses: Record<string, { content: { 'application/json': { schema: AnySchema } } }>;
};
type ApiDocument = { paths: Record<string, Record<'get' | 'post', Operation>> };
let document: ApiDocument;
let google: FakeGoogle;
let app: FastifyInstance;
let auth: AuthService;
let redis: Redis;

beforeAll(async () => {
  await migrate(pool);
  google = await fakeGoogle();
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PERSISTENCE: 'postgres',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: origin,
    AUTH_ENABLED: 'true',
    AUTH_ADMIN_EMAIL: email,
    AUTH_PUBLIC_URL: 'http://localhost:3000',
    AUTH_FRONTEND_URL: `${origin}/login-complete`,
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AUTH_GOOGLE_ISSUER: google.issuer,
    AUTH_COOKIE_SECURE: 'false',
    AUTH_JWT_PRIVATE_KEY: google.privatePem,
    AUTH_JWT_KEY_ID: 'admin-meetings-security-test-key',
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
    WORKER_ENABLED: 'false',
    NOTIFICATION_MODE: 'disabled',
  });
  auth = await AuthService.create(config.auth, pool);
  const meetings = new MeetingService(
    config.meetings,
    new PostgresMeetingStore(pool),
    new FakeCalendarAdapter(),
    () => clock,
  );
  redis = new Redis(redisUrl!);
  app = await testApp({ config, auth, meetings, redis });
  const response = await app.inject('/api/v1/openapi.json');
  expect(response.statusCode).toBe(200);
  document = response.json<ApiDocument>();
});

afterAll(async () => {
  if (app) await app.close();
  else redis?.disconnect();
  if (google) await google.close();
  try {
    await pool.query('DELETE FROM meeting_outbox WHERE meeting_id=ANY($1::uuid[])', [
      [...meetingIds],
    ]);
    await pool.query('DELETE FROM meeting_audit WHERE meeting_id=ANY($1::uuid[])', [
      [...meetingIds],
    ]);
    await pool.query('UPDATE meeting_proposals SET meeting_id=NULL WHERE id=ANY($1::uuid[])', [
      [...proposalIds],
    ]);
    await pool.query('DELETE FROM meetings WHERE id=ANY($1::uuid[])', [[...meetingIds]]);
    await pool.query('DELETE FROM meeting_proposals WHERE id=ANY($1::uuid[])', [[...proposalIds]]);
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_role_audit WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_user_roles WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_external_identities WHERE user_id=ANY($1::uuid[])', [
      [...userIds],
    ]);
    await pool.query('DELETE FROM auth_users WHERE id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_oauth_transactions WHERE state_hash::text=ANY($1::text[])', [
      [...stateHashes],
    ]);
  } finally {
    await pool.end();
  }
});

function assertResponseSchema(
  path: string,
  method: 'get' | 'post',
  response: { statusCode: number; json(): unknown },
) {
  const key = `${method}:${path}:${response.statusCode}`;
  let validate = validators.get(key);
  if (!validate) {
    const schema =
      document.paths[path]?.[method].responses[response.statusCode]?.content['application/json']
        .schema;
    expect(schema, `Resposta ${key} deve estar documentada`).toBeDefined();
    validate = ajv.compile(schema!);
    validators.set(key, validate);
  }
  expect(validate(response.json()), JSON.stringify(validate.errors)).toBe(true);
}

async function fixture() {
  // The production limiter shares 20 requests/minute across auth and meetings by IP.
  const remoteAddress = `admin-meetings-security-${randomUUID()}`;
  const inject = (options: InjectOptions) => app.inject({ ...options, remoteAddress });
  const logged = await login(app, auth, google, { sub: randomUUID(), email }, false, remoteAddress);
  stateHashes.add(
    authHash(new URL(logged.callbackUrl, 'http://localhost:3000').searchParams.get('state')!),
  );
  expect(logged.callback.statusCode).toBe(302);
  expect(logged.state.authenticated).toBe(true);
  userIds.add(logged.state.user.id);
  const headers: Record<string, string> = {
    cookie: logged.sessionCookie,
    origin,
    'x-csrf-token': logged.state.csrfToken,
  };
  // JWTs remain server-side: the internal issuer supplies a genuine session-backed
  // credential to exercise the HTTP guard, without exposing a browser token route.
  const bearer = await auth.issueAccessToken({
    cookies: { [auth.cookieName]: logged.sessionCookie.split('=')[1] },
    headers: {},
  } as unknown as FastifyRequest);
  const start = new Date(clock.getTime() + 2 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  if (start.getUTCDay() === 0) start.setUTCDate(start.getUTCDate() + 1);
  const availability = await inject({
    url: `/api/v1/meetings/availability?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date(start.getTime() + 86400000).toISOString())}`,
  });
  expect(availability.statusCode).toBe(200);
  expect(availability.json().slots.length).toBeGreaterThan(0);
  const proposal = await inject({
    method: 'POST',
    url: '/api/v1/meetings/proposals',
    payload: {
      start: availability.json().slots[0].start,
      name: 'Synthetic security visitor',
      email: 'visitor@example.test',
      topic: 'Admin command security integration',
    },
  });
  expect(proposal.statusCode).toBe(201);
  const draft = proposal.json();
  proposalIds.add(draft.proposalId);
  const request = await inject({
    method: 'POST',
    url: '/api/v1/meetings/requests',
    headers: { 'idempotency-key': randomUUID() },
    payload: {
      proposalId: draft.proposalId,
      confirmationToken: draft.confirmationToken,
      consent: true,
      consentVersion: draft.consentVersion,
    },
  });
  expect(request.statusCode).toBe(201);
  const pending = request.json();
  meetingIds.add(pending.id);
  expect(pending.status).toBe('PENDING');
  return { inject, headers, bearer, meetingId: pending.id as string, userId: logged.state.user.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function snapshot(meetingId: string) {
  const [meeting, audit, outbox] = await Promise.all([
    pool.query(
      'SELECT status,version,reserved_start,reserved_end,approved_by,updated_at FROM meetings WHERE id=$1',
      [meetingId],
    ),
    pool.query(
      'SELECT action,actor_id,version FROM meeting_audit WHERE meeting_id=$1 ORDER BY action,version',
      [meetingId],
    ),
    pool.query(
      'SELECT kind,version,attempts,processed_at FROM meeting_outbox WHERE meeting_id=$1 ORDER BY kind,version',
      [meetingId],
    ),
  ]);
  return { meeting: meeting.rows, audit: audit.rows, outbox: outbox.rows };
}

type Denial = {
  name: string;
  status: number;
  code: string;
  prepare(fixture: Fixture): Promise<Record<string, string>> | Record<string, string>;
};
const denials: Denial[] = [
  {
    name: 'sem cookie',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: ({ headers }) => ({ origin, 'x-csrf-token': headers['x-csrf-token']! }),
  },
  {
    name: 'cookie forjado com Bearer legítimo',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: ({ headers, bearer }) => ({
      ...headers,
      cookie: `${auth.cookieName}=${randomBytes(32).toString('base64url')}`,
      authorization: `Bearer ${bearer}`,
    }),
  },
  {
    name: 'CSRF ausente',
    status: 403,
    code: 'AUTH_CSRF',
    prepare: ({ headers }) => ({ cookie: headers.cookie!, origin }),
  },
  {
    name: 'CSRF inválido',
    status: 403,
    code: 'AUTH_CSRF',
    prepare: ({ headers }) => ({
      ...headers,
      'x-csrf-token': randomBytes(32).toString('base64url'),
    }),
  },
  {
    name: 'Origin ausente',
    status: 403,
    code: 'AUTH_CSRF',
    prepare: ({ headers }) => ({
      cookie: headers.cookie!,
      'x-csrf-token': headers['x-csrf-token']!,
    }),
  },
  {
    name: 'Origin não autorizado',
    status: 403,
    code: 'ORIGIN_FORBIDDEN',
    prepare: ({ headers }) => ({ ...headers, origin: 'https://untrusted.example.test' }),
  },
  {
    name: 'Bearer legítimo isolado, mesmo com Origin e CSRF',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: ({ headers, bearer }) => ({
      origin,
      'x-csrf-token': headers['x-csrf-token']!,
      authorization: `Bearer ${bearer}`,
    }),
  },
  {
    name: 'cookie e Bearer legítimos não dispensam CSRF',
    status: 403,
    code: 'AUTH_CSRF',
    prepare: ({ headers, bearer }) => ({
      cookie: headers.cookie!,
      origin,
      authorization: `Bearer ${bearer}`,
    }),
  },
  {
    name: 'sessão revogada',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: async ({ headers }) => {
      const session = await authStore.sessionByHash(authHash(headers.cookie!.split('=')[1]!));
      expect(session).toBeDefined();
      await authStore.revokeFamily(session!.familyId);
      return headers;
    },
  },
  {
    name: 'sessão expirada',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: async ({ headers, userId }) => {
      await pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [userId],
      );
      return headers;
    },
  },
  {
    name: 'usuário desabilitado após login',
    status: 401,
    code: 'AUTH_REQUIRED',
    prepare: async ({ headers, userId }) => {
      await pool.query('UPDATE auth_users SET disabled_at=now() WHERE id=$1', [userId]);
      return headers;
    },
  },
  {
    name: 'papel admin removido após login',
    status: 403,
    code: 'AUTH_ADMIN_ONLY',
    prepare: async ({ headers, userId }) => {
      await pool.query("DELETE FROM auth_user_roles WHERE user_id=$1 AND role='admin'", [userId]);
      return headers;
    },
  },
  {
    name: 'e-mail fora da política administrativa após login',
    status: 403,
    code: 'AUTH_ADMIN_ONLY',
    prepare: async ({ headers, userId }) => {
      await pool.query('UPDATE auth_users SET email=$2 WHERE id=$1', [
        userId,
        'other@example.test',
      ]);
      return headers;
    },
  },
];

it('valida HTTP com o mesmo OpenAPI do artefato publicado', async () => {
  const generated = JSON.parse(await readFile('packages/contracts/openapi.json', 'utf8'));
  expect(document).toEqual(generated);
});

describe.each([
  { action: 'approve', status: 'APPROVED' },
  { action: 'reject', status: 'REJECTED' },
  { action: 'cancel', status: 'CANCELLED' },
] as const)('POST admin meetings $action', ({ action, status }) => {
  const path = `/api/v1/admin/meetings/{id}/${action}`;
  it('aceita cookie ativo, Origin permitido e CSRF correspondente', async () => {
    const current = await fixture();
    const response = await current.inject({
      method: 'POST',
      url: `/api/v1/admin/meetings/${current.meetingId}/${action}`,
      headers: current.headers,
    });
    expect(response.statusCode).toBe(200);
    assertResponseSchema(path, 'post', response);
    expect(response.json()).toMatchObject({ id: current.meetingId, status });
    const persisted = await snapshot(current.meetingId);
    expect(persisted.meeting[0]).toMatchObject({ status, version: 2 });
    expect(persisted.audit).toContainEqual({
      action: status,
      actor_id: current.userId,
      version: 2,
    });
  });

  it.each(denials)('recusa $name antes de qualquer efeito', async (denial) => {
    const current = await fixture();
    const headers = await denial.prepare(current);
    const before = await snapshot(current.meetingId);
    const response = await current.inject({
      method: 'POST',
      url: `/api/v1/admin/meetings/${current.meetingId}/${action}`,
      headers,
    });
    expect(response.statusCode).toBe(denial.status);
    expect(response.json().error.code).toBe(denial.code);
    assertResponseSchema(path, 'post', response);
    expect(await snapshot(current.meetingId)).toEqual(before);
  });
});

it.each(['cookie', 'Bearer'] as const)(
  'GET admin aceita %s legítimo sem Origin nem CSRF e consulta revogação atual',
  async (credential) => {
    const current = await fixture();
    const headers =
      credential === 'cookie'
        ? { cookie: current.headers.cookie! }
        : { authorization: `Bearer ${current.bearer}` };
    const before = await snapshot(current.meetingId);
    const url = '/api/v1/admin/meetings?limit=100';
    const response = await current.inject({ url, headers });
    expect(response.statusCode).toBe(200);
    assertResponseSchema('/api/v1/admin/meetings', 'get', response);
    expect(response.json().items).toContainEqual(
      expect.objectContaining({ id: current.meetingId, status: 'PENDING' }),
    );
    const session = await authStore.sessionByHash(authHash(current.headers.cookie!.split('=')[1]!));
    await authStore.revokeFamily(session!.familyId);
    const denied = await current.inject({ url, headers });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error.code).toBe('AUTH_REQUIRED');
    assertResponseSchema('/api/v1/admin/meetings', 'get', denied);
    expect(await snapshot(current.meetingId)).toEqual(before);
  },
);
