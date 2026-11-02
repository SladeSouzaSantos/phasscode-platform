import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { exportPKCS8, generateKeyPair } from 'jose';
import { loadConfig } from '../../packages/shared-config/src/index.js';
import { createPool } from '../../packages/database/src/pool.js';
import { FakeCalendarAdapter } from '../../packages/integrations/src/calendar.js';
import { AuthService } from '../../apps/orbe-node/src/auth/service.js';
import { MeetingService } from '../../apps/orbe-node/src/meetings/service.js';
import { PostgresMeetingStore } from '../../apps/orbe-node/src/meetings/postgres-store.js';
import { PostgresConversationStore } from '../../apps/orbe-node/src/adapters/postgres-store.js';
import { JsonKnowledgeRepository } from '../../apps/orbe-node/src/adapters/knowledge.js';
import { MockChatProvider } from '../../apps/orbe-node/src/adapters/mock-provider.js';
import { buildApp } from '../../apps/orbe-node/src/http/app.js';
import { createLocalProxy } from '../browser/local-proxy.js';
import { startLocalOidcProvider } from './local-oidc.js';

// This entrypoint is outside production builds. No .env loader or public bypass.
const ownershipNonce = process.env.PHASSCODE_B2_OWNERSHIP_NONCE ?? '';
const controlKey = process.env.PHASSCODE_B2_CONTROL_KEY ?? '';
const database = 'postgresql://synthetic:synthetic@postgres:5432/phasscode_e2e';
const redisUrl = 'redis://redis:6379/0';
if (
  process.platform !== 'linux' ||
  process.env.NODE_ENV !== 'test' ||
  !/^[0-9a-f-]{36}$/.test(ownershipNonce) ||
  controlKey.length < 32 ||
  process.env.DATABASE_URL !== database ||
  process.env.REDIS_URL !== redisUrl
) {
  throw new Error('B2 runtime requires its isolated Compose test dependencies.');
}
await access('/.dockerenv');

interface Gate {
  id: string;
  path: string;
  phase: 'before' | 'after';
  effect: 'hold' | 'drop';
  entered: boolean;
  released: boolean;
  completed: boolean;
  assigned: boolean;
  wait: Promise<void>;
  release(): void;
}
interface Observation {
  method: string;
  path: string;
  status?: number;
  completed: boolean;
}
const gates = new Map<string, Gate>();
const requests: Observation[] = [];
let activeRequests = 0;
const pool = createPool(database);
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on('error', () => {
  /* Never print driver credentials or request data. */
});
await redis.connect();
const oidc = await startLocalOidcProvider({
  host: '127.0.0.1',
  port: 4400,
  controlKey,
  clientId: 'test-client',
  clientSecret: 'test-client-secret',
  redirectUris: ['http://127.0.0.1:3000/api/v1/auth/callback/google'],
  adminEmail: 'admin@example.test',
});
const key =
  process.env.AUTH_JWT_PRIVATE_KEY ??
  (await exportPKCS8((await generateKeyPair('RS256', { extractable: true })).privateKey));
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PERSISTENCE: 'postgres',
  DATABASE_URL: database,
  REDIS_URL: redisUrl,
  CORS_ORIGINS: 'http://127.0.0.1:5173',
  LLM_PROVIDER: 'mock',
  AUTH_ENABLED: 'true',
  AUTH_ADMIN_EMAIL: 'admin@example.test',
  AUTH_PUBLIC_URL: 'http://127.0.0.1:3000',
  AUTH_FRONTEND_URL: 'http://127.0.0.1:5173/',
  AUTH_COOKIE_SECURE: 'false',
  AUTH_GOOGLE_ISSUER: oidc.issuer,
  AUTH_GOOGLE_CLIENT_ID: 'test-client',
  AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
  AUTH_JWT_PRIVATE_KEY: key,
  AUTH_JWT_KEY_ID: 'b2-disposable-key',
  MEETINGS_ENABLED: 'true',
  MEETINGS_TIMEZONE: 'UTC',
  MEETINGS_WORKDAYS: '1,2,3,4,5,6,7',
  MEETINGS_WORK_START: '09:00',
  MEETINGS_WORK_END: '18:00',
  MEETINGS_DURATION_MINUTES: '30',
  MEETINGS_MIN_NOTICE_MINUTES: '0',
  MEETINGS_BUFFER_MINUTES: '0',
  MEETINGS_MAX_HORIZON_DAYS: '60',
  GOOGLE_CALENDAR_MODE: 'fake',
  WORKER_ENABLED: 'false',
  NOTIFICATION_MODE: 'disabled',
});
const auth = await AuthService.create(config.auth, pool);
const store = new PostgresConversationStore(pool);
const app = await buildApp({
  config,
  auth,
  redis,
  store,
  provider: new MockChatProvider(),
  knowledge: await JsonKnowledgeRepository.load(),
  meetings: new MeetingService(
    config.meetings,
    new PostgresMeetingStore(pool),
    new FakeCalendarAdapter(),
  ),
  phase3Ready: async () => {
    const { rowCount } = await pool.query('SELECT name FROM schema_migrations');
    if (rowCount !== 5) throw new Error('B2 migrations incomplete.');
    await pool.query(
      'SELECT 1 FROM auth_users, meetings, meeting_outbox, notification_deliveries LIMIT 0',
    );
  },
});
await app.listen({ host: '127.0.0.1', port: 3001 });

