import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { authHash } from '../apps/orbe-node/src/auth/service.js';
import {
  authApp,
  authConfig,
  cookieValue,
  fakeGoogle,
  login,
  MemoryAuthStore,
  type FakeGoogle,
} from './auth-fixtures.js';

let google: FakeGoogle;
const apps: Array<{ close(): Promise<void> }> = [];
beforeAll(async () => {
  google = await fakeGoogle();
});
afterAll(async () => google.close());
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(extra: NodeJS.ProcessEnv = {}) {
  const store = new MemoryAuthStore();
  const config = authConfig(google, extra);
  const result = await authApp(config, store);
  apps.push(result.app);
  return { ...result, store, config };
}
type Context = Awaited<ReturnType<typeof setup>>;
async function begin(context: Context, returnTo?: string, claims: Record<string, unknown> = {}) {
  const query = returnTo === undefined ? '' : `?${new URLSearchParams({ returnTo })}`;
  const started = await context.app.inject(`/api/v1/auth/login/google${query}`);
  expect(started.statusCode).toBe(302);
  return {
    cookie: cookieValue(started.headers['set-cookie'], context.service.loginCookieName),
    callback: google.authorize(started.headers.location!, claims),
    state: new URL(started.headers.location!).searchParams.get('state')!,
  };
}

