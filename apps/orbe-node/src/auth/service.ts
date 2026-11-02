import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { AuthConfig, EnabledAuthConfig } from '../../../../packages/shared-config/src/auth.js';
import { AppError } from '../domain/errors.js';
import { GoogleOidc, type GoogleIdentityProvider } from './google.js';
import { AuthTokens } from './jwt.js';
import { AuthCallbackError } from './callback-error.js';
import {
  decodeLoginBrowserCookie,
  encodeLoginBrowserCookie,
  loginErrorReturnUrl,
  resolveLoginReturnUrl,
} from './login-navigation.js';
import { PgAuthStore } from './postgres.js';
import type { AuthSession, AuthStore, AuthUser, NewAuthSession, Principal } from './types.js';

export const authHash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const validSecret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const unauthorized = () => new AppError('AUTH_REQUIRED', 401, 'Autenticação válida é necessária.');
const adminOnly = () =>
  new AppError('AUTH_ADMIN_ONLY', 403, 'Acesso negado. Apenas o administrador tem acesso.');
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
  private approvedEmail(email: string | null): boolean {
    return email?.trim().toLowerCase() === this.enabled().AUTH_ADMIN_EMAIL;
  }
  private approvedAdministrator(user: AuthUser): boolean {
    return this.approvedEmail(user.email) && user.roles.includes('admin');
  }
  private requireAdministrator(user: AuthUser): void {
    if (!this.approvedAdministrator(user)) throw adminOnly();
  }
  private async cookieSession(request: FastifyRequest): Promise<AuthSession | undefined> {
    const value = request.cookies?.[this.cookieName];
    return validSecret(value) ? this.store!.sessionByHash(authHash(value)) : undefined;
  }
  private async bearerSession(request: FastifyRequest): Promise<AuthSession | undefined> {
    const authorization = request.headers.authorization;
    // Absence of a bearer credential never authorizes a request. The final
    // requirePrincipal guard accepts only an active server-backed session.
    if (authorization === undefined) return undefined;
    if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw unauthorized();
    const claims = await this.tokens!.verify(authorization.slice(7));
    const session = await this.store!.sessionById(claims.sessionId);
    if (session?.userId !== claims.userId) throw unauthorized();
    return session;
  }
  async beginLogin(request: FastifyRequest) {
    return this.safe(async () => {
      if (request.headers.origin) this.origin(request);
      const query = new URLSearchParams(request.url.split('?')[1] ?? '');
      if (query.getAll('returnTo').length > 1)
        throw new AppError('INVALID_REQUEST', 400, 'Destino de retorno inválido.');
      const returnTo = query.get('returnTo') ?? undefined;
      resolveLoginReturnUrl(this.enabled().AUTH_FRONTEND_URL, returnTo);
      const state = secret(),
        nonce = secret(),
        verifier = secret(),
        browserToken = encodeLoginBrowserCookie(secret(), returnTo);
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
      const decodedBrowser = decodeLoginBrowserCookie(browser);
      const codeResponse = query.getAll('code').length === 1 && !query.has('error');
      const errorResponse = query.getAll('error').length === 1 && !query.has('code');
      if (
        !validSecret(state) ||
        typeof browser !== 'string' ||
        !decodedBrowser ||
        query.getAll('state').length !== 1 ||
        (!codeResponse && !errorResponse)
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
      // The stored hash covers the complete cookie, including returnTo. Do not
      // use decoded metadata until state and this exact cookie are validated.
      const redirect = resolveLoginReturnUrl(
        this.enabled().AUTH_FRONTEND_URL,
        decodedBrowser.returnTo,
      );
      try {
        if (errorResponse)
          throw new AppError(
            'AUTH_LOGIN_FAILED',
            401,
            'Não foi possível validar o login. Inicie novamente.',
          );
        const callback = new URL(this.enabled().callbackUrl);
        callback.search = query.toString();
        // The provider validates issuer, signature, audience, PKCE/state/nonce and
        // email_verified before admission. Reject other accounts before creating
        // a user, identity or session; query/body fields never grant access.
        const profile = await this.provider!.exchange(callback, transaction, state);
        if (!this.approvedEmail(profile.email)) throw adminOnly();
        const user = await this.store!.findOrCreateUser(profile, { bootstrapAdmin: true });
        if (user.disabled) throw unauthorized();
        this.requireAdministrator(user);
        const token = secret();
        const session = this.newSession(user.id, token);
        await this.store!.insertSession(session);
        return { token, expiresAt: session.expiresAt, redirect };
      } catch (error) {
        const failure =
          error instanceof AppError
            ? error
            : new AppError('AUTH_UNAVAILABLE', 503, 'Autenticação temporariamente indisponível.');
        throw new AuthCallbackError(failure, loginErrorReturnUrl(redirect, failure.code));
      }
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
      return this.active(session) && this.approvedAdministrator(session.user)
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
      this.requireAdministrator(previous.user);
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
      if (options.csrf) {
        // Routes with side effects require the opaque browser cookie AND its CSRF proof.
        // A caller-controlled Authorization header must never switch off either check.
        session = await this.cookieSession(request);
        if (!this.active(session)) throw unauthorized();
        this.csrf(request, session);
      } else {
        // Validate both independent credential types before choosing an identity.
        // A raw Authorization header must not decide whether authentication
        // or the final server-backed session check is performed.
        const [cookie, bearer] = await Promise.all([
          this.cookieSession(request),
          this.bearerSession(request),
        ]);
        session = bearer ?? cookie;
      }
      if (!this.active(session)) throw unauthorized();
      this.requireAdministrator(session.user);
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
      this.requireAdministrator(session.user);
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
      this.requireAdministrator(session.user);
      return this.tokens!.issue(session);
    });
  }
  jwks() {
    this.enabled();
    return this.tokens!.jwks;
  }
}
export const createAuthService = AuthService.create;
