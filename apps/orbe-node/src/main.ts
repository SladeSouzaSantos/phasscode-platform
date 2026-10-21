import { readFile } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { loadConfig } from '../../../packages/shared-config/src/index.js';
import { createPool } from '../../../packages/database/src/pool.js';
import { JsonKnowledgeRepository } from './adapters/knowledge.js';
import { MemoryConversationStore } from './adapters/memory-store.js';
import { PostgresConversationStore } from './adapters/postgres-store.js';
import { MockChatProvider } from './adapters/mock-provider.js';
import { LangChainChatProvider } from './adapters/langchain-provider.js';
import { buildApp } from './http/app.js';

try {
  const config = loadConfig();
  const knowledge = await JsonKnowledgeRepository.load();
  const provider =
    config.LLM_PROVIDER === 'mock'
      ? new MockChatProvider()
      : new LangChainChatProvider(
          config,
          knowledge,
          await readFile('apps/orbe-node/prompts/v1.md', 'utf8'),
        );
  const store =
    config.PERSISTENCE === 'memory'
      ? new MemoryConversationStore(
          config.CHAT_HISTORY_MESSAGES,
          config.CHAT_MAX_CONVERSATIONS,
          config.CHAT_RETENTION_DAYS,
        )
      : new PostgresConversationStore(
          createPool(config.DATABASE_URL!),
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
  try {
    await store.ready();
    if (redis) {
      await redis.connect();
      await redis.ping();
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