describe('browser-bound Google login return navigation', () => {
  it('returns a denied HTML navigation to the configured frontend without leaking credentials', async () => {
    const context = await setup({
      AUTH_FRONTEND_URL: 'http://localhost:5173/login-complete?lang=pt',
    });
    const flow = await begin(context, undefined, { email: 'intruder@example.test' });
    const response = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      'http://localhost:5173/login-complete?lang=pt&auth_error=AUTH_ADMIN_ONLY',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers.location).not.toContain(flow.state);
    expect(response.headers.location).not.toContain(
      new URL(flow.callback, 'http://localhost:3000').searchParams.get('code')!,
    );
    expect(response.headers.location).not.toContain('intruder');
    expect(context.store.users.size).toBe(0);
    expect(context.store.sessions.size).toBe(0);
    expect(cookieValue(response.headers['set-cookie'], context.service.cookieName)).toBe(
      `${context.service.cookieName}=`,
    );
  });

  it('returns to the original path/query/hash and ignores a returnTo injected into the callback', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects?tag=java#gameboy', {
      email: 'intruder@example.test',
    });
    const value = flow.cookie.slice(context.service.loginCookieName.length + 1);
    expect(value).toContain('.');
    expect([...context.store.transactions.values()][0]!.browserHash).toBe(authHash(value));
    expect([...context.store.transactions.values()][0]!.browserHash).not.toBe(
      authHash(value.split('.')[0]!),
    );
    const response = await context.app.inject({
      url: `${flow.callback}&returnTo=https%3A%2F%2Fattacker.invalid`,
      headers: { cookie: flow.cookie, 'sec-fetch-mode': 'navigate' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      'http://localhost:5173/projects?tag=java&auth_error=AUTH_ADMIN_ONLY#gameboy',
    );
    expect(context.store.users.size).toBe(0);
    expect(context.store.sessions.size).toBe(0);
  });

  it('preserves successful navigation and removes a stale public error marker', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects?auth_error=OLD&tag=java#gameboy');
    const response = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://localhost:5173/projects?tag=java#gameboy');
    expect(context.store.sessions.size).toBe(1);
    expect(cookieValue(response.headers['set-cookie'], context.service.cookieName)).toMatch(
      /^phasscode-session=[A-Za-z0-9_-]{43}$/,
    );
  });

  it.each([
    { accept: 'application/json' },
    { accept: 'application/json, text/html', 'sec-fetch-mode': 'navigate' },
    { accept: 'text/html', 'sec-fetch-mode': 'cors' },
  ])('keeps a JSON HTTP error for non-navigation/API headers %j', async (headers) => {
    const context = await setup();
    const flow = await begin(context, '/projects#panel', { email: 'intruder@example.test' });
    const response = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, ...headers },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('AUTH_ADMIN_ONLY');
    expect(response.headers.location).toBeUndefined();
    expect(context.store.sessions.size).toBe(0);
  });

  it('rejects modified cookie metadata before token exchange and does not consume the legitimate transaction', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects#original');
    const count = google.tokenRequests;
    const value = flow.cookie.slice(context.service.loginCookieName.length + 1);
    const modified = `${context.service.loginCookieName}=${value.split('.')[0]}.${Buffer.from('/different').toString('base64url')}`;
    const rejected = await context.app.inject({
      url: flow.callback,
      headers: { cookie: modified, accept: 'text/html' },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.headers.location).toBeUndefined();
    expect(google.tokenRequests).toBe(count);
    expect(context.store.sessions.size).toBe(0);
    expect(context.store.transactions.size).toBe(1);
    const accepted = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(accepted.statusCode).toBe(302);
    expect(accepted.headers.location).toBe('http://localhost:5173/projects#original');
  });

  it('does not redirect or clear an administrator session on a callback without browser/state proof', async () => {
    const context = await setup();
    const current = await login(context.app, context.service, google);
    const response = await context.app.inject({
      url: '/api/v1/auth/callback/google?error=access_denied&returnTo=https://attacker.invalid',
      headers: { cookie: current.sessionCookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers.location).toBeUndefined();
    expect(cookieValue(response.headers['set-cookie'], context.service.cookieName)).toBe('');
    expect(
      (
        await context.app.inject({
          url: '/api/v1/auth/session',
          headers: { cookie: current.sessionCookie },
        })
      ).json().authenticated,
    ).toBe(true);
  });

  it('consumes a browser-bound OAuth cancellation and returns only a fixed public error code', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects?lang=pt#section');
    const callback = `/api/v1/auth/callback/google?${new URLSearchParams({ state: flow.state, error: 'access_denied', error_description: '<script>private-canary</script>' })}`;
    const count = google.tokenRequests;
    const response = await context.app.inject({
      url: callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      'http://localhost:5173/projects?lang=pt&auth_error=AUTH_LOGIN_FAILED#section',
    );
    expect(google.tokenRequests).toBe(count);
    expect(context.store.sessions.size).toBe(0);
    expect(context.store.users.size).toBe(0);
    expect(context.store.transactions.size).toBe(0);
    const replay = await context.app.inject({
      url: callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.headers.location).toBeUndefined();
  });

  it('still rejects invalid ID-token claims while returning a browser to its original page', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects', { nonce: 'incorrect-nonce' });
    const response = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      'http://localhost:5173/projects?auth_error=AUTH_LOGIN_FAILED',
    );
    expect(context.store.users.size).toBe(0);
    expect(context.store.sessions.size).toBe(0);
  });

  it('does not put internal error text into a browser redirect', async () => {
    const context = await setup();
    const flow = await begin(context, '/projects');
    vi.spyOn(context.store, 'findOrCreateUser').mockRejectedValueOnce(
      new Error('private-database-canary'),
    );
    const response = await context.app.inject({
      url: flow.callback,
      headers: { cookie: flow.cookie, accept: 'text/html' },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      'http://localhost:5173/projects?auth_error=AUTH_UNAVAILABLE',
    );
    expect(response.headers.location).not.toContain('private-database-canary');
    expect(context.store.sessions.size).toBe(0);
  });

  it.each([
    'https://attacker.invalid',
    '//attacker.invalid',
    '/\\attacker.invalid',
    '/projects\r\nLocation:evil',
  ])('rejects unsafe returnTo %j before opening a login transaction', async (returnTo) => {
    const context = await setup();
    const response = await context.app.inject(
      `/api/v1/auth/login/google?${new URLSearchParams({ returnTo })}`,
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
    expect(response.headers.location).toBeUndefined();
    expect(context.store.transactions.size).toBe(0);
  });
  it('rejects duplicate returnTo parameters', async () => {
    const context = await setup();
    const response = await context.app.inject(
      '/api/v1/auth/login/google?returnTo=/one&returnTo=/two',
    );
    expect(response.statusCode).toBe(400);
    expect(context.store.transactions.size).toBe(0);
  });
});
