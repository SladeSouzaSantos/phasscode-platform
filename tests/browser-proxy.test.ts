import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalProxy } from './browser/local-proxy.js';

const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de teste indisponível.');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }),
  );
});

async function viaProxy(
  proxy: string,
  target: string,
  options: { method?: string; headers?: IncomingHttpHeaders; body?: string } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: '127.0.0.1',
        port: Number(new URL(proxy).port),
        path: target,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        agent: false,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.once('end', () =>
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body }),
        );
        response.once('error', reject);
      },
    );
    outgoing.once('error', reject);
    outgoing.end(options.body);
  });
}

describe('proxy HTTP restrito do navegador', () => {
  it('rejeita configurações fora do loopback HTTP explícito e copia a allowlist', async () => {
    for (const origin of [
      'http://localhost:8080',
      'https://127.0.0.1:8080',
      'http://127.0.0.1',
      'http://127.0.0.1:0',
      'http://127.0.0.1:65536',
      'http://127.0.0.1:8080/path',
      'http://user:secret@127.0.0.1:8080',
      'http://2130706433:8080',
    ])
      expect(() => createLocalProxy([origin]), origin).toThrow();
    expect(() => createLocalProxy([])).toThrow();
    expect(() => createLocalProxy(['http://127.0.0.1:80'])).not.toThrow();

    let forbiddenHits = 0;
    const forbidden = await listen(
      createServer((_request, response) => {
        forbiddenHits++;
        response.end('unexpected');
      }),
    );
    const origins = ['http://127.0.0.1:1'];
    const proxy = await listen(createLocalProxy(origins));
    origins.push(forbidden);
    expect((await viaProxy(proxy, forbidden)).status).toBe(403);
    expect(forbiddenHits).toBe(0);
  });

  it('preserva POST/OPTIONS, Origin, CSRF, cookies e corpo com Host confiável', async () => {
    const allowed = await listen(
      createServer((request, response) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => (body += chunk));
        request.on('end', () => {
          response.setHeader('access-control-allow-origin', request.headers.origin ?? '');
          response.setHeader('access-control-allow-credentials', 'true');
          response.setHeader('set-cookie', ['session=synthetic; HttpOnly; SameSite=Lax']);
          response.end(
            JSON.stringify({
              method: request.method,
              path: request.url,
              headers: request.headers,
              body,
            }),
          );
        });
      }),
    );
    const proxy = await listen(createLocalProxy([allowed]));
    for (const method of ['POST', 'OPTIONS']) {
      const result = await viaProxy(proxy, `${allowed}/api/v1/auth/refresh?synthetic=1`, {
        method,
        headers: {
          host: 'attacker.invalid',
          origin: 'http://127.0.0.1:3000',
          cookie: 'session=synthetic',
          'x-csrf-token': 'synthetic-csrf',
          'content-type': 'application/json',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-csrf-token',
          'proxy-authorization': 'Basic synthetic',
          'proxy-connection': 'keep-alive',
          connection: 'close, x-hop-secret',
          'x-hop-secret': 'synthetic-hop-header',
        },
        ...(method === 'POST' ? { body: '{"synthetic":true}' } : {}),
      });
      expect(result.status).toBe(200);
      const echoed = JSON.parse(result.body);
      expect(echoed.method).toBe(method);
      expect(echoed.path).toBe('/api/v1/auth/refresh?synthetic=1');
      expect(echoed.headers.host).toBe(new URL(allowed).host);
      expect(echoed.headers.origin).toBe('http://127.0.0.1:3000');
      expect(echoed.headers.cookie).toBe('session=synthetic');
      expect(echoed.headers['x-csrf-token']).toBe('synthetic-csrf');
      expect(echoed.headers['access-control-request-method']).toBe('POST');
      expect(echoed.headers['access-control-request-headers']).toBe('x-csrf-token');
      expect(echoed.headers['proxy-authorization']).toBeUndefined();
      expect(echoed.headers['proxy-connection']).toBeUndefined();
      expect(echoed.headers['x-hop-secret']).toBeUndefined();
      expect(echoed.body).toBe(method === 'POST' ? '{"synthetic":true}' : '');
      expect(result.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
      expect(result.headers['access-control-allow-credentials']).toBe('true');
      expect(result.headers['set-cookie']).toEqual(['session=synthetic; HttpOnly; SameSite=Lax']);
    }
  });

  it('bloqueia URLs arbitrárias, credenciais, protocolos e portas não autorizadas sem conexão', async () => {
    let allowedHits = 0;
    let forbiddenHits = 0;
    const allowed = await listen(
      createServer((_request, response) => {
        allowedHits++;
        response.end('allowed');
      }),
    );
    const forbidden = await listen(
      createServer((_request, response) => {
        forbiddenHits++;
        response.end('forbidden');
      }),
    );
    const proxy = await listen(createLocalProxy([allowed]));
    const port = new URL(allowed).port;
    for (const target of [
      forbidden,
      proxy,
      'http://127.0.0.1/',
      'http://127.0.0.1:80/',
      `http://localhost:${port}/`,
      `http://2130706433:${port}/`,
      `http://0x7f000001:${port}/`,
      `http://[::1]:${port}/`,
      `http://user:secret@127.0.0.1:${port}/`,
      `http://@127.0.0.1:${port}/`,
      `${allowed}/#fragment`,
      `https://127.0.0.1:${port}/`,
      `ftp://127.0.0.1:${port}/`,
      'http://169.254.169.254/latest/meta-data/',
      'http://example.invalid/',
      '/relative-path',
    ])
      expect((await viaProxy(proxy, target)).status, target).toBe(403);
    // Node's HTTP parser rejects this malformed authority before the handler.
    expect((await viaProxy(proxy, `${allowed}\\@attacker.invalid/`)).status).toBe(400);
    expect((await viaProxy(proxy, 'not-a-url')).status).toBe(400);
    expect(allowedHits).toBe(0);
    expect(forbiddenHits).toBe(0);
  });

  it('passa redirects locais OIDC sem segui-los e bloqueia Location não autorizada', async () => {
    let redirectedHits = 0;
    let forbiddenHits = 0;
    const redirected = await listen(
      createServer((_request, response) => {
        redirectedHits++;
        response.end('local callback');
      }),
    );
    const forbidden = await listen(
      createServer((_request, response) => {
        forbiddenHits++;
        response.end('forbidden callback');
      }),
    );
    let location = `${redirected}/api/v1/auth/callback/google?code=synthetic`;
    const issuer = await listen(
      createServer((_request, response) => response.writeHead(302, { location }).end()),
    );
    const proxy = await listen(createLocalProxy([issuer, redirected]));

    const first = await viaProxy(proxy, `${issuer}/authorize`);
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe(location);
    expect(redirectedHits).toBe(0);
    expect((await viaProxy(proxy, first.headers.location!)).body).toBe('local callback');
    expect(redirectedHits).toBe(1);

    location = '/local-next?state=synthetic';
    const relative = await viaProxy(proxy, `${issuer}/authorize`);
    expect(relative.status).toBe(302);
    expect(relative.headers.location).toBe(location);

    for (const rejected of [
      `${forbidden}/callback`,
      `//127.0.0.1:${new URL(forbidden).port}/callback`,
      'https://example.invalid/callback',
      'http://169.254.169.254/latest/meta-data/',
      `http://user:secret@127.0.0.1:${new URL(redirected).port}/callback`,
      `http://2130706433:${new URL(redirected).port}/callback`,
      `//localhost:${new URL(redirected).port}/callback`,
      `${redirected}/callback#fragment`,
      'javascript:alert(1)',
    ]) {
      location = rejected;
      const result = await viaProxy(proxy, `${issuer}/authorize`);
      expect(result.status, rejected).toBe(403);
      expect(result.headers.location).toBeUndefined();
    }
    expect(redirectedHits).toBe(1);
    expect(forbiddenHits).toBe(0);
  });

  it('nega CONNECT sem abrir um túnel para outro servidor local', async () => {
    let targetHits = 0;
    const target = await listen(
      createServer((_request, response) => {
        targetHits++;
        response.end('unexpected tunnel');
      }),
    );
    const proxy = await listen(createLocalProxy([target]));
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect({ host: '127.0.0.1', port: Number(new URL(proxy).port) });
      let received = '';
      socket.setEncoding('utf8');
      socket.once('error', reject);
      socket.on('data', (chunk: string) => (received += chunk));
      socket.once('end', () => resolve(received));
      socket.once('connect', () =>
        socket.write(`CONNECT ${new URL(target).host} HTTP/1.1\r\nHost: example.invalid\r\n\r\n`),
      );
    });
    expect(response).toContain('HTTP/1.1 403 Forbidden');
    expect(targetHits).toBe(0);
  });
});
