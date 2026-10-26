import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/** This module is excluded from the application's production build. */
export const OIDC_PLAN_COOKIE = 'e2e-oidc-plan';
export const OIDC_CONTROL_HEADER = 'x-e2e-control-key';
export const localOidcScenarios = [
  'admin',
  'denied',
  'cancel',
  'wrong-state',
  'wrong-nonce',
  'wrong-issuer',
  'wrong-audience',
  'wrong-signature',
  'wrong-pkce',
  'tampered-code',
  'unverified-email',
  'expired-token',
  'provider-error',
] as const;
export type LocalOidcScenario = (typeof localOidcScenarios)[number];
export interface LocalOidcOptions {
  host?: '127.0.0.1';
  port?: number;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  adminEmail: string;
  controlKey: string;
  clock?: () => number;
  codeTtlMs?: number;
}
interface AuthorizationPlan {
  scenario: LocalOidcScenario;
  subject: string;
  expiresAt: number;
}
interface AuthorizationGrant {
  plan: AuthorizationPlan;
  redirectUri: string;
  nonce: string;
  challenge: string;
  expiresAt: number;
}
export interface LocalOidcStats {
  discoveryRequests: number;
  jwksRequests: number;
  authorizationRequests: number;
  authorizationAccepted: number;
  tokenRequests: number;
  tokenAccepted: number;
  invalidPkce: number;
  invalidClient: number;
  invalidGrant: number;
  unplannedAuthorizations: number;
  scenarios: Partial<Record<LocalOidcScenario, number>>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const validProof = (value: string | null): value is string =>
  value !== null && /^[A-Za-z0-9_-]{43}$/.test(value);
const knownScenario = (value: unknown): value is LocalOidcScenario =>
  typeof value === 'string' && (localOidcScenarios as readonly string[]).includes(value);
function sameSecret(value: string | undefined, expected: string) {
  return (
    typeof value === 'string' &&
    timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(expected)))
  );
}
function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}
async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 8192) throw new Error('Invalid local OIDC request.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const single = (params: URLSearchParams, name: string) =>
  params.getAll(name).length === 1 ? params.get(name) : null;

/** A loopback-only provider for the disposable E2E runner; never a login shortcut. */
export async function startLocalOidcProvider(options: LocalOidcOptions) {
  if (options.host !== undefined && options.host !== '127.0.0.1')
    throw new Error('Local OIDC must bind to IPv4 loopback.');
  if (
    !options.clientId ||
    !options.clientSecret ||
    options.controlKey.length < 32 ||
    !options.redirectUris.length ||
    !/^[^\s@]+@[^\s@]+\.test$/.test(options.adminEmail)
  )
    throw new Error('Local OIDC requires explicit synthetic test configuration.');
  for (const value of options.redirectUris) {
    const uri = new URL(value);
    if (
      uri.protocol !== 'http:' ||
      uri.hostname !== '127.0.0.1' ||
      uri.username ||
      uri.password ||
      uri.hash ||
      uri.search
    )
      throw new Error('Local OIDC redirect URIs must use explicit HTTP loopback paths.');
  }
  const clock = options.clock ?? Date.now;
  const codeTtlMs = options.codeTtlMs ?? 120_000;
  if (!Number.isFinite(codeTtlMs) || codeTtlMs < 1 || codeTtlMs > 600_000)
    throw new Error('Invalid local OIDC grant lifetime.');
  const key = await generateKeyPair('RS256');
  const wrongKey = await generateKeyPair('RS256');
  const kid = `e2e-oidc-${randomUUID()}`;
  const jwk = { ...(await exportJWK(key.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const plans = new Map<string, AuthorizationPlan>();
  const grants = new Map<string, AuthorizationGrant>();
  const stats: LocalOidcStats = {
    discoveryRequests: 0,
    jwksRequests: 0,
    authorizationRequests: 0,
    authorizationAccepted: 0,
    tokenRequests: 0,
    tokenAccepted: 0,
    invalidPkce: 0,
    invalidClient: 0,
    invalidGrant: 0,
    unplannedAuthorizations: 0,
    scenarios: {},
  };
  let issuer = '';
  // HTTP routes are deliberately confined to this test-owned server.
  const server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-content-type-options', 'nosniff');
    void handle(request, response).catch(() => {
      if (!response.headersSent) send(response, 400, { error: 'invalid_request' });
      else response.end();
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', issuer);
    if (url.origin !== issuer) {
      send(response, 400, { error: 'invalid_request' });
      return;
    }
    for (const [id, plan] of plans) if (plan.expiresAt <= clock()) plans.delete(id);
    if (url.pathname.startsWith('/__control/')) {
      const supplied = request.headers[OIDC_CONTROL_HEADER];
      if (!sameSecret(typeof supplied === 'string' ? supplied : undefined, options.controlKey)) {
        send(response, 401, { error: 'control_unauthorized' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/__control/stats') {
        send(response, 200, {
          ...stats,
          scenarios: { ...stats.scenarios },
          pendingPlans: plans.size,
          pendingGrants: grants.size,
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/__control/authorization') {
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
          send(response, 415, { error: 'invalid_request' });
          return;
        }
        const input: unknown = JSON.parse(await readBody(request));
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          send(response, 400, { error: 'invalid_request' });
          return;
        }
        const data = input as Record<string, unknown>;
        if (
          !knownScenario(data.scenario) ||
          Object.keys(data).some((name) => !['scenario', 'subject'].includes(name)) ||
          (data.subject !== undefined &&
            (typeof data.subject !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(data.subject)))
        ) {
          send(response, 400, { error: 'invalid_request' });
          return;
        }
        const id = randomUUID();
        plans.set(id, {
          scenario: data.scenario,
          subject: typeof data.subject === 'string' ? data.subject : `synthetic-${randomUUID()}`,
          expiresAt: clock() + 600_000,
        });
        send(response, 201, { id });
        return;
      }
      send(response, 404, { error: 'not_found' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      stats.discoveryRequests++;
      send(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'email', 'profile'],
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/jwks') {
      stats.jwksRequests++;
      send(response, 200, { keys: [jwk] });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/authorize') {
      stats.authorizationRequests++;
      const params = url.searchParams;
      const redirectUri = single(params, 'redirect_uri');
      const state = single(params, 'state');
      const nonce = single(params, 'nonce');
      const challenge = single(params, 'code_challenge');
      if (
        single(params, 'client_id') !== options.clientId ||
        single(params, 'response_type') !== 'code' ||
        single(params, 'code_challenge_method') !== 'S256' ||
        !validProof(state) ||
        !validProof(nonce) ||
        !validProof(challenge) ||
        !redirectUri ||
        !options.redirectUris.includes(redirectUri) ||
        !single(params, 'scope')?.split(' ').includes('openid')
      ) {
        send(response, 400, { error: 'invalid_request' });
        return;
      }
      const rawId = request.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${OIDC_PLAN_COOKIE}=`))
        ?.slice(OIDC_PLAN_COOKIE.length + 1);
      const plan = rawId ? plans.get(rawId) : undefined;
      if (rawId) plans.delete(rawId);
      response.setHeader(
        'set-cookie',
        `${OIDC_PLAN_COOKIE}=; Path=/authorize; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
      if (!plan || plan.expiresAt <= clock()) {
        stats.unplannedAuthorizations++;
        send(response, 400, { error: 'authorization_plan_required' });
        return;
      }
      stats.authorizationAccepted++;
      stats.scenarios[plan.scenario] = (stats.scenarios[plan.scenario] ?? 0) + 1;
      const callback = new URL(redirectUri);
      callback.searchParams.set('state', plan.scenario === 'wrong-state' ? secret() : state);
      if (plan.scenario === 'cancel' || plan.scenario === 'provider-error') {
        callback.searchParams.set(
          'error',
          plan.scenario === 'cancel' ? 'access_denied' : 'temporarily_unavailable',
        );
      } else {
        const code = secret();
        grants.set(hash(code), {
          plan,
          redirectUri,
          nonce,
          challenge: plan.scenario === 'wrong-pkce' ? secret() : challenge,
          expiresAt: clock() + codeTtlMs,
        });
        callback.searchParams.set('code', plan.scenario === 'tampered-code' ? secret() : code);
      }
      response.statusCode = 302;
      response.setHeader('location', callback.href);
      response.end();
      return;
    }
    if (request.method === 'POST' && url.pathname === '/token') {
      stats.tokenRequests++;
      if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        send(response, 415, { error: 'invalid_request' });
        return;
      }
      const form = new URLSearchParams(await readBody(request));
      const suppliedSecret = single(form, 'client_secret');
      if (
        single(form, 'client_id') !== options.clientId ||
        !sameSecret(suppliedSecret ?? undefined, options.clientSecret)
      ) {
        stats.invalidClient++;
        send(response, 401, { error: 'invalid_client' });
        return;
      }
      const code = single(form, 'code');
      const grant = code ? grants.get(hash(code)) : undefined;
      // One authenticated exchange consumes the grant, including failed PKCE or
      // redirect binding. Credentials cannot be replayed after a rejected proof.
      if (code) grants.delete(hash(code));
      if (
        single(form, 'grant_type') !== 'authorization_code' ||
        !grant ||
        grant.expiresAt <= clock() ||
        single(form, 'redirect_uri') !== grant.redirectUri
      ) {
        stats.invalidGrant++;
        send(response, 400, { error: 'invalid_grant' });
        return;
      }
      const verifier = single(form, 'code_verifier');
      if (
        !verifier ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        createHash('sha256').update(verifier).digest('base64url') !== grant.challenge
      ) {
        stats.invalidPkce++;
        send(response, 400, { error: 'invalid_grant' });
        return;
      }
      const scenario = grant.plan.scenario;
      const now = Math.floor(clock() / 1000);
      const idToken = await new SignJWT({
        iss: scenario === 'wrong-issuer' ? `${issuer}/wrong-issuer` : issuer,
        aud: scenario === 'wrong-audience' ? 'wrong-test-client' : options.clientId,
        sub: grant.plan.subject,
        email: scenario === 'denied' ? 'denied@example.test' : options.adminEmail,
        email_verified: scenario !== 'unverified-email',
        name: 'Synthetic E2E identity',
        nonce: scenario === 'wrong-nonce' ? secret() : grant.nonce,
        iat: scenario === 'expired-token' ? now - 600 : now,
        exp: scenario === 'expired-token' ? now - 300 : now + 300,
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .sign(scenario === 'wrong-signature' ? wrongKey.privateKey : key.privateKey);
      stats.tokenAccepted++;
      send(response, 200, {
        access_token: secret(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      });
      return;
    }
    send(response, 404, { error: 'not_found' });
  }
  server.requestTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local OIDC listener unavailable.');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    async close() {
      plans.clear();
      grants.clear();
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    },
  };
}