async function listen(server: Server, port: number) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of request) {
    data += String(chunk);
    if (data.length > 4096) throw new Error('Oversize test control request.');
  }
  const value: unknown = data ? JSON.parse(data) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid test control request.');
  return value as Record<string, unknown>;
}
function pickGate(path: string) {
  const gate = [...gates.values()].find((item) => item.path === path && !item.assigned);
  if (gate) gate.assigned = true;
  return gate;
}

// Fault transport always forwards to the real Fastify. It never fabricates a
// successful API response; an after-gate drops/holds only the genuine reply.
const transport = createServer((request, response) => {
  void (async () => {
    ++activeRequests;
    const path = new URL(request.url ?? '/', 'http://127.0.0.1:3000').pathname;
    const observation: Observation = { method: request.method ?? 'GET', path, completed: false };
    requests.push(observation);
    if (requests.length > 2000) requests.shift();
    const gate = request.method === 'POST' ? pickGate(path) : undefined;
    try {
      if (gate?.phase === 'before') {
        gate.entered = true;
        await gate.wait;
      }
      if (gate?.effect === 'drop' && gate.phase === 'before') {
        response.destroy();
        return;
      }
      if (request.destroyed || response.destroyed) return;
      await new Promise<void>((resolve, reject) => {
        const upstream = httpRequest(
          {
            hostname: '127.0.0.1',
            port: 3001,
            method: request.method,
            path: request.url,
            headers: { ...request.headers, host: '127.0.0.1:3000' },
            agent: false,
          },
          (received) => {
            const chunks: Buffer[] = [];
            let size = 0;
            received.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > 1_048_576) received.destroy();
              else chunks.push(chunk);
            });
            received.on('error', reject);
            received.on('end', () => {
              void (async () => {
                observation.status = received.statusCode ?? 502;
                observation.completed = true;
                if (gate) gate.completed = true;
                if (gate?.phase === 'after') {
                  gate.entered = true;
                  await gate.wait;
                }
                if (gate?.effect === 'drop' || response.destroyed) response.destroy();
                else {
                  response.writeHead(received.statusCode ?? 502, received.headers);
                  response.end(Buffer.concat(chunks));
                }
                resolve();
              })().catch(reject);
            });
          },
        );
        upstream.on('error', reject);
        request.once('aborted', () => upstream.destroy());
        request.pipe(upstream);
      });
    } finally {
      --activeRequests;
    }
  })().catch(() => {
    if (!response.destroyed && !response.headersSent)
      json(response, 502, { error: { code: 'TEST_TRANSPORT_ERROR' } });
    else response.destroy();
  });
});
await listen(transport, 3000);
const browserProxy = createLocalProxy([
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  oidc.issuer,
]);
await listen(browserProxy, 4402);

