import type { Redis } from 'ioredis';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { createFallbackRedisIdentities } from '../apps/orbe-node/src/adapters/fallback-redis-identities.js';
import { createRedisFallbackInvocationFactory } from '../apps/orbe-node/src/adapters/fallback-llm.js';

const { invokeModel } = vi.hoisted(() => ({ invokeModel: vi.fn() }));
vi.mock('../apps/orbe-node/src/adapters/llm-model-factory.js', () => ({
  createFallbackModelFactory: ({ providers }: { providers: Array<{ id: string }> }) => ({
    bindTools: () => new Map(providers.map(({ id }) => [id, { invoke: invokeModel }])),
  }),
}));

const namespace = 'phasscode:llm:global';
const provider = {
  id: 'openrouter' as const,
  apiKey: 'synthetic-openrouter',
  model: 'test/model:free',
};
const identity = (overrides: Partial<typeof provider> = {}, budgetKey = namespace) =>
  createFallbackRedisIdentities(budgetKey, [{ ...provider, ...overrides }]);

beforeEach(() => {
  invokeModel.mockReset().mockResolvedValue(new AIMessage('Synthetic answer.'));
});

describe('identificadores Redis de recursos de fallback, sem autenticação', () => {
  it('preserva os identificadores publicados antes da refatoração sem renovar crédito Redis', () => {
    // Fixed compatibility fixture, rather than a second implementation of the hash.
    expect(identity()).toEqual({
      cooldownKeyPrefix: 'phasscode:llm:fb:efc5328ee3afcd8f8a9095cae5dd40d4:cool',
      providers: new Map([
        [
          'openrouter',
          {
            quotaKey:
              'phasscode:llm:fb:efc5328ee3afcd8f8a9095cae5dd40d4:quota:openrouter:91005ba66e509415fc3121dbead4a25a',
            cooldownId: 'openrouter-942804a2a446f5f3f6815af62a671904',
          },
        ],
      ]),
    });
  });

  it('compartilha os mesmos identificadores entre instâncias e independe da ordem da cadeia', () => {
    const replicaOne = identity();
    const replicaTwo = createFallbackRedisIdentities(namespace, [
      { id: 'gemini', apiKey: 'synthetic-gemini', model: 'test-gemini' },
      { ...provider },
    ]);
    expect(replicaTwo.cooldownKeyPrefix).toBe(replicaOne.cooldownKeyPrefix);
    expect(replicaTwo.providers.get(provider.id)).toEqual(replicaOne.providers.get(provider.id));
    expect(identity()).toEqual(replicaOne);
  });

  it('uma troca de modelo altera o cooldown sem conceder nova cota à credencial', () => {
    const before = identity().providers.get(provider.id)!;
    const after = identity({ model: 'test/other-model:free' }).providers.get(provider.id)!;
    expect(after.quotaKey).toBe(before.quotaKey);
    expect(after.cooldownId).not.toBe(before.cooldownId);
  });

  it('isola credenciais e não coloca chave nem modelo em texto simples nas keys', () => {
    const before = identity().providers.get(provider.id)!;
    const changed = identity({ apiKey: 'synthetic-rotated-key' }).providers.get(provider.id)!;
    expect(changed.quotaKey).not.toBe(before.quotaKey);
    expect(changed.cooldownId).not.toBe(before.cooldownId);
    for (const value of [...Object.values(before), ...Object.values(changed)]) {
      expect(value).not.toContain(provider.apiKey);
      expect(value).not.toContain('synthetic-rotated-key');
      expect(value).not.toContain(provider.model);
    }
  });

  it('isola provedores mesmo quando usam a mesma string de credencial e modelo', () => {
    const entries = createFallbackRedisIdentities(namespace, [
      provider,
      { ...provider, id: 'groq' },
    ]).providers;
    expect(entries.get('openrouter')!.quotaKey).not.toBe(entries.get('groq')!.quotaKey);
    expect(entries.get('openrouter')!.cooldownId).not.toBe(entries.get('groq')!.cooldownId);
  });

  it('isola namespaces e respeita os limites de tamanho dos adaptadores Redis', () => {
    const before = identity();
    const changed = identity({}, 'other:global:budget');
    expect(changed.cooldownKeyPrefix).not.toBe(before.cooldownKeyPrefix);
    expect(changed.providers.get(provider.id)!.quotaKey).not.toBe(
      before.providers.get(provider.id)!.quotaKey,
    );
    for (const id of ['openrouter', 'gemini', 'groq', 'cohere'] as const) {
      const result = createFallbackRedisIdentities('x'.repeat(120), [
        { ...provider, id, apiKey: 'k'.repeat(4096), model: 'm'.repeat(300) },
      ]);
      const keys = result.providers.get(id)!;
      expect(result.cooldownKeyPrefix).toMatch(/^[A-Za-z0-9:_-]{1,100}$/);
      expect(keys.quotaKey).toMatch(/^[A-Za-z0-9:_-]{1,120}$/);
      expect(keys.cooldownId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    }
  });
});

// A shared command double exercises the production factory's key wiring without
// touching a real Redis, credentials or provider. Atomic Lua behavior has its own
// disposable-Redis integration tests; this double does not claim to validate Lua.
function sharedRedis() {
  const counts = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const evalCommand = vi.fn(
    async (_script: string, _numberOfKeys: number, key: string, ...args: number[]) => {
      if (key.includes(':quota:')) {
        const count = counts.get(key) ?? 0;
        if (count >= args[0]!) return [0, 60];
        counts.set(key, count + 1);
        return [1, 60];
      }
      if (args.length === 1) return cooldowns.get(key) ?? 0;
      const duration = Math.max(cooldowns.get(key) ?? 0, args[0]!);
      cooldowns.set(key, duration);
      return duration;
    },
  );
  return { client: { eval: evalCommand } as unknown as Redis, counts, cooldowns };
}

function replicaConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    LLM_GLOBAL_MAX_CALLS: '20',
    LLM_FALLBACK_ENABLED: 'true',
    LLM_OPENROUTER_API_KEY: provider.apiKey,
    LLM_OPENROUTER_MODEL: provider.model,
    LLM_OPENROUTER_MAX_CALLS: '1',
    ...overrides,
  });
}
const messages = [new HumanMessage('Synthetic public question.')];
const signal = () => new AbortController().signal;

