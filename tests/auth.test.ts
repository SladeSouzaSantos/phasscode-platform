import type { FastifyRequest } from 'fastify';
import { exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadAuthConfig } from '../packages/shared-config/src/auth.js';
import { AuthService } from '../apps/orbe-node/src/auth/service.js';
import { AuthTokens } from '../apps/orbe-node/src/auth/jwt.js';
import {
  authConfig,
  authApp,
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
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
afterAll(async () => google.close());
async function setup(extra: NodeJS.ProcessEnv = {}) {
  const store = new MemoryAuthStore();
  const config = authConfig(google, extra);
  const result = await authApp(config, store);
  apps.push(result.app);
  return { ...result, store, config };
}
const request = (cookie: string, extra: Record<string, string> = {}) =>
  ({
    cookies: { 'phasscode-session': cookie.split('=')[1] },
    headers: extra,
  }) as unknown as FastifyRequest;

describe('authentication configuration', () => {
  it('is disabled by default and does not require identity credentials', async () => {
    expect(loadAuthConfig({})).toEqual({ enabled: false });
    await expect(
      new AuthService({ enabled: false }).requirePrincipal({} as FastifyRequest),
    ).rejects.toMatchObject({ code: 'AUTH_DISABLED', status: 404 });
  });
  it('requires explicit PostgreSQL and rejects unsafe production cookies or issuer URLs', () => {
    expect(() => loadAuthConfig({ AUTH_ENABLED: 'true' })).toThrow('Configuração de autenticação');
    expect(() =>
      authConfig(google, { NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }),
    ).toThrow();
    expect(() =>
      authConfig(google, { AUTH_JWT_ISSUER: 'https://user:password@example.test' }),
    ).toThrow('AUTH_JWT_ISSUER');
    expect(() => authConfig(google, { AUTH_JWT_ISSUER: 'https://example.test/#fragment' })).toThrow(
      'AUTH_JWT_ISSUER',
    );
    expect(() => authConfig(google, { AUTH_GOOGLE_ISSUER: 'https://attacker.example' })).toThrow(
      'Google OIDC',
    );
    expect(() => authConfig(google, { PERSISTENCE: 'memory' })).toThrow('PostgreSQL');
  });
  it('restricts insecure cookies to loopback for both the backend and frontend', () => {
    expect(() =>
      authConfig(google, {
        AUTH_COOKIE_SECURE: 'false',
        AUTH_PUBLIC_URL: 'https://api.example.test',
      }),
    ).toThrow('Cookie sem Secure');
    expect(() =>
      authConfig(google, {
        AUTH_COOKIE_SECURE: 'false',
        AUTH_FRONTEND_URL: 'https://portfolio.example.test/login-complete',
      }),
    ).toThrow('Cookie sem Secure');
    expect(authConfig(google, { AUTH_COOKIE_SECURE: 'false' }).AUTH_COOKIE_SECURE).toBe(false);
  });
});
describe('Google OIDC through real HTTP, PKCE and signed JWKS', () => {
  it('uses S256/state/nonce, binds the browser, verifies Google signature and exposes no JWT', async () => {
    const { app, service, store } = await setup();
    const previousJwks = google.jwksRequests;
    const result = await login(app, service, google);
    expect(result.start.statusCode).toBe(302);
    const authorization = new URL(result.start.headers.location!);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('scope')).toBe('openid email profile');
    expect(authorization.searchParams.get('nonce')).toHaveLength(43);
    expect(result.callback.statusCode).toBe(302);
    expect(result.callback.headers.location).toBe('http://localhost:5173/login-complete');
    expect(google.jwksRequests).toBeGreaterThan(previousJwks);
    expect(result.state.authenticated).toBe(true);
    expect(result.state.user.roles).toEqual(['user']);
    expect(result.callback.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    const stored = [...store.sessions.values()][0]!;
    expect(stored.tokenHash).not.toBe(result.sessionCookie.split('=')[1]);
    expect(JSON.stringify(stored)).not.toContain('google-access-never-persist');
    expect(Object.keys(result.state)).not.toContain('accessToken');
  });
  it('rejects a callback without its browser transaction cookie and prevents replay', async () => {
    const { app, service } = await setup();
    const result = await login(app, service, google);
    const replay = await app.inject({
      method: 'GET',
      url: result.callbackUrl,
      headers: { cookie: result.transactionCookie },
    });
    expect(replay.statusCode).toBe(401);
    const start = await app.inject('/api/v1/auth/login/google');
    expect((await app.inject(google.authorize(start.headers.location!))).statusCode).toBe(401);
  });
  it.each([
    { nonce: 'forged' },
    { iss: 'https://other.example' },
    { aud: 'other-client' },
    { email_verified: false },
    { exp: 1 },
  ])('rejects invalid ID token claims %j', async (claims) => {
    const { app, service } = await setup();
    const result = await login(app, service, google, claims);
    expect(result.callback.statusCode).toBe(401);
    expect(result.state.authenticated).toBe(false);
  });
  it('rejects an ID token signed with another key', async () => {
    const { app, service } = await setup();
    expect((await login(app, service, google, {}, true)).callback.statusCode).toBe(401);
  });
  it('rejects changed PKCE proof and expired OAuth transactions before granting a session', async () => {
    const { app, service, store } = await setup();
    for (const expired of [false, true]) {
      const start = await app.inject('/api/v1/auth/login/google');
      const transaction = [...store.transactions.values()].at(-1)!;
      if (expired) transaction.expiresAt = new Date(0);
      else transaction.verifier = 'wrong-proof';
      const callback = await app.inject({
        url: google.authorize(start.headers.location!),
        headers: { cookie: cookieValue(start.headers['set-cookie'], service.loginCookieName) },
      });
      expect(callback.statusCode).toBe(401);
    }
    expect(store.sessions.size).toBe(0);
  });
  it('does not merge different subjects merely because email addresses match', async () => {
    const { app, service, store } = await setup();
    const first = await login(app, service, google);
    const second = await login(app, service, google, { sub: 'google-other' });
    expect(first.state.user.id).not.toBe(second.state.user.id);
    expect(store.users.size).toBe(2);
  });
  it('emits host-only Secure HttpOnly SameSite=Lax cookies when configured', async () => {
    const { app, service } = await setup({ AUTH_COOKIE_SECURE: 'true' });
    const result = await login(app, service, google);
    const headers = JSON.stringify(result.callback.headers['set-cookie']);
    expect(headers).toContain('__Host-phasscode-session');
    expect(headers).toContain('Secure');
    expect(headers).toContain('SameSite=Lax');
    expect(headers).not.toContain('Domain=');
  });
});
describe('sessions, authorization, rotation and JWT resource access', () => {
  it('denies administration without a role and enforces Origin plus CSRF for cookie mutations', async () => {
    const { app, service, store } = await setup();
    const result = await login(app, service, google);
    expect(
      (await app.inject({ url: '/test-admin', headers: { cookie: result.sessionCookie } }))
        .statusCode,
    ).toBe(403);
    store.users.get(result.state.user.id)!.roles.push('admin');
    expect(
      (await app.inject({ url: '/test-admin', headers: { cookie: result.sessionCookie } }))
        .statusCode,
    ).toBe(200);
    for (const headers of [
      {},
      { origin: 'http://evil.example', 'x-csrf-token': result.state.csrfToken },
      { origin: 'http://localhost:5173', 'x-csrf-token': 'wrong' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/test-admin',
            headers: { cookie: result.sessionCookie, ...headers },
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/test-admin',
          headers: {
            cookie: result.sessionCookie,
            origin: 'http://localhost:5173',
            'x-csrf-token': result.state.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('never lets a caller-provided Bearer header bypass cookie CSRF on admin mutations', async () => {
    const { app, service, store } = await setup();
    const logged = await login(app, service, google);
    store.users.get(logged.state.user.id)!.roles.push('admin');
    const jwt = await service.issueAccessToken(request(logged.sessionCookie));

    // A valid, signed JWT remains accepted for a read-only request.
    expect(
      (await app.inject({ url: '/test-admin', headers: { authorization: `Bearer ${jwt}` } }))
        .statusCode,
    ).toBe(200);

    // Supplying Authorization must not select a weaker auth/CSRF path for mutations.
    for (const headers of [
      { authorization: `Bearer ${jwt}` },
      { authorization: `Bearer ${jwt}`, cookie: logged.sessionCookie },
      {
        authorization: `Bearer ${jwt}`,
        cookie: logged.sessionCookie,
        origin: 'http://localhost:5173',
        'x-csrf-token': 'invalid',
      },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/test-admin', headers });
      expect([401, 403]).toContain(response.statusCode);
    }

    // Even when both credentials are present, the browser cookie requires its CSRF proof.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/test-admin',
          headers: {
            authorization: `Bearer ${jwt}`,
            cookie: logged.sessionCookie,
            origin: 'http://localhost:5173',
            'x-csrf-token': logged.state.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('rotates the opaque cookie and revokes the entire family on refresh reuse', async () => {
    const { app, service } = await setup();
    const result = await login(app, service, google);
    const headers = {
      cookie: result.sessionCookie,
      origin: 'http://localhost:5173',
      'x-csrf-token': result.state.csrfToken,
    };
    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers });
    expect(refreshed.statusCode).toBe(200);
    const newCookie = cookieValue(refreshed.headers['set-cookie'], service.cookieName);
    expect(newCookie).not.toBe(result.sessionCookie);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: newCookie } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: newCookie } })).statusCode,
    ).toBe(401);
  });
  it('issues JWT internally, publishes only public keys, validates Bearer and revokes immediately at logout', async () => {
    const { app, service } = await setup();
    const result = await login(app, service, google);
    const jwt = await service.issueAccessToken(request(result.sessionCookie));
    const me = await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${jwt}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().id).toBe(result.state.user.id);
    const jwks = (await app.inject('/.well-known/jwks.json')).json();
    expect(jwks.keys[0].alg).toBe('RS256');
    expect(jwks.keys[0].d).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: {
            cookie: result.sessionCookie,
            origin: 'http://localhost:5173',
            'x-csrf-token': result.state.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${jwt}` } }))
        .statusCode,
    ).toBe(401);
  });
  it.each([{ iss: 'https://wrong.example' }, { aud: 'wrong-audience' }, { exp: 1 }])(
    'rejects validly signed JWT with wrong claims %j',
    async (claims) => {
      const { app, config, service, store } = await setup();
      const logged = await login(app, service, google);
      const active = [...store.sessions.values()][0]!;
      const now = Math.floor(Date.now() / 1000);
      const jwt = await new SignJWT({
        sub: logged.state.user.id,
        sid: active.id,
        iss: config.AUTH_PUBLIC_URL,
        aud: config.AUTH_JWT_AUDIENCE,
        iat: now,
        exp: now + 300,
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid: config.AUTH_JWT_KEY_ID, typ: 'at+jwt' })
        .sign(google.key.privateKey);
      expect(
        (await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${jwt}` } }))
          .statusCode,
      ).toBe(401);
    },
  );
  it('rejects wrong JWT purpose and a changed signature even for an active session', async () => {
    const { app, service, store, config } = await setup();
    const logged = await login(app, service, google);
    const active = [...store.sessions.values()][0]!;
    const jwt = await service.issueAccessToken(request(logged.sessionCookie));
    const parts = jwt.split('.');
    parts[2] = (parts[2]!.startsWith('a') ? 'b' : 'a') + parts[2]!.slice(1);
    expect(
      (
        await app.inject({
          url: '/api/v1/me',
          headers: { authorization: `Bearer ${parts.join('.')}` },
        })
      ).statusCode,
    ).toBe(401);
    const now = Math.floor(Date.now() / 1000);
    const wrongPurpose = await new SignJWT({ sub: active.userId, sid: active.id })
      .setIssuer(config.AUTH_PUBLIC_URL)
      .setAudience(config.AUTH_JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setProtectedHeader({ alg: 'RS256', kid: config.AUTH_JWT_KEY_ID, typ: 'JWT' })
      .sign(google.key.privateKey);
    expect(
      (
        await app.inject({
          url: '/api/v1/me',
          headers: { authorization: `Bearer ${wrongPurpose}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('does not use token role claims after an administrative role has been removed', async () => {
    const { app, service, store } = await setup();
    const result = await login(app, service, google);
    const user = store.users.get(result.state.user.id)!;
    user.roles.push('admin');
    const jwt = await service.issueAccessToken(request(result.sessionCookie));
    user.roles = ['user'];
    expect(
      (await app.inject({ url: '/test-admin', headers: { authorization: `Bearer ${jwt}` } }))
        .statusCode,
    ).toBe(403);
  });
  it('supports overlap of public signing keys and rejects private JWKS material', async () => {
    const config = authConfig(google);
    const old = await AuthTokens.create(config);
    const { app, service, store } = await setup();
    await login(app, service, google);
    const session = [...store.sessions.values()][0]!;
    const oldToken = await old.issue(session);
    const nextKey = await generateKeyPair('RS256', { extractable: true });
    const rotated = await AuthTokens.create({
      ...config,
      AUTH_JWT_KEY_ID: 'next-key',
      AUTH_JWT_PRIVATE_KEY: await exportPKCS8(nextKey.privateKey),
      AUTH_JWT_PREVIOUS_JWKS: JSON.stringify(old.jwks),
    });
    expect(rotated.jwks.keys).toHaveLength(2);
    await expect(rotated.verify(oldToken)).resolves.toEqual({
      userId: session.userId,
      sessionId: session.id,
    });
    await expect(
      AuthTokens.create({
        ...config,
        AUTH_JWT_PREVIOUS_JWKS: JSON.stringify({
          keys: [{ ...old.jwks.keys[0], kid: 'old-key', d: 'private' }],
        }),
      }),
    ).rejects.toThrow('públicas');
  });
  it('denies expired or disabled sessions and returns anonymous session state safely', async () => {
    const { app, service, store } = await setup();
    expect((await app.inject('/api/v1/auth/session')).json().authenticated).toBe(false);
    const result = await login(app, service, google);
    store.users.get(result.state.user.id)!.disabled = true;
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
        .statusCode,
    ).toBe(401);
    store.users.get(result.state.user.id)!.disabled = false;
    [...store.sessions.values()][0]!.expiresAt = new Date(0);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
        .statusCode,
    ).toBe(401);
  });
});
