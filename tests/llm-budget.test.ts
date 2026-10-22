import { describe, expect, it, vi } from 'vitest';
import { RedisLlmCallBudget } from '../apps/orbe-node/src/adapters/redis-llm-budget.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const options = { key: 'test:llm:budget', maxCalls: 12, windowMs: 120_000 };
const realEnvironment = {
  LLM_PROVIDER: 'openai',
  LLM_MODEL: 'test',
  LLM_API_KEY: 'test-only',
  REDIS_URL: 'redis://127.0.0.1:6379',
  LLM_GLOBAL_MAX_CALLS: '12',
};

describe('configuração do orçamento global de IA', () => {
  it('exige limite explícito e Redis para provedores reais, sem assumir cota gratuita', () => {
    expect(() => loadConfig({ ...realEnvironment, LLM_GLOBAL_MAX_CALLS: '' })).toThrow(
      'REDIS_URL e LLM_GLOBAL_MAX_CALLS',
    );
    expect(() => loadConfig({ ...realEnvironment, REDIS_URL: '' })).toThrow(
      'REDIS_URL e LLM_GLOBAL_MAX_CALLS',
    );
    const config = loadConfig(realEnvironment);
    expect(config.LLM_GLOBAL_MAX_CALLS).toBe(12);
    expect(config.LLM_GLOBAL_WINDOW_MS).toBe(86_400_000);
    expect(config.LLM_GLOBAL_BUDGET_KEY).toBe('phasscode:llm:global');
  });

  it('mantém mock independente de Redis e de orçamento', () => {
    const config = loadConfig({});
    expect(config.LLM_PROVIDER).toBe('mock');
    expect(config.REDIS_URL).toBeUndefined();
    expect(config.LLM_GLOBAL_MAX_CALLS).toBeUndefined();
  });

  it.each([
    { LLM_GLOBAL_MAX_CALLS: '0' },
    { LLM_GLOBAL_MAX_CALLS: '-1' },
    { LLM_GLOBAL_MAX_CALLS: '1.5' },
    { LLM_GLOBAL_MAX_CALLS: 'secret-not-a-limit' },
    { LLM_GLOBAL_WINDOW_MS: '999' },
    { LLM_GLOBAL_WINDOW_MS: '2678400001' },
    { LLM_GLOBAL_BUDGET_KEY: 'secret url?key=never-log' },
  ])('recusa limite, janela ou chave inválidos sem ecoar valores %#', (env) => {
    expect(() => loadConfig({ ...realEnvironment, ...env })).toThrow(
      'Configuração inválida: LLM_GLOBAL_',
    );
  });
});

describe('adaptador de orçamento Redis sem serviço externo', () => {
  it('reserva uma chamada usando uma única operação Redis e os parâmetros explícitos', async () => {
    const client = { eval: vi.fn(async () => [1, 120]) };
    await expect(new RedisLlmCallBudget(client, options).reserve()).resolves.toBeUndefined();
    expect(client.eval).toHaveBeenCalledOnce();
    expect(client.eval.mock.calls[0]?.slice(1)).toEqual([
      1,
      options.key,
      options.maxCalls,
      options.windowMs,
    ]);
  });

  it('retorna erro público 429 com o intervalo de repetição calculado no Redis', async () => {
    const client = { eval: vi.fn(async () => [0, 119]) };
    await expect(new RedisLlmCallBudget(client, options).reserve()).rejects.toMatchObject({
      code: 'LLM_BUDGET_EXHAUSTED',
      status: 429,
      retryAfterSeconds: 119,
    });
  });

  it('falha fechada sem expor mensagem do driver nem permitir execução', async () => {
    const client = {
      eval: vi.fn(async () => {
        throw new Error('secret-redis-driver');
      }),
    };
    const error = await new RedisLlmCallBudget(client, options)
      .reserve()
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'LLM_BUDGET_UNAVAILABLE', status: 503 });
    expect(String(error)).not.toContain('secret-redis-driver');
  });

  it('mantém estado Redis inválido como 503, sem retry, Retry-After ou nova reserva', async () => {
    const client = { eval: vi.fn(async () => [-1, 0]) };
    const error = await new RedisLlmCallBudget(client, options)
      .reserve()
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'LLM_BUDGET_UNAVAILABLE', status: 503 });
    expect(error).not.toHaveProperty('retryAfterSeconds', expect.any(Number));
    expect(client.eval).toHaveBeenCalledOnce();
  });

  it.each(
    [null, [], [1], [1, 1, 2], [2, 1], ['1', 1], [0, 0], [0, 121]].map((result) => ({
      result,
    })),
  )(
    'falha fechada diante de resultado Redis inválido ou política incompatível %#',
    async ({ result }) => {
      const client = { eval: vi.fn(async () => result) };
      await expect(new RedisLlmCallBudget(client, options).reserve()).rejects.toMatchObject({
        code: 'LLM_BUDGET_UNAVAILABLE',
        status: 503,
      });
    },
  );
});
