import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { RedisLlmCallBudget } from '../apps/orbe-node/src/adapters/redis-llm-budget.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

// Somente o Redis descartável da suíte explícita. Nunca limpa o banco inteiro.
if (!process.env.TEST_REDIS_URL)
  throw new Error('Defina TEST_REDIS_URL para testar o orçamento Redis.');
const one = new Redis(process.env.TEST_REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
});
const two = one.duplicate({ lazyConnect: true });
const keys: string[] = [];
const key = () => {
  const value = `test:llm:${randomUUID()}`;
  keys.push(value);
  return value;
};
beforeAll(async () => {
  await Promise.all([one.connect(), two.connect()]);
});
afterAll(async () => {
  if (keys.length) await one.del(...keys);
  await Promise.all([one.quit(), two.quit()]);
});

describe('orçamento global com Redis real e duas instâncias', () => {
  it('limita chamadas HTTP efetivas de dois providers, usando somente um servidor LLM simulado', async () => {
    let calls = 0;
    const server = createServer((request, response) => {
      request.resume();
      calls += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          id: `call_${calls}`,
          object: 'chat.completion',
          created: 1,
          model: 'test',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Resposta pública sobre o portfólio.' },
              finish_reason: 'stop',
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const options = { key: key(), maxCalls: 3, windowMs: 60_000 };
      const config = loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_API_MODE: 'chat-completions',
        LLM_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
        REDIS_URL: process.env.TEST_REDIS_URL,
        LLM_GLOBAL_MAX_CALLS: '3',
      });
      const knowledge = await JsonKnowledgeRepository.load();
      const first = new LangChainChatProvider(
        config,
        knowledge,
        'Use apenas os fatos públicos.',
        new RedisLlmCallBudget(one, options),
      );
      const second = new LangChainChatProvider(
        config,
        knowledge,
        'Use apenas os fatos públicos.',
        new RedisLlmCallBudget(two, options),
      );
      const outcomes = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          (index % 2 ? first : second).generate({
            message: 'Projetos React do portfólio',
            history: [],
            documents: knowledge.search('React'),
            signal: new AbortController().signal,
          }),
        ),
      );
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(3);
      expect(calls).toBe(3);
      for (const outcome of outcomes)
        if (outcome.status === 'rejected') {
          expect(outcome.reason).toMatchObject({ code: 'LLM_BUDGET_EXHAUSTED', status: 429 });
        }
      expect(await one.hget(options.key, 'count')).toBe('3');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('admite exatamente o limite sob concorrência entre instâncias independentes', async () => {
    const options = { key: key(), maxCalls: 11, windowMs: 60_000 };
    const first = new RedisLlmCallBudget(one, options);
    const second = new RedisLlmCallBudget(two, options);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 80 }, (_, index) => (index % 2 ? first : second).reserve()),
    );
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(11);
    const denied = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(denied).toHaveLength(69);
    for (const outcome of denied)
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toMatchObject({ code: 'LLM_BUDGET_EXHAUSTED', status: 429 });
        expect(outcome.reason.retryAfterSeconds).toBeGreaterThan(0);
      }
    expect(await one.hget(options.key, 'count')).toBe('11');
    expect(await one.pttl(options.key)).toBeGreaterThan(0);
  });

  it('não estende a janela em recusas e renova o limite apenas depois da expiração', async () => {
    const options = { key: key(), maxCalls: 1, windowMs: 1000 };
    const budget = new RedisLlmCallBudget(one, options);
    await budget.reserve();
    const before = await one.pttl(options.key);
    await expect(budget.reserve()).rejects.toMatchObject({
      code: 'LLM_BUDGET_EXHAUSTED',
      retryAfterSeconds: 1,
    });
    const after = await one.pttl(options.key);
    expect(after).toBeLessThanOrEqual(before);
    expect(await one.hget(options.key, 'count')).toBe('1');
    await delay(Math.max(0, after) + 30);
    await expect(budget.reserve()).resolves.toBeUndefined();
    expect(await one.hget(options.key, 'count')).toBe('1');
  });

  it('recusa política divergente na mesma chave sem aumentar o limite em uso', async () => {
    const options = { key: key(), maxCalls: 1, windowMs: 60_000 };
    await new RedisLlmCallBudget(one, options).reserve();
    await expect(
      new RedisLlmCallBudget(two, { ...options, maxCalls: 2 }).reserve(),
    ).rejects.toMatchObject({ code: 'LLM_BUDGET_UNAVAILABLE', status: 503 });
    await expect(
      new RedisLlmCallBudget(two, { ...options, windowMs: 120_000 }).reserve(),
    ).rejects.toMatchObject({ code: 'LLM_BUDGET_UNAVAILABLE', status: 503 });
    expect(await one.hget(options.key, 'count')).toBe('1');
  });

  it('recusa estado Redis corrompido sem criar nova janela ou crédito', async () => {
    const options = { key: key(), maxCalls: 1, windowMs: 60_000 };
    await one.hset(options.key, 'count', 'secret-bad-state');
    await expect(new RedisLlmCallBudget(one, options).reserve()).rejects.toMatchObject({
      code: 'LLM_BUDGET_UNAVAILABLE',
      status: 503,
    });
    expect(await one.hget(options.key, 'count')).toBe('secret-bad-state');
  });

  it.each([
    'past-reset',
    'missing-ttl',
    'mismatched-ttl',
    'fractional-reset',
    'zero-count',
    'future-reset',
  ])(
    'rejeita corrupção %s de uma janela existente sem reparar, incrementar ou renovar',
    async (corruption) => {
      const options = { key: key(), maxCalls: 2, windowMs: 60_000 };
      const budget = new RedisLlmCallBudget(one, options);
      await budget.reserve();
      const resetAt = Number(await one.hget(options.key, 'resetAt'));
      if (corruption === 'past-reset') await one.hset(options.key, 'resetAt', resetAt - 120_000);
      else if (corruption === 'missing-ttl') await one.persist(options.key);
      else if (corruption === 'mismatched-ttl') await one.pexpireat(options.key, resetAt + 1000);
      else if (corruption === 'fractional-reset')
        await one.hset(options.key, 'resetAt', resetAt + 0.5);
      else if (corruption === 'zero-count') await one.hset(options.key, 'count', 0);
      else {
        await one.hset(options.key, 'resetAt', resetAt + 120_000);
        await one.pexpireat(options.key, resetAt + 120_000);
      }
      const state = await one.hgetall(options.key);
      const expiration = await one.pexpiretime(options.key);
      await expect(budget.reserve()).rejects.toMatchObject({
        code: 'LLM_BUDGET_UNAVAILABLE',
        status: 503,
      });
      expect(await one.hgetall(options.key)).toEqual(state);
      expect(await one.pexpiretime(options.key)).toBe(expiration);
    },
  );

  it('falha fechada quando o cliente Redis está desconectado', async () => {
    const disconnected = one.duplicate({ lazyConnect: true, enableOfflineQueue: false });
    disconnected.disconnect();
    await expect(
      new RedisLlmCallBudget(disconnected, { key: key(), maxCalls: 1, windowMs: 1000 }).reserve(),
    ).rejects.toMatchObject({ code: 'LLM_BUDGET_UNAVAILABLE', status: 503 });
  });
});
