import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../domain/errors.js';
import type { AuthService } from './service.js';
import { AuthCallbackError } from './callback-error.js';

function browserNavigation(request: FastifyRequest): boolean {
  const accepted = (request.headers.accept ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase());
  if (accepted.includes('application/json')) return false;
  return (
    request.headers['sec-fetch-mode'] === 'navigate' ||
    (request.headers['sec-fetch-mode'] === undefined && accepted.includes('text/html'))
  );
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
): Promise<void> {
  await app.register(cookie);
  app.get('/api/v1/auth/login/google', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const result = await service.beginLogin(request);
    reply.setCookie(service.loginCookieName, result.browserToken, {
      ...service.cookieOptions,
      maxAge: 600,
    });
    return reply.redirect(result.url);
  });
  app.get('/api/v1/auth/callback/google', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('referrer-policy', 'no-referrer');
    try {
      const result = await service.completeLogin(request);
      reply.clearCookie(service.loginCookieName, service.cookieOptions);
      reply.setCookie(service.cookieName, result.token, {
        ...service.cookieOptions,
        expires: result.expiresAt,
      });
      return reply.redirect(result.redirect);
    } catch (error) {
      if (service.config.enabled) {
        reply.clearCookie(service.loginCookieName, service.cookieOptions);
        // Only a validated identity denied by application policy may clear a
        // previous session. An unsolicited invalid callback must not log out
        // an already authenticated administrator without state/browser proof.
        if (error instanceof AppError && ['AUTH_ADMIN_ONLY', 'AUTH_REQUIRED'].includes(error.code))
          reply.clearCookie(service.cookieName, service.cookieOptions);
      }
      if (error instanceof AuthCallbackError && browserNavigation(request))
        return reply.code(303).redirect(error.redirect);
      throw error;
    }
  });
  app.get('/api/v1/auth/session', async (request, reply) => {
    const result = await service.session(request);
    if (service.config.enabled && !result.authenticated && request.cookies[service.cookieName])
      reply.clearCookie(service.cookieName, service.cookieOptions);
    return result;
  });
  const emptyBody = (body: unknown) => {
    if (
      body !== undefined &&
      (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
    )
      throw new AppError('INVALID_REQUEST', 400, 'Esta operação não aceita campos no corpo.');
  };
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    emptyBody(request.body);
    let result: Awaited<ReturnType<AuthService['refresh']>>;
    try {
      result = await service.refresh(request);
    } catch (error) {
      if (error instanceof AppError && error.code === 'AUTH_ADMIN_ONLY')
        reply.clearCookie(service.cookieName, service.cookieOptions);
      throw error;
    }
    reply.setCookie(service.cookieName, result.token, {
      ...service.cookieOptions,
      expires: result.expiresAt,
    });
    return service.session({
      ...request,
      cookies: { [service.cookieName]: result.token },
    } as typeof request);
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    emptyBody(request.body);
    await service.logout(request);
    reply.clearCookie(service.cookieName, service.cookieOptions);
    return reply.code(204).send();
  });
  app.get('/api/v1/me', (request) => service.me(request));
  app.get('/.well-known/jwks.json', () => service.jwks());
}
