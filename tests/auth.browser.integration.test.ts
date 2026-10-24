import { createServer } from 'node:http';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture, launchLocalBrowser, type BrowserFixture } from './browser/fixtures.js';

let fixture: BrowserFixture | undefined;
let browser: Browser | undefined;
let context: BrowserContext | undefined;
beforeAll(async () => {
  fixture = await browserFixture();
  browser = await launchLocalBrowser(fixture.proxy);
  context = await browser.newContext({ serviceWorkers: 'block' });
  context.setDefaultTimeout(10000);
  context.setDefaultNavigationTimeout(15000);
});
afterAll(async () => {
  await context?.close();
  await browser?.close();
  await fixture?.close();
});
interface SessionState {
  authenticated: boolean;
  user: { roles: string[] } | null;
  csrfToken: string | null;
}
async function browserFetch(
  page: Page,
  api: string,
  path: string,
  options: {
    method?: string;
    csrf?: string;
    body?: unknown;
    credentials?: 'include' | 'omit';
  } = {},
) {
  return page.evaluate(
    async ({ url, options }) => {
      const headers: Record<string, string> = {};
      if (options.csrf) headers['X-CSRF-Token'] = options.csrf;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        credentials: options.credentials ?? 'include',
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
    { url: `${api}${path}`, options },
  );
}

it('bloqueia no proxy um destino loopback fora da allowlist sem atingir o servidor', async () => {
  if (!context) throw new Error('Fixture de navegador indisponível.');
  let hits = 0;
  const unauthorized = createServer((_request, response) => {
    hits++;
    response.end('Este servidor local nunca deve ser acessado pelo navegador.');
  });
  let page: Page | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      unauthorized.once('error', reject);
      unauthorized.listen(0, '127.0.0.1', resolve);
    });
    const address = unauthorized.address();
    if (!address || typeof address === 'string')
      throw new Error('Servidor local fora da allowlist indisponível.');
    page = await context.newPage();
    const outcome = await page.goto(`http://127.0.0.1:${address.port}/forbidden`).then(
      (response) => response?.status(),
      (error: unknown) => {
        // Chromium may expose a proxy's HTTP 403 as a failed navigation rather
        // than a page response. Accept only that specific refusal, not a timeout
        // or arbitrary network error that could conceal a broken test setup.
        if (error instanceof Error && error.message.includes('net::ERR_HTTP_RESPONSE_CODE_FAILURE'))
          return 'proxy-rejected';
        throw error;
      },
    );
    expect([403, 'proxy-rejected']).toContain(outcome);
    expect(hits).toBe(0);
  } finally {
    await page?.close();
    unauthorized.closeAllConnections();
    if (unauthorized.listening)
      await new Promise<void>((resolve, reject) =>
        unauthorized.close((error) => (error ? reject(error) : resolve())),
      );
  }
});

