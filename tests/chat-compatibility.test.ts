import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { AuthService } from '../apps/orbe-node/src/auth/service.js';
import { MeetingService } from '../apps/orbe-node/src/meetings/service.js';
import type { MeetingStore } from '../apps/orbe-node/src/meetings/ports.js';
import type { GenerationInput, GenerationResult } from '../apps/orbe-node/src/domain/ports.js';
import { FakeCalendarAdapter } from '../packages/integrations/src/calendar.js';
import { testApp } from './helpers.js';
import { fakeGoogle } from './auth-fixtures.js';

// Frozen response schema from dev/64c8414, before the uncommitted Phase 3 changes.
const legacy = new Ajv.default({ strict: false });
addFormats.default(legacy);
const validateLegacy = legacy.compile(
  JSON.parse(await readFile('tests/fixtures/chat-v1-response.schema.json', 'utf8')),
);
const apps: FastifyInstance[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(cleanups.splice(0).map((close) => close()));
});

async function setup(mode: 'disabled' | 'auth' | 'meetings') {
  const google = await fakeGoogle();
  cleanups.push(() => google.close());
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_MAX: '100',
    PERSISTENCE: 'postgres',
    DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/unused',
    REDIS_URL: 'redis://localhost:6379',
    AUTH_ENABLED: mode === 'disabled' ? 'false' : 'true',
    AUTH_PUBLIC_URL: 'http://localhost:3000',
    AUTH_FRONTEND_URL: 'http://localhost:5173',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_GOOGLE_ISSUER: google.issuer,
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'synthetic',
    AUTH_JWT_PRIVATE_KEY: google.privatePem,
    AUTH_JWT_KEY_ID: 'compat-test',
    MEETINGS_ENABLED: mode === 'meetings' ? 'true' : 'false',
    MEETINGS_TIMEZONE: 'America/Fortaleza',
    MEETINGS_WORKDAYS: '1,2,3,4,5,6',
    MEETINGS_WORK_START: '09:00',
    MEETINGS_WORK_END: '18:00',
    MEETINGS_DURATION_MINUTES: '30',
    MEETINGS_MIN_NOTICE_MINUTES: '1440',
    MEETINGS_BUFFER_MINUTES: '15',
    MEETINGS_MAX_HORIZON_DAYS: '60',
    GOOGLE_CALENDAR_MODE: mode === 'meetings' ? 'fake' : 'disabled',
  });
  // Dependencies are intentionally uncalled in this transport/contract regression.
  const meetings =
    mode === 'meetings'
      ? new MeetingService(config.meetings, {} as MeetingStore, new FakeCalendarAdapter())
      : undefined;
  const generate = vi.fn<(input: GenerationInput) => Promise<GenerationResult>>(async () => ({
    answer: 'Projeto público documentado.',
    sources: [],
    actions: [
      {
        type: 'confirm_meeting_request',
        proposal: {
          proposalId: randomUUID(),
          confirmationToken: 'S'.repeat(43),
          expiresAt: '2026-11-02T11:00:00Z',
          consentVersion: 'meetings-v1',
          simulated: true,
          summary: {
            start: '2026-11-02T12:00:00Z',
            end: '2026-11-02T12:30:00Z',
            timeZone: 'America/Fortaleza',
            name: 'Synthetic visitor',
            email: 'visitor@example.test',
            topic: 'Projeto demonstrativo',
          },
        },
      },
    ],
  }));
  const app = await testApp({
    config,
    provider: { name: 'mock', generate },
    auth: new AuthService({ enabled: false }),
    ...(meetings ? { meetings } : {}),
  });
  apps.push(app);
  return { app, generate };
}

it.each(['disabled', 'auth', 'meetings'] as const)(
  'preserva o cliente legado sem login com recursos %s',
  async (mode) => {
    const { app, generate } = await setup(mode);
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Projetos PHASSCODE' },
    });
    expect(first.statusCode).toBe(200);
    expect(validateLegacy(first.json()), JSON.stringify(validateLegacy.errors)).toBe(true);
    expect(first.json()).not.toHaveProperty('actions');
    expect(generate.mock.calls[0]![0].meetingActions).toBe(false);
    const next = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { 'x-conversation-token': first.json().conversationToken },
      payload: { message: 'Projetos PHASSCODE', conversationId: first.json().conversationId },
    });
    expect(next.statusCode).toBe(200);
    expect(validateLegacy(next.json())).toBe(true);
    expect(next.json()).not.toHaveProperty('conversationToken');
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'oi', conversationId: first.json().conversationId },
    });
    expect(invalid.statusCode).toBe(404);
  },
);
it('entrega actions somente ao cliente que opta por meetings-v1', async () => {
  const { app, generate } = await setup('meetings');
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/chat',
    headers: { 'x-orbe-capabilities': 'meetings-v1' },
    payload: { message: 'Projetos PHASSCODE' },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json().actions).toHaveLength(1);
  expect(generate.mock.calls[0]![0].meetingActions).toBe(true);
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/v1/chat',
    headers: { 'x-orbe-capabilities': 'unrecognized' },
    payload: { message: 'oi' },
  });
  expect(invalid.statusCode).toBe(400);
});
