import { readFile } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { loadConfig } from '../../../packages/shared-config/src/index.js';
import { createPool } from '../../../packages/database/src/pool.js';
import { JsonKnowledgeRepository } from './adapters/knowledge.js';
import { MemoryConversationStore } from './adapters/memory-store.js';
import { PostgresConversationStore } from './adapters/postgres-store.js';
import { PostgresConversationInsights } from './adapters/conversation-insights.js';
import { MockChatProvider } from './adapters/mock-provider.js';
import { LangChainChatProvider } from './adapters/langchain-provider.js';
import { RedisLlmCallBudget } from './adapters/redis-llm-budget.js';
import { createRedisFallbackInvocationFactory } from './adapters/fallback-llm.js';
import type { ChatProvider } from './domain/ports.js';
import { buildApp } from './http/app.js';
import { PROMPT_VERSION } from './application/chat.js';
import { AuthService } from './auth/service.js';
import { MeetingService } from './meetings/service.js';
import { PostgresMeetingStore } from './meetings/postgres-store.js';
import { createCalendar } from '../../../packages/integrations/src/calendar.js';

try {
  const config = loadConfig();
  const knowledge = await JsonKnowledgeRepository.load();
  const pool = config.PERSISTENCE === 'postgres' ? createPool(config.DATABASE_URL!) : undefined;
  const store =
    config.PERSISTENCE === 'memory'
      ? new MemoryConversationStore(
          config.CHAT_HISTORY_MESSAGES,
          config.CHAT_MAX_CONVERSATIONS,
          config.CHAT_RETENTION_DAYS,
        )
      : new PostgresConversationStore(
          pool!,
          config.CHAT_HISTORY_MESSAGES,
          config.CHAT_RETENTION_DAYS,
        );
  const redis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        commandTimeout: 3000,
        retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
      })
    : undefined;
  redis?.on('error', () => {
    /* Readiness reporta falhas sem registrar credenciais do driver. */
  });
  let provider: ChatProvider;
  let auth: AuthService;
  const meetings = config.meetings.enabled
    ? new MeetingService(
        config.meetings,
        new PostgresMeetingStore(pool!),
        createCalendar(config.calendar),
      )
    : undefined;
  const phase3Ready =
    config.auth.enabled || config.meetings.enabled
      ? async () => {
          const applied = await pool!.query(
            "SELECT name FROM schema_migrations WHERE name IN ('002_auth.sql','003_meetings.sql','004_notifications.sql','005_calendar_create_uncertainty.sql')",
          );
          if (applied.rowCount !== 4) throw new Error('Migrations da Fase 3 pendentes.');
          await pool!.query(
            'SELECT 1 FROM auth_users, meetings, meeting_outbox, notification_deliveries LIMIT 0',
          );
        }
      : undefined;
  try {
    await store.ready();
    if (redis) {
      await redis.connect();
      await redis.ping();
    }
    auth = await AuthService.create(config.auth, pool);
    if (phase3Ready) await phase3Ready();
    if (!config.llmFallback.enabled && config.LLM_PROVIDER === 'mock') {
      provider = new MockChatProvider();
    } else {
      const budget = new RedisLlmCallBudget(redis!, {
        key: config.LLM_GLOBAL_BUDGET_KEY,
        maxCalls: config.LLM_GLOBAL_MAX_CALLS!,
        windowMs: config.LLM_GLOBAL_WINDOW_MS,
      });
      const invocationFactory = config.llmFallback.enabled
        ? createRedisFallbackInvocationFactory(config, redis!, budget, (event) => {
            app.log.info({ llm: event }, 'Invocação LLM concluída.');
          })
        : undefined;
      provider = new LangChainChatProvider(
        config,
        knowledge,
        await readFile(`apps/orbe-node/prompts/${PROMPT_VERSION.replace('orbe-', '')}.md`, 'utf8'),
        budget,
        meetings,
        invocationFactory,
      );
    }
  } catch {
    await store.close();
    redis?.disconnect();
    throw new Error('Dependências indisponíveis ou migrations pendentes. Execute npm run migrate.');
  }
  const app = await buildApp({
    config,
    knowledge,
    provider,
    store,
    ...(redis ? { redis } : {}),
    auth,
    ...(config.auth.enabled && pool ? { insights: new PostgresConversationInsights(pool) } : {}),
    ...(meetings ? { meetings } : {}),
    ...(phase3Ready ? { phase3Ready } : {}),
  }).catch(async (error: unknown) => {
    await store.close();
    redis?.disconnect();
    throw error;
  });
  if (provider.name === 'mock')
    app.log.warn('Provedor MOCK ativo: respostas simuladas, sem chamada de IA.');
  if (config.PERSISTENCE === 'memory')
    app.log.warn(
      'Persistência em memória: conversas perdidas ao reiniciar. Apenas desenvolvimento.',
    );
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    await app.close();
    throw error;
  }
} catch {
  // Configuração e exceções de terceiros não devem vazar segredos no log.
  console.error(
    'Falha ao iniciar Orbe. Verifique configuração, base de conhecimento, migrations e dependências.',
  );
  process.exitCode = 1;
}
