import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { exportPKCS8, generateKeyPair } from 'jose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GoogleOidc } from '../apps/orbe-node/src/auth/google.js';
import type { OAuthTransaction } from '../apps/orbe-node/src/auth/types.js';
import { loadAuthConfig } from '../packages/shared-config/src/auth.js';
import {
  OIDC_CONTROL_HEADER,
  OIDC_PLAN_COOKIE,
  startLocalOidcProvider,
  type LocalOidcScenario,
} from './e2e/local-oidc.js';

const controlKey = randomBytes(32).toString('base64url');
const redirectUri = 'http://127.0.0.1:3000/api/v1/auth/callback/google';
const secret = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
let fixture: Awaited<ReturnType<typeof startLocalOidcProvider>>;
let provider: GoogleOidc;
let timeOffset = 0;
beforeAll(async () => {
  fixture = await startLocalOidcProvider({
    clientId: 'test-client',
    clientSecret: 'test-client-secret',
    redirectUris: [redirectUri],
    adminEmail: 'admin@example.test',
    controlKey,
    clock: () => Date.now() + timeOffset,
  });
  const platformKey = await generateKeyPair('RS256', { extractable: true });
  const config = loadAuthConfig({
    NODE_ENV: 'test',
    PERSISTENCE: 'postgres',
    DATABASE_URL: 'postgresql://unused:unused@localhost/unused',
    AUTH_ENABLED: 'true',
    AUTH_ADMIN_EMAIL: 'admin@example.test',
    AUTH_PUBLIC_URL: 'http://127.0.0.1:3000',
    AUTH_FRONTEND_URL: 'http://127.0.0.1:5173',
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AUTH_GOOGLE_ISSUER: fixture.issuer,
    AUTH_COOKIE_SECURE: 'false',
    AUTH_JWT_KEY_ID: 'b2-oidc-unit-key',
    AUTH_JWT_PRIVATE_KEY: await exportPKCS8(platformKey.privateKey),
  });
  if (!config.enabled) throw new Error('OIDC fixture configuration unexpectedly disabled.');
  provider = new GoogleOidc(config);
});
afterAll(async () => {
  await fixture?.close();
});

async function plan(scenario: LocalOidcScenario, subject?: string) {
  const response = await fetch(`${fixture.issuer}/__control/authorization`, {
    method: 'POST',
    headers: { [OIDC_CONTROL_HEADER]: controlKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, ...(subject && { subject }) }),
  });
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as { id: string };
  return `${OIDC_PLAN_COOKIE}=${id}`;
}
async function authorize(scenario: LocalOidcScenario = 'admin') {
  const state = secret(),
    nonce = secret(),
    verifier = secret();
  const transaction: OAuthTransaction = {
    stateHash: hash(state),
    browserHash: hash(secret()),
    nonce,
    verifier,
    expiresAt: new Date(Date.now() + 600_000),
  };
  const url = await provider.authorizationUrl(state, nonce, verifier);
  const cookie = await plan(scenario, `unit-${randomUUID()}`);
  const response = await fetch(url, { redirect: 'manual', headers: { cookie } });
  expect(response.status).toBe(302);
  const callback = new URL(response.headers.get('location')!);
  return { state, nonce, verifier, transaction, callback, url, cookie, response };
}
function tokenForm(callback: URL, verifier: string, overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'test-client',
    client_secret: 'test-client-secret',
    code: callback.searchParams.get('code')!,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    ...overrides,
  });
}
async function token(body: URLSearchParams) {
  return fetch(`${fixture.issuer}/token`, { method: 'POST', body });
}

it('runs real discovery, JWKS, authorization code, PKCE and signed ID-token validation', async () => {
  const flow = await authorize();
  const authorization = new URL(flow.url);
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('code_challenge')).toBe(
    createHash('sha256').update(flow.verifier).digest('base64url'),
  );
  expect(flow.callback.origin + flow.callback.pathname).toBe(redirectUri);
  expect(flow.callback.searchParams.get('state')).toBe(flow.state);
  expect(flow.response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Max-Age=0');
  expect(flow.response.headers.get('referrer-policy')).toBe('no-referrer');
  const profile = await provider.exchange(flow.callback, flow.transaction, flow.state);
  expect(profile).toMatchObject({ issuer: fixture.issuer, email: 'admin@example.test' });
  const response = await fetch(`${fixture.issuer}/__control/stats`, {
    headers: { [OIDC_CONTROL_HEADER]: controlKey },
  });
  const stats = (await response.json()) as Record<string, unknown>;
  expect(stats.discoveryRequests).toBeGreaterThan(0);
  expect(stats.jwksRequests).toBeGreaterThan(0);
  expect(stats.tokenAccepted).toBeGreaterThan(0);
  for (const value of [
    flow.state,
    flow.nonce,
    flow.verifier,
    flow.callback.searchParams.get('code')!,
    controlKey,
  ])
    expect(JSON.stringify(stats)).not.toContain(value);
});

