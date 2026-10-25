import { access } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createServer as createPortReservation } from 'node:net';
import { chromium, type Browser } from 'playwright-core';
import { AuthService } from '../../apps/orbe-node/src/auth/service.js';
import { GoogleOidc } from '../../apps/orbe-node/src/auth/google.js';
import { AuthTokens } from '../../apps/orbe-node/src/auth/jwt.js';
import { loadConfig } from '../../packages/shared-config/src/index.js';
import { fakeGoogle, MemoryAuthStore } from '../auth-fixtures.js';
import { testApp } from '../helpers.js';
import { createLocalProxy } from './local-proxy.js';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor local indisponível.');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
async function freePort(): Promise<number> {
  const reservation = createPortReservation();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível.');
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export interface ObservedRequest {
  method: string;
  path: string;
  origin: string | undefined;
}
export async function browserFixture(options: { googleClaims?: Record<string, unknown> } = {}) {
  const cleanups: Array<() => Promise<void>> = [];
  const dispose = async () => {
    const results = await Promise.allSettled(
      cleanups
        .splice(0)
        .reverse()
        .map((cleanup) => cleanup()),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Falha ao encerrar uma dependência local do smoke de navegador.');
  };
  try {
    const google = await fakeGoogle();
    cleanups.push(() => google.close());
    let api = '';
    let browserIssuer = '';
    const authorizationServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', browserIssuer);
      response.setHeader('cache-control', 'no-store');
      if (url.pathname === '/.well-known/openid-configuration') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            issuer: browserIssuer,
            authorization_endpoint: `${browserIssuer}/authorize`,
            token_endpoint: `${google.issuer}/token`,
            jwks_uri: `${google.issuer}/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
            code_challenge_methods_supported: ['S256'],
          }),
        );
        return;
      }
      if (
        url.pathname === '/authorize' &&
        url.searchParams.get('redirect_uri') === `${api}/api/v1/auth/callback/google`
      ) {
        // Fake approval is an actual HTTP redirect. Token exchange and signing
        // remain in the shared local issuer fixture; no production provider runs.
        const callback = google.authorize(url.href, {
          ...options.googleClaims,
          iss: browserIssuer,
        });
        response.writeHead(302, { location: `${api}${callback}` }).end();
        return;
      }
      response.writeHead(404).end();
    });
    browserIssuer = await listen(authorizationServer);
    cleanups.push(() => close(authorizationServer));
    const frontendServer = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>PHASSCODE local browser fixture</title><h1>Teste local com identidade simulada</h1><a id="login" href="${api}/api/v1/auth/login/google">Entrar com provedor local</a><p id="status">Somente dados sintéticos.</p></html>`,
      );
    });
    const frontend = await listen(frontendServer);
    cleanups.push(() => close(frontendServer));
    const attackerServer = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><title>Untrusted local origin</title><p>Origem local não autorizada.</p>',
      );
    });
    const attacker = await listen(attackerServer);
    cleanups.push(() => close(attackerServer));
    const port = await freePort();
    api = `http://127.0.0.1:${port}`;
    // Route all browser HTTP(S), including redirects and background requests,
    // through a loopback proxy. Never enable Playwright route interception:
    // it synthesizes OPTIONS responses and would bypass the real CORS check.
    const blockedProxy = createLocalProxy([frontend, attacker, browserIssuer, api]);
    const proxy = await listen(blockedProxy);
    cleanups.push(() => close(blockedProxy));
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_MAX: '100',
      PERSISTENCE: 'postgres',
      DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1/unused',
      REDIS_URL: 'redis://127.0.0.1:6379',
      CORS_ORIGINS: frontend,
      AUTH_ENABLED: 'true',
      AUTH_ADMIN_EMAIL: 'alice@example.test',
      AUTH_PUBLIC_URL: api,
      AUTH_FRONTEND_URL: `${frontend}/login-complete`,
      AUTH_COOKIE_SECURE: 'false',
      AUTH_GOOGLE_ISSUER: browserIssuer,
      AUTH_GOOGLE_CLIENT_ID: 'test-client',
      AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
      AUTH_JWT_PRIVATE_KEY: google.privatePem,
      AUTH_JWT_KEY_ID: 'browser-test-key',
      LLM_PROVIDER: 'mock',
    });
    if (!config.auth.enabled) throw new Error('Fixture de autenticação inválida.');
    const store = new MemoryAuthStore();
    const auth = new AuthService(
      config.auth,
      store,
      new GoogleOidc(config.auth),
      await AuthTokens.create(config.auth),
    );
    // Explicit in-memory test adapters: no PostgreSQL/Redis connection is made.
    const app = await testApp({ config, auth });
    cleanups.push(() => app.close());
    const requests: ObservedRequest[] = [];
    app.server.on('request', (request) => {
      requests.push({
        method: request.method ?? '',
        path: (request.url ?? '').split('?')[0]!,
        origin: request.headers.origin,
      });
    });
    await app.listen({ host: '127.0.0.1', port });
    return {
      api,
      frontend,
      attacker,
      proxy,
      requests,
      cookieName: auth.cookieName,
      google,
      close: dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
export type BrowserFixture = Awaited<ReturnType<typeof browserFixture>>;

export async function launchLocalBrowser(proxy: string): Promise<Browser> {
  const executablePath = process.env.PHASSCODE_BROWSER_EXECUTABLE_PATH;
  const channel = process.env.PHASSCODE_BROWSER_CHANNEL;
  if (executablePath && channel)
    throw new Error('Configure o caminho do navegador ou seu canal, somente um deles.');
  if (channel && !['chromium', 'chrome', 'msedge'].includes(channel))
    throw new Error('PHASSCODE_BROWSER_CHANNEL deve ser chromium, chrome ou msedge.');
  let selectedPath = executablePath;
  if (selectedPath) {
    try {
      await access(selectedPath);
    } catch {
      throw new Error('O executável configurado do navegador não está disponível.');
    }
  } else if (!channel && process.platform === 'win32') {
    for (const candidate of [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ]) {
      try {
        await access(candidate);
        selectedPath = candidate;
        break;
      } catch {
        // Try the next installed browser, then Playwright-managed Chromium.
      }
    }
  }
  return chromium.launch({
    headless: true,
    timeout: 20000,
    proxy: { server: proxy },
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
    ],
    ...(selectedPath ? { executablePath: selectedPath } : {}),
    ...(channel ? { channel } : {}),
  });
}
