import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Redis } from 'ioredis';
import { HumanMessage } from '@langchain/core/messages';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import type { LlmFallbackProviderId } from '../packages/shared-config/src/llm-fallback.js';
import { createFallbackInvocationFactory } from '../apps/orbe-node/src/adapters/fallback-llm.js';
import { createFallbackModelFactory } from '../apps/orbe-node/src/adapters/llm-model-factory.js';
import { RedisLlmCallBudget } from '../apps/orbe-node/src/adapters/redis-llm-budget.js';
import { RedisLlmCooldownStore } from '../apps/orbe-node/src/adapters/redis-llm-cooldown.js';

if (!process.env.TEST_REDIS_URL)
  throw new Error('Defina TEST_REDIS_URL exclusivamente para Redis descartável de integração.');
const one = new Redis(process.env.TEST_REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  commandTimeout: 3000,
});
const two = one.duplicate({ lazyConnect: true });
for (const client of [one, two])
  client.on('error', () => {
    /* No credentials or driver payloads. */
  });
const keys: string[] = [];
const servers: Server[] = [];
beforeAll(async () => {
  await Promise.all([one.connect(), two.connect()]);
});
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});
afterAll(async () => {
  try {
    if (keys.length) await one.del(...keys);
  } finally {
    await Promise.all([one.quit(), two.quit()]);
  }
});

async function endpoint(status: number) {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>);
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify(
        status === 200
          ? {
              id: 'local-only',
              object: 'chat.completion',
              created: 1,
              model: 'synthetic-model',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Resposta pública controlada.' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }
          : { error: { message: 'synthetic-provider-rate-limit' } },
      ),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` };
}

function configFor(openrouterLimit = 10) {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    REDIS_URL: process.env.TEST_REDIS_URL,
    LLM_GLOBAL_MAX_CALLS: '3',
    LLM_GLOBAL_WINDOW_MS: '60000',
    LLM_FALLBACK_ENABLED: 'true',
    LLM_FALLBACK_COOLDOWN_MS: '60000',
    LLM_FALLBACK_MAX_COOLDOWN_MS: '120000',
    LLM_FALLBACK_ATTEMPT_TIMEOUT_MS: '2000',
    LLM_OPENROUTER_API_KEY: 'synthetic-openrouter',
    LLM_OPENROUTER_MODEL: 'test/model:free',
    LLM_OPENROUTER_MAX_CALLS: String(openrouterLimit),
    LLM_OPENROUTER_WINDOW_MS: '60000',
    LLM_GEMINI_API_KEY: 'synthetic-gemini',
    LLM_GEMINI_MODEL: 'gemini-2.5-test',
    LLM_GEMINI_MAX_CALLS: '10',
    LLM_GEMINI_WINDOW_MS: '60000',
  });
}
function factories(urls: Record<'openrouter' | 'gemini', string>, openrouterLimit = 10) {
  const config = configFor(openrouterLimit);
  if (!config.llmFallback.enabled) throw new Error('Fallback deve estar habilitado no fixture.');
  const fallback = config.llmFallback;
  const namespace = `test:llm-fb:${randomUUID()}`;
  const globalKey = `${namespace}:global`;
  const providerKeys = new Map<LlmFallbackProviderId, string>(
    fallback.providers.map(({ id }) => [id, `${namespace}:quota:${id}`]),
  );
  const cooldownPrefix = `${namespace}:cool`;
  keys.push(
    globalKey,
    ...providerKeys.values(),
    ...fallback.providers.map(({ id }) => `${cooldownPrefix}:${id}`),
  );
  const instances = [one, two].map((redis) => {
    const providerBudgets = new Map<LlmFallbackProviderId, RedisLlmCallBudget>(
      fallback.providers.map((provider) => [
        provider.id,
        new RedisLlmCallBudget(redis, {
          key: providerKeys.get(provider.id)!,
          maxCalls: provider.maxCalls,
          windowMs: provider.windowMs,
        }),
      ]),
    );
    const invoke = createFallbackInvocationFactory({
      config: fallback,
      models: createFallbackModelFactory(
        { providers: fallback.providers, maxOutputTokens: 200 },
        urls,
      ),
      globalBudget: new RedisLlmCallBudget(redis, { key: globalKey, maxCalls: 3, windowMs: 60000 }),
      providerBudgets,
      maxContextChars: config.CHAT_CONTEXT_CHARS,
      cooldownStore: new RedisLlmCooldownStore(redis, {
        keyPrefix: cooldownPrefix,
        maxCooldownMs: fallback.maxCooldownMs,
      }),
    });
    return { invoke, providerBudgets };
  });
  return { first: instances[0]!, second: instances[1]!, globalKey, providerKeys, cooldownPrefix };
}
const messages = () => [new HumanMessage('Quais projetos públicos usam React?')];
const signal = () => new AbortController().signal;

describe('fallback HTTP local com orçamento e cooldown Redis compartilhados', () => {
  it('duas instâncias compartilham cooldown e consomem só três tentativas globais antes de negar sem HTTP', async () => {
    const openrouter = await endpoint(429);
    const gemini = await endpoint(200);
    const fixture = factories({ openrouter: openrouter.url, gemini: gemini.url });
    const first = await fixture.first.invoke([], signal())(messages());
    expect(first.content).toBe('Resposta pública controlada.');
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([1, 1]);
    expect(await one.hget(fixture.globalKey, 'count')).toBe('2');
    expect(await two.pttl(`${fixture.cooldownPrefix}:openrouter`)).toBeGreaterThan(0);
    const second = await fixture.second.invoke([], signal())(messages());
    expect(second.content).toBe('Resposta pública controlada.');
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([1, 2]);
    expect(await two.hget(fixture.globalKey, 'count')).toBe('3');
    await expect(fixture.first.invoke([], signal())(messages())).rejects.toMatchObject({
      code: 'LLM_BUDGET_EXHAUSTED',
      status: 429,
    });
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([1, 2]);
    expect(await one.hget(fixture.globalKey, 'count')).toBe('3');
    expect(await one.hget(fixture.providerKeys.get('openrouter')!, 'count')).toBe('1');
    // Provider reservation precedes the global one and is deliberately not refunded.
    expect(await one.hget(fixture.providerKeys.get('gemini')!, 'count')).toBe('3');
  });
  it('quota Redis local esgotada pula OpenRouter antes de HTTP e preserva crédito global para Gemini', async () => {
    const openrouter = await endpoint(200);
    const gemini = await endpoint(200);
    const fixture = factories({ openrouter: openrouter.url, gemini: gemini.url }, 1);
    await fixture.first.providerBudgets.get('openrouter')!.reserve();
    expect(await two.hget(fixture.providerKeys.get('openrouter')!, 'count')).toBe('1');
    await fixture.second.invoke([], signal())(messages());
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([0, 1]);
    expect(await one.hget(fixture.globalKey, 'count')).toBe('1');
    expect(await one.pttl(`${fixture.cooldownPrefix}:openrouter`)).toBeGreaterThan(0);
    await fixture.first.invoke([], signal())(messages());
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([0, 2]);
    expect(await two.hget(fixture.globalKey, 'count')).toBe('2');
    expect(await two.hget(fixture.providerKeys.get('openrouter')!, 'count')).toBe('1');
    expect(await two.hget(fixture.providerKeys.get('gemini')!, 'count')).toBe('2');
  });
});
