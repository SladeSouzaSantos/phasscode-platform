import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { loadAuthConfig, type EnabledAuthConfig } from '../packages/shared-config/src/auth.js';
import { AuthService } from '../apps/orbe-node/src/auth/service.js';
import { AuthTokens } from '../apps/orbe-node/src/auth/jwt.js';
import { GoogleOidc } from '../apps/orbe-node/src/auth/google.js';
import { registerAuthRoutes } from '../apps/orbe-node/src/auth/routes.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';
import type {
  AuthStore,
  AuthSession,
  AuthUser,
  ExternalProfile,
  NewAuthSession,
  OAuthTransaction,
} from '../apps/orbe-node/src/auth/types.js';

export class MemoryAuthStore implements AuthStore {
  readonly users = new Map<string, AuthUser>();
  readonly identities = new Map<string, string>();
  readonly sessions = new Map<string, AuthSession>();
  readonly transactions = new Map<string, OAuthTransaction>();
  async saveTransaction(value: OAuthTransaction) {
    this.transactions.set(value.stateHash, value);
  }
  async consumeTransaction(stateHash: string, browserHash: string) {
    const transaction = this.transactions.get(stateHash);
    if (
      !transaction ||
      transaction.browserHash !== browserHash ||
      transaction.expiresAt.getTime() <= Date.now()
    )
      return;
    this.transactions.delete(stateHash);
    return transaction;
  }
  async findOrCreateUser(profile: ExternalProfile) {
    const key = `${profile.issuer}|${profile.subject}`;
    let id = this.identities.get(key);
    if (!id) {
      id = randomUUID();
      this.identities.set(key, id);
      this.users.set(id, {
        id,
        email: profile.email,
        displayName: profile.displayName,
        roles: ['user'],
        disabled: false,
      });
    }
    return this.users.get(id)!;
  }
  async insertSession(value: NewAuthSession) {
    this.sessions.set(value.id, { ...value, user: this.users.get(value.userId)!, revokedAt: null });
  }
  async sessionByHash(hash: string) {
    return [...this.sessions.values()].find((value) => value.tokenHash === hash);
  }
  async sessionById(id: string) {
    return this.sessions.get(id);
  }
  async rotateSession(
    oldId: string,
    value: NewAuthSession,
  ): Promise<'rotated' | 'reused' | 'expired'> {
    const old = this.sessions.get(oldId);
    if (!old || old.expiresAt.getTime() <= Date.now()) return 'expired';
    if (old.revokedAt) {
      await this.revokeFamily(old.familyId);
      return 'reused';
    }
    old.revokedAt = new Date();
    await this.insertSession(value);
    return 'rotated';
  }
  async revokeFamily(id: string) {
    for (const session of this.sessions.values())
      if (session.familyId === id) session.revokedAt ??= new Date();
  }
}

