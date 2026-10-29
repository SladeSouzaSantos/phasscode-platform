import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Redis } from 'ioredis';
import { chatRequestSchema, openApiDocument } from '../../../../packages/contracts/src/index.js';
import type { Config } from '../../../../packages/shared-config/src/index.js';
import type { ChatProvider, ConversationStore, KnowledgeRepository } from '../domain/ports.js';
import { ChatService } from '../application/chat.js';
import { AppError } from '../domain/errors.js';
import { AuthService } from '../auth/service.js';
import { registerAuthRoutes } from '../auth/routes.js';
import type { MeetingService } from '../meetings/service.js';
import { registerMeetingRoutes } from '../meetings/routes.js';

export interface AppOptions {
  config: Config;
  store: ConversationStore;
  knowledge: KnowledgeRepository;
  provider: ChatProvider;
  redis?: Redis;
  auth?: AuthService;
  meetings?: MeetingService;
  phase3Ready?: () => Promise<void>;
  publicOnly?: boolean;
}
export async function buildApp({
  config,
  store,
  knowledge,
  provider,
  redis,
  auth,
  meetings,
  phase3Ready,
  publicOnly = false,
}: AppOptions) {
  if (publicOnly && (config.auth.enabled || meetings))
    throw new Error('Orbe público não aceita autenticação ou reuniões.');
  if (config.auth.enabled && !auth) throw new Error('Autenticação habilitada sem serviço.');
  if (config.meetings.enabled && !meetings) throw new Error('Reuniões habilitadas sem serviço.');
  const app = Fastify({
    bodyLimit: 8192,
    requestTimeout: 120000,
    // O socket precisa aguardar a geração para receber a resposta ou o erro 504 da aplicação.
    connectionTimeout:
      Math.max(
        config.LLM_TIMEOUT_MS,
        config.auth.enabled ? 3 * config.auth.AUTH_HTTP_TIMEOUT_SECONDS * 1000 : 0,
        config.meetings.enabled ? 2 * config.calendar.GOOGLE_CALENDAR_HTTP_TIMEOUT_MS : 0,
      ) + 5000,
    trustProxy: config.trustedProxies.length ? config.trustedProxies : false,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-conversation-token"]',
                'req.headers["x-meeting-token"]',
                'req.headers["x-csrf-token"]',
                'res.headers["set-cookie"]',
                'body',
                'token',
                'apiKey',
              ],
              censor: '[REDACTED]',
            },
            serializers: { req: (req: { method: string }) => ({ method: req.method }) },
          },
  });
  const service = new ChatService(store, provider, knowledge, config, Boolean(meetings));
  await app.register(helmet);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Correlation-Id', request.id);
    reply.header('Cache-Control', 'no-store');
    if (request.headers.origin && !config.corsOrigins.includes(request.headers.origin)) {
      throw new AppError('ORIGIN_FORBIDDEN', 403, 'Origem não autorizada.');
    }
  });
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Conversation-Token',
      'X-CSRF-Token',
      'X-Meeting-Token',
      'Idempotency-Key',
      'Authorization',
      'X-Orbe-Capabilities',
    ],
    exposedHeaders: ['X-Correlation-Id', 'Retry-After'],
    credentials: config.auth.enabled,
  });
  await app.register(rateLimit, {
    global: false,
    // Mantém as chaves já usadas pelo limitador desta rota após envolver seu hook.
    nameSpace: 'fastify-rate-limit-POST/api/v1/chat-',
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    ...(redis ? { redis } : {}),
    skipOnError: false,
    errorResponseBuilder: () =>
      new AppError('RATE_LIMITED', 429, 'Muitas requisições. Aguarde antes de tentar novamente.'),
  });
  const limitChat = app.rateLimit();
  const limitPhase3 = app.rateLimit({
    keyGenerator: (request) => `phase3:${request.ip}`,
    max: 20,
    timeWindow: 60000,
  });
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (
      !/^\/api\/v1\/(?:auth\/|meetings\/|admin\/|me$)/.test(path) &&
      path !== '/.well-known/jwks.json'
    )
      return;
    try {
      await limitPhase3.call(app, request, reply);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'RATE_LIMIT_UNAVAILABLE',
        503,
        'O controle de requisições está indisponível. Tente novamente.',
        1,
      );
    }
  });
  if (!publicOnly) await app.register(swagger, {
    mode: 'static',
    specification: {
      path: resolve('packages/contracts/openapi.json'),
      baseDir: resolve('packages/contracts'),
    },
  });
  if (!publicOnly) await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true });
  app.setErrorHandler((error, request, reply) => {
    const httpStatus =
      typeof error === 'object' &&
      error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    const status =
      error instanceof AppError
        ? error.status
        : httpStatus >= 400 && httpStatus < 500
          ? httpStatus
          : 500;
    const code =
      error instanceof AppError
        ? error.code
        : ((
            {
              400: 'INVALID_REQUEST',
              413: 'PAYLOAD_TOO_LARGE',
              415: 'UNSUPPORTED_MEDIA_TYPE',
              429: 'RATE_LIMITED',
            } as Record<number, string>
          )[status] ?? 'INTERNAL_ERROR');
    const message =
      error instanceof AppError
        ? error.message
        : ((
            {
              400: 'Requisição inválida.',
              413: 'Corpo da requisição excede o limite.',
              415: 'Utilize Content-Type application/json.',
              429: 'Muitas requisições. Aguarde antes de tentar novamente.',
            } as Record<number, string>
          )[status] ?? 'Erro interno. Tente novamente mais tarde.');
    request.log.warn({ code, status, correlationId: request.id }, 'request_failed');
    if (
      error instanceof AppError &&
      Number.isSafeInteger(error.retryAfterSeconds) &&
      error.retryAfterSeconds! > 0
    ) {
      reply.header('Retry-After', error.retryAfterSeconds!);
    }
    reply.status(status).send({ error: { code, message, correlationId: request.id } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint não encontrado.',
        correlationId: request.id,
      },
    }),
  );
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    const checks = await Promise.allSettled([
      store.ready(),
      redis ? redis.ping() : Promise.resolve(),
      phase3Ready ? phase3Ready() : Promise.resolve(),
    ]);
    const ready = checks.every((check) => check.status === 'fulfilled');
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      persistence: config.PERSISTENCE,
      dependencies: {
        postgres:
          config.PERSISTENCE === 'postgres'
            ? checks[0]?.status === 'fulfilled'
              ? 'up'
              : 'down'
            : 'disabled',
        redis: redis ? (checks[1]?.status === 'fulfilled' ? 'up' : 'down') : 'disabled',
        ...(phase3Ready ? { phase3: checks[2]?.status === 'fulfilled' ? 'up' : 'down' } : {}),
      },
    });
  });
  const publicOpenApiDocument = publicOnly
    ? {
        ...openApiDocument,
        info: {
          ...openApiDocument.info,
          description: 'API pública do Orbe profissional: sem contas, reuniões ou notificações.',
        },
        components: { securitySchemes: {} },
        paths: {
          '/health': openApiDocument.paths['/health'],
          '/ready': openApiDocument.paths['/ready'],
          '/api/v1/chat': openApiDocument.paths['/api/v1/chat'],
          '/api/v1/openapi.json': openApiDocument.paths['/api/v1/openapi.json'],
        },
      }
    : openApiDocument;
  app.get('/api/v1/openapi.json', async () => publicOpenApiDocument);
  const authentication = auth ?? new AuthService({ enabled: false });
  // Public runtime has no login routes. Legacy route tests remain isolated behind enabled config.
  if (!publicOnly && config.auth.enabled) await registerAuthRoutes(app, authentication);
  if (!publicOnly && meetings) registerMeetingRoutes(app, { service: meetings, auth: authentication });
  app.post(
    '/api/v1/chat',
    {
      onRequest: async (request, reply) => {
        try {
          await limitChat.call(app, request, reply);
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(
            'RATE_LIMIT_UNAVAILABLE',
            503,
            'O controle de requisições está indisponível. Tente novamente.',
            1,
          );
        }
      },
    },
    async (request) => {
      const body = chatRequestSchema.safeParse(request.body);
      if (!body.success)
        throw new AppError(
          'INVALID_REQUEST',
          400,
          'Informe message (1–2000 caracteres) e conversationId UUID opcional. Campos extras não são aceitos.',
        );
      const token = request.headers['x-conversation-token'];
      if (token !== undefined && (typeof token !== 'string' || token.length > 128))
        throw new AppError('INVALID_REQUEST', 400, 'Token de conversa inválido.');
      const capabilities = request.headers['x-orbe-capabilities'];
      if (capabilities !== undefined && capabilities !== 'meetings-v1')
        throw new AppError('INVALID_REQUEST', 400, 'Capacidade do cliente não suportada.');
      return service.execute(body.data, token, { meetingActions: capabilities === 'meetings-v1' });
    },
  );
  app.addHook('onClose', async () => {
    await store.close();
    if (redis) await redis.quit().catch(() => redis.disconnect());
  });
  return app;
}