async function snapshot() {
  const [migrations, users, sessions, proposals, meetings, audit, outbox, notifications, keys] =
    await Promise.all([
      pool.query('SELECT name,checksum FROM schema_migrations ORDER BY name'),
      pool.query('SELECT count(*)::int AS count FROM auth_users'),
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER(WHERE revoked_at IS NULL AND expires_at>now() AND absolute_expires_at>now())::int AS active,
      count(*) FILTER(WHERE revoked_at IS NOT NULL)::int AS revoked, count(*) FILTER(WHERE expires_at<=now() OR absolute_expires_at<=now())::int AS expired,
      count(DISTINCT family_id)::int AS families FROM auth_sessions`),
      pool.query('SELECT count(*)::int AS count FROM meeting_proposals'),
      pool.query('SELECT id,status,version FROM meetings ORDER BY created_at,id'),
      pool.query(
        'SELECT meeting_id AS "meetingId",action,version FROM meeting_audit ORDER BY created_at,id',
      ),
      pool.query(
        'SELECT meeting_id AS "meetingId",kind,version,attempts,(processed_at IS NOT NULL) AS processed FROM meeting_outbox ORDER BY created_at,id',
      ),
      pool.query('SELECT count(*)::int AS count FROM notification_deliveries'),
      redis.dbsize(),
    ]);
  return {
    ownershipNonce,
    migrations: migrations.rows,
    users: users.rows[0].count,
    sessions: sessions.rows[0],
    proposals: proposals.rows[0].count,
    meetings: meetings.rows,
    audit: audit.rows,
    outbox: outbox.rows,
    notifications: notifications.rows[0].count,
    redisKeys: keys,
    requests,
    activeRequests,
  };
}
const control = createServer((request, response) => {
  void (async () => {
    if (request.headers['x-e2e-control-key'] !== controlKey) {
      json(response, 403, { error: 'TEST_CONTROL_FORBIDDEN' });
      return;
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1:4401').pathname;
    if (request.method === 'GET' && path === '/ready') {
      json(response, 200, { ownershipNonce, ready: true });
      return;
    }
    if (request.method === 'GET' && path === '/snapshot') {
      json(response, 200, await snapshot());
      return;
    }
    const item = /^\/gates\/([a-f0-9-]{36})(\/release)?$/.exec(path);
    if (item) {
      const gate = gates.get(item[1]!);
      if (!gate) {
        json(response, 404, { error: 'TEST_GATE_NOT_FOUND' });
        return;
      }
      if (request.method === 'POST' && item[2]) gate.release();
      json(response, 200, {
        id: gate.id,
        entered: gate.entered,
        released: gate.released,
        completed: gate.completed,
      });
      return;
    }
    if (request.method !== 'POST') {
      json(response, 404, { error: 'TEST_CONTROL_NOT_FOUND' });
      return;
    }
    const data = await body(request);
    if (path === '/gates') {
      if (
        typeof data.path !== 'string' ||
        !/^\/api\/v1\/(?:auth\/(?:refresh|logout)|admin\/meetings\/[a-f0-9-]{36}\/(?:approve|reject|cancel))$/.test(
          data.path,
        ) ||
        !['before', 'after'].includes(String(data.phase)) ||
        !['hold', 'drop'].includes(String(data.effect)) ||
        gates.size >= 50
      ) {
        json(response, 400, { error: 'INVALID_TEST_GATE' });
        return;
      }
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const gate: Gate = {
        id: randomUUID(),
        path: data.path,
        phase: data.phase as Gate['phase'],
        effect: data.effect as Gate['effect'],
        entered: false,
        released: false,
        completed: false,
        assigned: false,
        wait,
        release: () => {
          gate.released = true;
          release();
        },
      };
      gates.set(gate.id, gate);
      json(response, 200, { id: gate.id });
      return;
    }
    if (path === '/reset') {
      if (activeRequests) {
        json(response, 409, { error: 'TEST_REQUESTS_STILL_ACTIVE' });
        return;
      }
      for (const gate of gates.values()) gate.release();
      gates.clear();
      await pool.query(`TRUNCATE notification_deliveries,meeting_outbox,meeting_audit,meetings,meeting_proposals,
        auth_sessions,auth_role_audit,auth_user_roles,auth_external_identities,auth_oauth_transactions,auth_users,
        conversation_messages,conversations CASCADE`);
      await redis.flushdb();
      requests.splice(0);
      json(response, 200, { ok: true });
      return;
    }
    if (path === '/sessions/revoke')
      await pool.query('UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL');
    else if (path === '/sessions/expire')
      await pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second',absolute_expires_at=now()-interval '1 second'",
      );
    else if (path === '/sessions/remove-admin')
      await pool.query("DELETE FROM auth_user_roles WHERE role='admin'");
    else if (path === '/bearer') {
      const cookie =
        typeof data.cookie === 'string'
          ? data.cookie
          : request.headers.cookie
              ?.split(';')
              .map((value) => value.trim())
              .find((value) => value.startsWith('phasscode-session='))
              ?.split('=')[1];
      if (!cookie) {
        json(response, 400, { error: 'TEST_SESSION_REQUIRED' });
        return;
      }
      const token = await auth.issueAccessToken({
        cookies: { 'phasscode-session': cookie },
        headers: {},
      } as unknown as FastifyRequest);
      json(response, 200, { token });
      return;
    } else {
      json(response, 404, { error: 'TEST_CONTROL_NOT_FOUND' });
      return;
    }
    json(response, 200, { ok: true });
  })().catch(() => {
    if (!response.headersSent) json(response, 500, { error: 'TEST_CONTROL_FAILED' });
  });
});
await listen(control, 4401);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const gate of gates.values()) gate.release();
  for (const server of [control, transport, browserProxy]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await app.close();
  await oidc.close();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