export async function fakeGoogle() {
  const key = await generateKeyPair('RS256', { extractable: true });
  const wrong = await generateKeyPair('RS256');
  const publicJwk = {
    ...(await exportJWK(key.publicKey)),
    kid: 'google-key',
    alg: 'RS256',
    use: 'sig',
  };
  const grants = new Map<
    string,
    { nonce: string; challenge: string; claims: Record<string, unknown>; wrongSignature: boolean }
  >();
  let issuer = '';
  let jwksRequests = 0;
  let tokenRequests = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/.well-known/openid-configuration')
      return response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        }),
      );
    if (request.url === '/jwks') {
      jwksRequests++;
      return response.end(JSON.stringify({ keys: [publicJwk] }));
    }
    if (request.url === '/token') {
      tokenRequests++;
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      const form = new URLSearchParams(body);
      const code = form.get('code') ?? '';
      const grant = grants.get(code);
      grants.delete(code);
      if (
        !grant ||
        form.get('client_id') !== 'test-client' ||
        form.get('client_secret') !== 'test-client-secret' ||
        createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url') !== grant.challenge
      ) {
        response.statusCode = 400;
        return response.end(JSON.stringify({ error: 'invalid_grant' }));
      }
      const now = Math.floor(Date.now() / 1000);
      const id_token = await new SignJWT({
        iss: issuer,
        aud: 'test-client',
        sub: 'google-alice',
        email: 'alice@example.test',
        email_verified: true,
        name: 'Alice',
        nonce: grant.nonce,
        iat: now,
        exp: now + 300,
        ...grant.claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'google-key' })
        .sign(grant.wrongSignature ? wrong.privateKey : key.privateKey);
      return response.end(
        JSON.stringify({
          access_token: 'google-access-never-persist',
          token_type: 'Bearer',
          expires_in: 300,
          id_token,
        }),
      );
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake server unavailable.');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    privatePem: await exportPKCS8(key.privateKey),
    key,
    get jwksRequests() {
      return jwksRequests;
    },
    get tokenRequests() {
      return tokenRequests;
    },
    authorize(location: string, claims: Record<string, unknown> = {}, wrongSignature = false) {
      const url = new URL(location);
      const code = randomUUID();
      grants.set(code, {
        nonce: url.searchParams.get('nonce')!,
        challenge: url.searchParams.get('code_challenge')!,
        claims,
        wrongSignature,
      });
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      callback.searchParams.set('code', code);
      return callback.pathname + callback.search;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
export type FakeGoogle = Awaited<ReturnType<typeof fakeGoogle>>;
export function authConfig(google: FakeGoogle, extra: NodeJS.ProcessEnv = {}): EnabledAuthConfig {
  return loadAuthConfig({
    NODE_ENV: 'test',
    PERSISTENCE: 'postgres',
    DATABASE_URL: 'postgresql://unused:unused@localhost/unused',
    AUTH_ENABLED: 'true',
    AUTH_PUBLIC_URL: 'http://localhost:3000',
    AUTH_FRONTEND_URL: 'http://localhost:5173/login-complete',
    AUTH_GOOGLE_CLIENT_ID: 'test-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AUTH_GOOGLE_ISSUER: google.issuer,
    AUTH_JWT_KEY_ID: 'platform-test-key',
    AUTH_JWT_PRIVATE_KEY: google.privatePem,
    AUTH_COOKIE_SECURE: 'false',
    ...extra,
  }) as EnabledAuthConfig;
}
export async function authApp(config: EnabledAuthConfig, store: AuthStore) {
  const service = new AuthService(
    config,
    store,
    new GoogleOidc(config),
    await AuthTokens.create(config),
  );
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    const status = error instanceof AppError ? error.status : 500;
    reply.code(status).send({
      error: {
        code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        message: error instanceof AppError ? error.message : 'Falha interna.',
        correlationId: request.id,
      },
    });
  });
  await registerAuthRoutes(app, service);
  app.get('/test-admin', (request) => service.requirePrincipal(request, { admin: true }));
  app.post('/test-admin', (request) =>
    service.requirePrincipal(request, { admin: true, csrf: true }),
  );
  await app.ready();
  return { app, service };
}
export function cookieValue(headers: string | string[] | undefined, name: string): string {
  const list = Array.isArray(headers) ? headers : [headers ?? ''];
  return list.find((value) => value.startsWith(`${name}=`))?.split(';')[0] ?? '';
}
export async function login(
  app: FastifyInstance,
  service: AuthService,
  google: FakeGoogle,
  claims: Record<string, unknown> = {},
  wrongSignature = false,
  remoteAddress?: string,
) {
  const address = remoteAddress ? { remoteAddress } : {};
  const start = await app.inject({ ...address, method: 'GET', url: '/api/v1/auth/login/google' });
  const transactionCookie = cookieValue(start.headers['set-cookie'], service.loginCookieName);
  const callbackUrl = google.authorize(start.headers.location!, claims, wrongSignature);
  const callback = await app.inject({
    ...address,
    method: 'GET',
    url: callbackUrl,
    headers: { cookie: transactionCookie },
  });
  const sessionCookie = cookieValue(callback.headers['set-cookie'], service.cookieName);
  const state = await app.inject({
    ...address,
    method: 'GET',
    url: '/api/v1/auth/session',
    headers: { cookie: sessionCookie },
  });
  return {
    start,
    callback,
    callbackUrl,
    transactionCookie,
    sessionCookie,
    state: state.json<{
      authenticated: boolean;
      csrfToken: string;
      user: { id: string; roles: string[] };
    }>(),
  };
}