it('valida login, cookie HttpOnly, CORS/CSRF, refresh e logout em navegador real local', async () => {
  if (!fixture || !context) throw new Error('Fixture de navegador indisponível.');
  const { api, frontend, attacker, cookieName, requests, google } = fixture;
  const page = await context.newPage();
  await page.goto(frontend);
  const anonymous = await browserFetch(page, api, '/api/v1/auth/session');
  expect(anonymous.status).toBe(200);
  expect(anonymous.body.authenticated).toBe(false);
  const chatBefore = await browserFetch(page, api, '/api/v1/chat', {
    method: 'POST',
    body: { message: 'oi' },
    credentials: 'omit',
  });
  expect(chatBefore.status).toBe(200);
  expect(typeof chatBefore.body.answer).toBe('string');
  expect('actions' in chatBefore.body).toBe(false);

  await page.locator('#login').click();
  try {
    await page.waitForURL(`${frontend}/login-complete`);
  } catch {
    throw new Error(
      `O redirecionamento local não terminou: ${JSON.stringify({
        path: new URL(page.url()).pathname,
        requests: requests.map(({ method, path }) => ({ method, path })),
        tokenRequests: google.tokenRequests,
        jwksRequests: google.jwksRequests,
      })}`,
    );
  }
  expect(google.tokenRequests).toBeGreaterThan(0);
  expect(google.jwksRequests).toBeGreaterThan(0);
  expect(new URL(page.url()).search).toBe('');
  const initialResponse = await browserFetch(page, api, '/api/v1/auth/session');
  const initial = initialResponse.body as SessionState;
  expect(initial.authenticated).toBe(true);
  expect(initial.user?.roles).toEqual(['user']);
  expect(typeof initial.csrfToken).toBe('string');
  expect('accessToken' in initial).toBe(false);
  expect('refreshToken' in initial).toBe(false);
  const initialCookie = (await context.cookies(api)).find((cookie) => cookie.name === cookieName);
  expect(initialCookie?.httpOnly).toBe(true);
  expect(initialCookie?.sameSite).toBe('Lax');
  expect(initialCookie?.path).toBe('/');
  expect(initialCookie?.domain).toBe('127.0.0.1');
  // HTTP-only loopback fixture explicitly disables Secure. Production HTTPS is
  // a separate owner homologation; this test does not weaken the default.
  expect(initialCookie?.secure).toBe(false);
  expect(await page.evaluate(() => document.cookie.includes('phasscode-session'))).toBe(false);
  expect((await browserFetch(page, api, '/api/v1/me')).status).toBe(200);
  expect(
    (await browserFetch(page, api, '/api/v1/auth/session', { credentials: 'omit' })).body
      .authenticated,
  ).toBe(false);

  const missingCsrf = await browserFetch(page, api, '/api/v1/auth/refresh', { method: 'POST' });
  expect(missingCsrf.status).toBe(403);
  const wrongCsrf = await browserFetch(page, api, '/api/v1/auth/refresh', {
    method: 'POST',
    csrf: 'X'.repeat(43),
  });
  expect(wrongCsrf.status).toBe(403);
  expect(wrongCsrf.body.error.code).toBe('AUTH_CSRF');

  // Serialize both renewals and keep CSRF only in memory, as required of the UI.
  let current = initial;
  for (let index = 0; index < 2; index++) {
    if (!current.csrfToken) throw new Error('Estado local sem proteção CSRF.');
    const refreshed = await browserFetch(page, api, '/api/v1/auth/refresh', {
      method: 'POST',
      csrf: current.csrfToken,
    });
    expect(refreshed.status).toBe(200);
    const next = refreshed.body as SessionState;
    expect(next.authenticated).toBe(true);
    expect(next.csrfToken !== current.csrfToken).toBe(true);
    current = next;
  }
  const rotatedCookie = (await context.cookies(api)).find((cookie) => cookie.name === cookieName);
  expect(rotatedCookie?.value !== initialCookie?.value).toBe(true);
  expect(
    requests.some(
      (request) =>
        request.method === 'OPTIONS' &&
        request.path === '/api/v1/auth/refresh' &&
        request.origin === frontend,
    ),
  ).toBe(true);

  const attackerPage = await context.newPage();
  await attackerPage.goto(attacker);
  const attackResult = await attackerPage.evaluate(
    async ({ api, csrf }) => {
      try {
        await fetch(`${api}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf ?? '' },
        });
        return 'unexpectedly-readable';
      } catch {
        return 'blocked';
      }
    },
    { api, csrf: current.csrfToken },
  );
  expect(attackResult).toBe('blocked');
  expect(
    requests.some(
      (request) =>
        request.method === 'OPTIONS' &&
        request.path === '/api/v1/auth/refresh' &&
        request.origin === attacker,
    ),
  ).toBe(true);
  expect(
    requests.some(
      (request) =>
        request.method === 'POST' &&
        request.path === '/api/v1/auth/refresh' &&
        request.origin === attacker,
    ),
  ).toBe(false);
  await attackerPage.close();
  expect((await browserFetch(page, api, '/api/v1/me')).status).toBe(200);

  if (!current.csrfToken) throw new Error('Estado local sem proteção CSRF.');
  const logout = await browserFetch(page, api, '/api/v1/auth/logout', {
    method: 'POST',
    csrf: current.csrfToken,
  });
  expect(logout.status).toBe(204);
  expect((await context.cookies(api)).some((cookie) => cookie.name === cookieName)).toBe(false);
  expect((await browserFetch(page, api, '/api/v1/auth/session')).body.authenticated).toBe(false);
  expect((await browserFetch(page, api, '/api/v1/me')).status).toBe(401);
  const chatAfter = await browserFetch(page, api, '/api/v1/chat', {
    method: 'POST',
    body: { message: 'oi' },
    credentials: 'omit',
  });
  expect(chatAfter.status).toBe(200);
  expect('actions' in chatAfter.body).toBe(false);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