describe('fábricas Redis de réplicas mantêm os mesmos recursos', () => {
  it('nega nova tentativa em outra réplica ou modelo após esgotar a cota da credencial', async () => {
    const redis = sharedRedis();
    const globalBudget = { reserve: vi.fn(async () => undefined) };
    const first = createRedisFallbackInvocationFactory(replicaConfig(), redis.client, globalBudget);
    const second = createRedisFallbackInvocationFactory(
      replicaConfig({ LLM_OPENROUTER_MODEL: 'test/other-model:free' }),
      redis.client,
      globalBudget,
    );
    await expect(first([], signal())(messages)).resolves.toBeInstanceOf(AIMessage);
    await expect(second([], signal())(messages)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(invokeModel).toHaveBeenCalledOnce();
    expect(globalBudget.reserve).toHaveBeenCalledOnce();
    expect([...redis.counts.values()]).toEqual([1]);
    // Rotating credentials deliberately creates an isolated quota and route.
    const rotated = createRedisFallbackInvocationFactory(
      replicaConfig({ LLM_OPENROUTER_API_KEY: 'synthetic-rotated-key' }),
      redis.client,
      globalBudget,
    );
    await expect(rotated([], signal())(messages)).resolves.toBeInstanceOf(AIMessage);
    expect(invokeModel).toHaveBeenCalledTimes(2);
    expect([...redis.counts.values()]).toEqual([1, 1]);
  });

  it('impede a segunda réplica de sondar uma rota em cooldown sem consumir outra cota', async () => {
    const redis = sharedRedis();
    const globalBudget = { reserve: vi.fn(async () => undefined) };
    const config = replicaConfig({ LLM_OPENROUTER_MAX_CALLS: '10' });
    const first = createRedisFallbackInvocationFactory(config, redis.client, globalBudget);
    const second = createRedisFallbackInvocationFactory(config, redis.client, globalBudget);
    invokeModel.mockRejectedValueOnce(
      Object.assign(new Error('Synthetic rate limit.'), { status: 429 }),
    );
    await expect(first([], signal())(messages)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    await expect(second([], signal())(messages)).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(invokeModel).toHaveBeenCalledOnce();
    expect(globalBudget.reserve).toHaveBeenCalledOnce();
    expect([...redis.counts.values()]).toEqual([1]);
    const keys = identity();
    expect([...redis.cooldowns.keys()]).toEqual([
      `${keys.cooldownKeyPrefix}:${keys.providers.get(provider.id)!.cooldownId}`,
    ]);
  });
});
