import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisLlmCooldownStore } from '../apps/orbe-node/src/adapters/redis-llm-cooldown.js';

if (!process.env.TEST_REDIS_URL)
  throw new Error('Use Redis descartável para a integração do cooldown LLM.');
const redis = new Redis(process.env.TEST_REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  commandTimeout: 3000,
});
redis.on('error', () => {
  /* No URLs, credentials or provider errors. */
});
const prefixes: string[] = [];
function fixture() {
  const prefix = `test:llm-cooldown:${randomUUID()}`;
  prefixes.push(prefix);
  return {
    prefix,
    store: new RedisLlmCooldownStore(redis, { keyPrefix: prefix, maxCooldownMs: 60000 }),
  };
}
beforeAll(async () => {
  await redis.connect();
});
afterAll(async () => {
  try {
    for (const prefix of prefixes) await redis.del(`${prefix}:primary`, `${prefix}:secondary`);
  } finally {
    await redis.quit();
  }
});

describe('cooldown com Redis descartável', () => {
  it('duas instâncias preservam TTL máximo entre bloqueios concorrentes sem encurtar janela', async () => {
    const { prefix, store: one } = fixture();
    const two = new RedisLlmCooldownStore(redis, { keyPrefix: prefix, maxCooldownMs: 60000 });
    await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        (index % 2 ? one : two).block('primary', 40000 + index * 100),
      ),
    );
    const remaining = await two.remainingMs('primary');
    expect(remaining).toBeGreaterThan(30000);
    expect(remaining).toBeLessThanOrEqual(41500);
    await one.block('primary', 1000);
    const after = await two.remainingMs('primary');
    expect(after).toBeGreaterThan(30000);
    expect(after).toBeLessThanOrEqual(remaining);
    expect(await redis.get(`${prefix}:primary`)).toBe('1');
    expect(await two.remainingMs('secondary')).toBe(0);
  });
  it('chave sem TTL falha fechado e permanece intacta', async () => {
    const { prefix, store } = fixture();
    await redis.set(`${prefix}:primary`, '1');
    await expect(store.remainingMs('primary')).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      status: 503,
    });
    await expect(store.block('primary', 1000)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      status: 503,
    });
    expect(await redis.pttl(`${prefix}:primary`)).toBe(-1);
    expect(await redis.get(`${prefix}:primary`)).toBe('1');
  });
  it('valor corrompido ou TTL maior que o configurado não vira crédito para sondar provedor', async () => {
    const { prefix, store } = fixture();
    await redis.set(`${prefix}:primary`, 'private-invalid-canary', 'PX', 40000);
    await expect(store.remainingMs('primary')).rejects.toMatchObject({ status: 503 });
    await expect(store.block('primary', 1000)).rejects.toMatchObject({ status: 503 });
    expect(await redis.get(`${prefix}:primary`)).toBe('private-invalid-canary');
    await redis.set(`${prefix}:secondary`, '1', 'PX', 120000);
    await expect(store.remainingMs('secondary')).rejects.toMatchObject({ status: 503 });
    await expect(store.block('secondary', 1000)).rejects.toMatchObject({ status: 503 });
    expect(await redis.pttl(`${prefix}:secondary`)).toBeGreaterThan(60000);
  });
  it('chave expirada libera o candidato e namespaces não compartilham cooldown', async () => {
    const { prefix, store } = fixture();
    const other = fixture();
    await store.block('primary', 40000);
    expect(await other.store.remainingMs('primary')).toBe(0);
    await redis.pexpire(`${prefix}:primary`, 0);
    expect(await store.remainingMs('primary')).toBe(0);
    await store.block('primary', 5000);
    expect(await store.remainingMs('primary')).toBeGreaterThan(0);
  });
});
