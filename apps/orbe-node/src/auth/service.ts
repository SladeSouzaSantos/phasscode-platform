import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { AuthConfig, EnabledAuthConfig } from '../../../../packages/shared-config/src/auth.js';
import { AppError } from '../domain/errors.js';
import { GoogleOidc, type GoogleIdentityProvider } from './google.js';
import { AuthTokens } from './jwt.js';
import { PgAuthStore } from './postgres.js';
import type { AuthSession, AuthStore, NewAuthSession, Principal } from './types.js';

export const authHash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const validSecret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const unauthorized = () => new AppError('AUTH_REQUIRED', 401, 'Autenticação válida é necessária.');
export class AuthService {
  constructor(
    readonly config: AuthConfig,
    private readonly store?: AuthStore,
    private readonly provider?: GoogleIdentityProvider,
    private readonly tokens?: AuthTokens,
  ) {}
  static async create(config: AuthConfig, pool?: pg.Pool): Promise<AuthService> {
    if (!config.enabled) return new AuthService(config);
    if (!pool) throw new Error('Autenticação habilitada requer pool PostgreSQL.');
    return new AuthService(
      config,
      new PgAuthStore(pool),
      new GoogleOidc(config),
      await AuthTokens.create(config),
    );
  }
  private enabled(): EnabledAuthConfig {
    if (!this.config.enabled)
      throw new AppError('AUTH_DISABLED', 404, 'Autenticação não habilitada.');
    return this.config;
  }
  get cookieName(): string {
    return this.enabled().AUTH_COOKIE_SECURE ? '__Host-phasscode-session' : 'phasscode-session';
  }
  get loginCookieName(): string {
    return this.enabled().AUTH_COOKIE_SECURE ? '__Host-phasscode-login' : 'phasscode-login';
  }
  get cookieOptions() {
    return {
      httpOnly: true,
      secure: this.enabled().AUTH_COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    this.enabled();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_UNAVAILABLE', 503, 'Autenticação temporariamente indisponível.');
    }
  }
  private origin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (!origin || !this.enabled().allowedOrigins.includes(origin))
      throw new AppError('AUTH_CSRF', 403, 'Origem ou proteção CSRF inválida.');
  }
  private csrf(request: FastifyRequest, session: AuthSession): void {
    this.origin(request);
    const token = request.headers['x-csrf-token'];
    if (
      !validSecret(token) ||
      !timingSafeEqual(
        Buffer.from(authHash(token), 'hex'),
        Buffer.from(authHash(session.csrfToken), 'hex'),
      )
    )
      throw new AppError('AUTH_CSRF', 403, 'Origem ou proteção CSRF inválida.');
  }
  private active(session: AuthSession | undefined): session is AuthSession {
    return (
      !!session &&
      !session.revokedAt &&
      !session.user.disabled &&
      session.expiresAt.getTime() > Date.now() &&
      session.absoluteExpiresAt.getTime() > Date.now()
    );
  }
  private async cookieSession(request: FastifyRequest): Promise<AuthSession | undefined> {
    const value = request.cookies?.[this.cookieName];
    return validSecret(value) ? this.store!.sessionByHash(authHash(value)) : undefined;
  }
  async beginLogin(request: FastifyRequest) {
    return this.safe(async () => {
      if (request.headers.origin) this.origin(request);
      const state = secret(),
        nonce = secret(),
        verifier = secret(),
        browserToken = secret();
      const url = await this.provider!.authorizationUrl(state, nonce, verifier);
      await this.store!.saveTransaction({
        stateHash: authHash(state),
        browserHash: authHash(browserToken),
        nonce,
        verifier,
        expiresAt: new Date(Date.now() + 600_000),
      });
      return { url, browserToken };
    });
  }
  async completeLogin(request: FastifyRequest) {
    return this.safe(async () => {
      const query = new URLSearchParams(request.url.split('?')[1] ?? '');
      const state = query.get('state'),
        browser = request.cookies?.[this.loginCookieName];
      if (
        !validSecret(state) ||
        !validSecret(browser) ||
        query.getAll('state').length !== 1 ||
        query.getAll('code').length !== 1 ||
        query.has('error')
      )
        throw new AppError(
          'AUTH_LOGIN_FAILED',
          401,
          'Não foi possível validar o login. Inicie novamente.',
        );
      const transaction = await this.store!.consumeTransaction(authHash(state), authHash(browser));
      if (!transaction)
        throw new AppError(
          'AUTH_LOGIN_FAILED',
          401,
          'Não foi possível validar o login. Inicie novamente.',
        );
      const callback = new URL(this.enabled().callbackUrl);
      callback.search = query.toString();
      const user = await this.store!.findOrCreateUser(
        await this.provider!.exchange(callback, transaction, state),
      );
      if (user.disabled) throw unauthorized();
      const token = secret();
      const session = this.newSession(user.id, token);
      await this.store!.insertSession(session);
      return { token, expiresAt: session.expiresAt, redirect: this.enabled().AUTH_FRONTEND_URL };
    });
  }
  private newSession(userId: string, token: string, previous?: AuthSession): NewAuthSession {
    const config = this.enabled();
    const absoluteExpiresAt =
      previous?.absoluteExpiresAt ?? new Date(Date.now() + config.AUTH_SESSION_MAX_SECONDS * 1000);
    return {
      id: randomUUID(),
      userId,
      familyId: previous?.familyId ?? randomUUID(),
      tokenHash: authHash(token),
      csrfToken: secret(),
      expiresAt: new Date(
        Math.min(Date.now() + config.AUTH_SESSION_TTL_SECONDS * 1000, absoluteExpiresAt.getTime()),
      ),
      absoluteExpiresAt,
    };
  }
  async session(request: FastifyRequest) {
    return this.safe(async () => {
      const session = await this.cookieSession(request);
      return this.active(session)
        ? {
            authenticated: true,
            user: {
              id: session.user.id,
              email: session.user.email,
              displayName: session.user.displayName,
              roles: session.user.roles,
            },
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt.toISOString(),
          }
        : { authenticated: false, user: null, csrfToken: null, expiresAt: null };
    });
  }
  async refresh(request: FastifyRequest) {
    return this.safe(async () => {
      const previous = await this.cookieSession(request);
      if (!previous || previous.user.disabled) throw unauthorized();
      this.csrf(request, previous);
      const token = secret(),
        session = this.newSession(previous.userId, token, previous);
      const result = await this.store!.rotateSession(previous.id, session);
      if (result !== 'rotated') throw unauthorized();
      return { token, expiresAt: session.expiresAt };
    });
  }
  async logout(request: FastifyRequest): Promise<void> {
    return this.safe(async () => {
      const session = await this.cookieSession(request);
      if (!session) throw unauthorized();
      this.csrf(request, session);
      await this.store!.revokeFamily(session.familyId);
    });
  }
  async requirePrincipal(
    request: FastifyRequest,
    options: { admin?: boolean; csrf?: boolean } = {},
  ): Promise<Principal> {
    return this.safe(async () => {
      let session: AuthSession | undefined;
      const authorization = request.headers.authorization;
      if (authorization) {
        if (!authorization.startsWith('Bearer ') || authorization.length > 8192)
          throw unauthorized();
        const claims = await this.tokens!.verify(authorization.slice(7));
        session = await this.store!.sessionById(claims.sessionId);
        if (session?.userId !== claims.userId) throw unauthorized();
        if (options.csrf && request.headers.origin) this.origin(request);
      } else {
        session = await this.cookieSession(request);
        if (options.csrf && session) this.csrf(request, session);
      }
      if (!this.active(session)) throw unauthorized();
      if (options.admin && !session.user.roles.includes('admin'))
        throw new AppError('AUTH_FORBIDDEN', 403, 'Permissão administrativa necessária.');
      return { userId: session.userId, roles: session.user.roles, sessionId: session.id };
    });
  }
  async me(request: FastifyRequest) {
    return this.safe(async () => {
      const principal = await this.requirePrincipal(request);
      const session = await this.store!.sessionById(principal.sessionId);
      if (!this.active(session)) throw unauthorized();
      return {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        roles: session.user.roles,
      };
    });
  }
  /** Somente uso interno: o BFF pode encaminhar esse JWT à futura API Java; nunca retorná-lo ao navegador. */
  async issueAccessToken(request: FastifyRequest): Promise<string> {
    return this.safe(async () => {
      const principal = await this.requirePrincipal(request);
      const session = await this.store!.sessionById(principal.sessionId);
      if (!this.active(session)) throw unauthorized();
      return this.tokens!.issue(session);
    });
  }
  jwks() {
    this.enabled();
    return this.tokens!.jwks;
  }
}
export const createAuthService = AuthService.create;
