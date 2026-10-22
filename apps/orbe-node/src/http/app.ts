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

export interface AppOptions {
  config: Config;
  store: ConversationStore;
  knowledge: KnowledgeRepository;
  provider: ChatProvider;
  redis?: Redis;
}
export async function buildApp({ config, store, knowledge, provider, redis }: AppOptions) {
  const app = Fastify({
    bodyLimit: 8192,
    requestTimeout: 65000,
    // O socket precisa aguardar a geração para receber a resposta ou o erro 504 da aplicação.
    connectionTimeout: config.LLM_TIMEOUT_MS + 5000,
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
                'body',
                'token',
                'apiKey',
              ],
              censor: '[REDACTED]',
            },
            serializers: { req: (req: { method: string }) => ({ method: req.method }) },
          },
  });
  const service = new ChatService(store, provider, knowledge, config);
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
    allowedHeaders: ['Content-Type', 'X-Conversation-Token'],
    exposedHeaders: ['X-Correlation-Id', 'Retry-After'],
    credentials: false,
  });
  await app.register(rateLimit, {
    global: false,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    ...(redis ? { redis } : {}),
    skipOnError: false,
  });
  await app.register(swagger, {
    mode: 'static',
    specification: {
      path: resolve('packages/contracts/openapi.json'),
      baseDir: resolve('packages/contracts'),
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs', staticCSP: true });
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
      },
    });
  });
  app.get('/api/v1/openapi.json', async () => openApiDocument);
  app.post(
    '/api/v1/chat',
    {
      config: {
        rateLimit: { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW_MS },
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
      return service.execute(body.data, token);
    },
  );
  app.addHook('onClose', async () => {
    await store.close();
    if (redis) await redis.quit().catch(() => redis.disconnect());
  });
  return app;
}