it('returns a cryptographically valid denied identity for the real application admission policy', async () => {
  const flow = await authorize('denied');
  expect(await provider.exchange(flow.callback, flow.transaction, flow.state)).toMatchObject({
    issuer: fixture.issuer,
    email: 'denied@example.test',
  });
});

it.each([
  'wrong-state',
  'wrong-nonce',
  'wrong-issuer',
  'wrong-audience',
  'wrong-signature',
  'wrong-pkce',
  'tampered-code',
  'unverified-email',
  'expired-token',
  'cancel',
  'provider-error',
] as const)('rejects %s through the unmodified GoogleOidc client', async (scenario) => {
  const flow = await authorize(scenario);
  await expect(
    provider.exchange(flow.callback, flow.transaction, flow.state),
  ).rejects.toMatchObject({
    code: 'AUTH_LOGIN_FAILED',
    status: 401,
  });
});

it('consumes an authorization code once and rejects token replay', async () => {
  const flow = await authorize();
  expect((await token(tokenForm(flow.callback, flow.verifier))).status).toBe(200);
  const replay = await token(tokenForm(flow.callback, flow.verifier));
  expect(replay.status).toBe(400);
  expect(await replay.json()).toEqual({ error: 'invalid_grant' });
});

it('requires client authentication without consuming a valid code on unauthenticated attempts', async () => {
  const flow = await authorize();
  const denied = await token(
    tokenForm(flow.callback, flow.verifier, { client_secret: 'incorrect-synthetic-secret' }),
  );
  expect(denied.status).toBe(401);
  expect(await denied.json()).toEqual({ error: 'invalid_client' });
  expect((await token(tokenForm(flow.callback, flow.verifier))).status).toBe(200);
});

it.each(['pkce', 'redirect'] as const)(
  'binds code to %s and consumes rejected proofs',
  async (binding) => {
    const flow = await authorize();
    const form = tokenForm(
      flow.callback,
      binding === 'pkce' ? secret() : flow.verifier,
      binding === 'redirect' ? { redirect_uri: 'http://127.0.0.1:3000/other-callback' } : {},
    );
    const rejected = await token(form);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'invalid_grant' });
    expect((await token(tokenForm(flow.callback, flow.verifier))).status).toBe(400);
  },
);

it('expires authorization grants without sleeps', async () => {
  const flow = await authorize();
  try {
    timeOffset = 120_001;
    const response = await token(tokenForm(flow.callback, flow.verifier));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant' });
  } finally {
    timeOffset = 0;
  }
});

it('requires a one-use plan cookie per browser context and never selects an implicit administrator', async () => {
  const flow = await authorize();
  const replay = await fetch(flow.url, { redirect: 'manual', headers: { cookie: flow.cookie } });
  expect(replay.status).toBe(400);
  expect(await replay.json()).toEqual({ error: 'authorization_plan_required' });
  const missing = await fetch(flow.url, { redirect: 'manual' });
  expect(missing.status).toBe(400);
  expect(missing.headers.get('location')).toBeNull();
});

it('does not redirect to unregistered URIs or accept duplicate authorization parameters', async () => {
  const flow = await authorize();
  for (const change of ['redirect', 'state', 'pkce'] as const) {
    const url = new URL(flow.url);
    if (change === 'redirect')
      url.searchParams.set('redirect_uri', 'https://unregistered.invalid/callback');
    if (change === 'state') url.searchParams.append('state', secret());
    if (change === 'pkce') url.searchParams.delete('code_challenge');
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { cookie: await plan('admin') },
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  }
});

it('protects the harness control plane and rejects arbitrary claim injection', async () => {
  const unauthorized = await fetch(`${fixture.issuer}/__control/stats`);
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get('access-control-allow-origin')).toBeNull();
  const injected = await fetch(`${fixture.issuer}/__control/authorization`, {
    method: 'POST',
    headers: { [OIDC_CONTROL_HEADER]: controlKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'admin', email: 'injected@example.test', roles: ['admin'] }),
  });
  expect(injected.status).toBe(400);
  expect(await injected.json()).toEqual({ error: 'invalid_request' });
});
