import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../domain/errors.js';
import type { AuthService } from './service.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
): Promise<void> {
  await app.register(cookie);
  app.get('/api/v1/auth/login/google', async (request, reply) => {
    const result = await service.beginLogin(request);
    reply.setCookie(service.loginCookieName, result.browserToken, {
      ...service.cookieOptions,
      maxAge: 600,
    });
    return reply.redirect(result.url);
  });
  app.get('/api/v1/auth/callback/google', async (request, reply) => {
    try {
      const result = await service.completeLogin(request);
      reply.clearCookie(service.loginCookieName, service.cookieOptions);
      reply.setCookie(service.cookieName, result.token, {
        ...service.cookieOptions,
        expires: result.expiresAt,
      });
      return reply.redirect(result.redirect);
    } catch (error) {
      if (service.config.enabled) reply.clearCookie(service.loginCookieName, service.cookieOptions);
      throw error;
    }
  });
  app.get('/api/v1/auth/session', (request) => service.session(request));
  const emptyBody = (body: unknown) => {
    if (
      body !== undefined &&
      (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
    )
      throw new AppError('INVALID_REQUEST', 400, 'Esta operação não aceita campos no corpo.');
  };
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    emptyBody(request.body);
    const result = await service.refresh(request);
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
