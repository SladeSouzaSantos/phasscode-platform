import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { PostgresConversationStore } from '../apps/orbe-node/src/adapters/postgres-store.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MockChatProvider } from '../apps/orbe-node/src/adapters/mock-provider.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import type { ChatProvider } from '../apps/orbe-node/src/domain/ports.js';
import { testApp } from './helpers.js';

// Execução explícita, sem skip silencioso. Use exclusivamente um banco de testes descartável.
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL)
  throw new Error('Defina TEST_DATABASE_URL e TEST_REDIS_URL para a suíte de integração.');
const pool = createPool(process.env.TEST_DATABASE_URL);
const redis = new Redis(process.env.TEST_REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
const prefix = randomUUID();
const ids: string[] = [];
beforeAll(async () => {
  await migrate(pool);
  await migrate(pool);
  await redis.connect();
});
afterAll(async () => {
  await pool.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [ids]);
  await pool.end();
  if (redis.status !== 'end') await redis.quit();
});
describe('PostgreSQL e Redis reais', () => {
  it('persiste histórico, protege token e limita mensagens', async () => {
    const service = new ChatService(
      new PostgresConversationStore(pool, 4),
      new MockChatProvider(),
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const first = await service.execute({ message: 'Projetos PHASSCODE' });
    ids.push(first.conversationId);
    for (let n = 0; n < 4; n++)
      await service.execute(
        { message: 'Projetos PHASSCODE', conversationId: first.conversationId },
        first.conversationToken,
      );
    const stored = await pool.query('SELECT token_hash FROM conversations WHERE id = $1', [
      first.conversationId,
    ]);
    expect(stored.rows[0].token_hash).not.toBe(first.conversationToken);
    expect(
      (
        await pool.query('SELECT id FROM conversation_messages WHERE conversation_id = $1', [
          first.conversationId,
        ])
      ).rowCount,
    ).toBe(4);
    await expect(
      service.execute({ message: 'oi', conversationId: first.conversationId }, 'a'.repeat(43)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('faz rollback completo em falha externa', async () => {
    const count = await pool.query('SELECT count(*)::int AS total FROM conversations');
    const service = new ChatService(
      new PostgresConversationStore(pool),
      {
        name: 'mock',
        generate: async () => {
          throw new Error('failure');
        },
      },
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    await expect(service.execute({ message: 'Projetos PHASSCODE' })).rejects.toMatchObject({
      status: 502,
    });
    expect(
      (await pool.query('SELECT count(*)::int AS total FROM conversations')).rows[0].total,
    ).toBe(count.rows[0].total);
  });
  it('bloqueia concorrência na mesma conversa com lock no banco', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let slow = false;
    const provider: ChatProvider = {
      name: 'mock',
      generate: async () => {
        if (slow) {
          started!();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return { answer: 'ok', sources: [] };
      },
    };
    const service = new ChatService(
      new PostgresConversationStore(pool),
      provider,
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const first = await service.execute({ message: 'Projetos PHASSCODE' });
    ids.push(first.conversationId);
    slow = true;
    const input = { message: 'Projetos PHASSCODE', conversationId: first.conversationId };
    const pending = service.execute(input, first.conversationToken);
    await entered;
    try {
      await expect(service.execute(input, 'a'.repeat(43))).rejects.toMatchObject({ status: 404 });
      await expect(service.execute(input, first.conversationToken)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      release!();
      await pending;
    }
  });
  it('faz rate limiting compartilhado em Redis entre duas instâncias HTTP', async () => {
    const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_MAX: '1' });
    // O prefixo de IP isola esta suíte sem FLUSHDB em um Redis compartilhado.
    const remoteAddress = `test-${prefix}`;
    const firstRedis = redis.duplicate({ lazyConnect: true });
    const secondRedis = redis.duplicate({ lazyConnect: true });
    await Promise.all([firstRedis.connect(), secondRedis.connect()]);
    const one = await testApp({ config, redis: firstRedis });
    const two = await testApp({ config, redis: secondRedis });
    try {
      const first = await one.inject({
        method: 'POST',
        url: '/api/v1/chat',
        remoteAddress,
        payload: { message: 'oi' },
      });
      expect(first.statusCode).toBe(200);
      const next = await two.inject({
        method: 'POST',
        url: '/api/v1/chat',
        remoteAddress,
        payload: { message: 'oi' },
      });
      expect(next.statusCode).toBe(429);
    } finally {
      await one.close();
      await two.close();
    }
  });
});
