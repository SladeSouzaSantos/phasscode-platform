import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LlmInvocationController,
  classifyLlmInvocationFailure,
  llmRetryAfterMs,
  type LlmCooldownStore,
} from '../apps/orbe-node/src/adapters/llm-invocation-controller.js';
import { RedisLlmCooldownStore } from '../apps/orbe-node/src/adapters/redis-llm-cooldown.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';

class MemoryCooldown implements LlmCooldownStore {
  now = 100000;
  readonly deadlines = new Map<string, number>();
  async remainingMs(id: string) {
    return Math.max(0, (this.deadlines.get(id) ?? 0) - this.now);
  }
  async block(id: string, durationMs: number) {
    this.deadlines.set(id, Math.max(this.deadlines.get(id) ?? 0, this.now + durationMs));
  }
}
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});
async function httpProviders(
  handler: (id: string, request: number) => { status: number; retryAfter?: string; hang?: boolean },
) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const id = request.url!.slice(1);
    requests.push(id);
    const result = handler(id, requests.length);
    if (result.hang) return;
    response.writeHead(result.status, {
      'Content-Type': 'application/json',
      ...(result.retryAfter ? { 'Retry-After': result.retryAfter } : {}),
    });
    response.end(
      JSON.stringify(result.status === 200 ? { id } : { error: 'private-upstream-body-canary' }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const invoke = vi.fn(async (id: string, signal: AbortSignal) => {
    const response = await fetch(`${origin}/${id}`, { signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error('private-upstream-message-canary'), {
        status: response.status,
        headers: response.headers,
      });
    }
    return response.json() as Promise<{ id: string }>;
  });
  return { requests, invoke };
}
function setup(ids = ['primary', 'secondary'], timeoutMs = 1000) {
  const store = new MemoryCooldown();
  const controller = new LlmInvocationController({
    candidates: ids.map((id) => ({ id, timeoutMs })),
    cooldownMs: 100,
    maxCooldownMs: 5000,
    maxAttemptsPerTurn: 6,
    cooldownStore: store,
  });
  const beforeAttempt = vi.fn(async () => ({ allowed: true }));
  return { controller, store, beforeAttempt };
}

describe('fallback por invocação e limites do turno', () => {
  it('429 local HTTP usa fallback e respeita Retry-After entre novos turnos', async () => {
    const upstream = await httpProviders((id) =>
      id === 'primary' ? { status: 429, retryAfter: '2' } : { status: 200 },
    );
    const { controller, store, beforeAttempt } = setup();
    const result = await controller
      .createTurn(new AbortController().signal)
      .run({ beforeAttempt, invoke: upstream.invoke });
    expect(result).toEqual({
      value: { id: 'secondary' },
      candidateId: 'secondary',
      attempts: 2,
      fallbackUsed: true,
    });
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
    expect(await store.remainingMs('primary')).toBe(2000);
    const next = await controller
      .createTurn(new AbortController().signal)
      .run({ beforeAttempt, invoke: upstream.invoke });
    expect(next.attempts).toBe(1);
    expect(upstream.requests).toEqual(['primary', 'secondary', 'secondary']);
    expect(JSON.stringify(result)).not.toContain('private-upstream');
  });
  it('preserva cursor monotônico entre rodadas, mas novo turno volta ao primário após cooldown', async () => {
    let first = true;
    const upstream = await httpProviders((id) => {
      if (id === 'primary' && first) {
        first = false;
        return { status: 503 };
      }
      return { status: 200 };
    });
    const { controller, store, beforeAttempt } = setup();
    const turn = controller.createTurn(new AbortController().signal);
    await turn.run({ beforeAttempt, invoke: upstream.invoke });
    store.now += 1000;
    expect((await turn.run({ beforeAttempt, invoke: upstream.invoke })).candidateId).toBe(
      'secondary',
    );
    expect(
      (
        await controller
          .createTurn(new AbortController().signal)
          .run({ beforeAttempt, invoke: upstream.invoke })
      ).candidateId,
    ).toBe('primary');
    expect(upstream.requests).toEqual(['primary', 'secondary', 'secondary', 'primary']);
  });
  it('três falhas e três rodadas de sucesso compartilham o teto de seis chamadas reais', async () => {
    const upstream = await httpProviders((id) => ({
      status: id === 'cohere' ? 200 : id === 'openrouter' ? 402 : 503,
    }));
    const { controller, beforeAttempt } = setup(['openrouter', 'gemini', 'groq', 'cohere']);
    const turn = controller.createTurn(new AbortController().signal);
    for (let round = 0; round < 3; round++) {
      const result = await turn.run({ beforeAttempt, invoke: upstream.invoke });
      expect(result.candidateId).toBe('cohere');
    }
    expect(turn.attempts).toBe(6);
    expect(beforeAttempt).toHaveBeenCalledTimes(6);
    expect(upstream.requests).toEqual([
      'openrouter',
      'gemini',
      'groq',
      'cohere',
      'cohere',
      'cohere',
    ]);
    await expect(turn.run({ beforeAttempt, invoke: upstream.invoke })).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      status: 502,
    });
    expect(upstream.requests).toHaveLength(6);
  });
  it('timeout individual aborta transporte e permite o próximo candidato', async () => {
    const upstream = await httpProviders((id) => ({ status: 200, hang: id === 'primary' }));
    const { controller, beforeAttempt } = setup(undefined, 100);
    const result = await controller
      .createTurn(new AbortController().signal)
      .run({ beforeAttempt, invoke: upstream.invoke });
    expect(result.candidateId).toBe('secondary');
    expect(result.attempts).toBe(2);
    expect(upstream.invoke.mock.calls[0]![1].aborted).toBe(true);
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
  });
  it('todos os timeouts individuais retornam o código 504 existente', async () => {
    const upstream = await httpProviders(() => ({ status: 200, hang: true }));
    const { controller, beforeAttempt } = setup(undefined, 40);
    await expect(
      controller
        .createTurn(new AbortController().signal)
        .run({ beforeAttempt, invoke: upstream.invoke }),
    ).rejects.toMatchObject({ code: 'LLM_TIMEOUT', status: 504 });
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
  });
  it('abort global cancela callback que ignora signal sem acionar fallback ou cooldown', async () => {
    const { controller, store, beforeAttempt } = setup(undefined, 1000);
    const cancellation = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const invoke = vi.fn(async () => {
      entered();
      return new Promise<never>(() => undefined);
    });
    const result = controller.createTurn(cancellation.signal).run({ beforeAttempt, invoke });
    await started;
    cancellation.abort(new DOMException('Operação cancelada.', 'AbortError'));
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(beforeAttempt).toHaveBeenCalledTimes(1);
    expect(store.deadlines.size).toBe(0);
  });
  it('abort ocorrido na reserva impede a chamada externa e não tenta outro provedor', async () => {
    const { controller } = setup();
    const cancellation = new AbortController();
    const beforeAttempt = vi.fn(async () => {
      cancellation.abort();
      return { allowed: true };
    });
    const invoke = vi.fn(async () => 'never');
    const turn = controller.createTurn(cancellation.signal);
    await expect(turn.run({ beforeAttempt, invoke })).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
    expect(turn.attempts).toBe(0);
  });
  it('abort durante persistência do último cooldown continua sendo cancelamento global', async () => {
    const store = new MemoryCooldown();
    const cancellation = new AbortController();
    vi.spyOn(store, 'block').mockImplementation(async () => {
      cancellation.abort();
    });
    const controller = new LlmInvocationController({
      candidates: [{ id: 'primary', timeoutMs: 1000 }],
      cooldownMs: 100,
      maxCooldownMs: 5000,
      cooldownStore: store,
    });
    await expect(
      controller.createTurn(cancellation.signal).run({
        beforeAttempt: async () => ({ allowed: true }),
        invoke: async () => {
          throw Object.assign(new Error('private-error'), { status: 503 });
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it.each([
    new AppError('LLM_BUDGET_EXHAUSTED', 429, 'Limite', 10),
    new AppError('LLM_BUDGET_UNAVAILABLE', 503, 'Controle indisponível'),
    new Error('private-redis-error-canary'),
  ])(
    'falha no hook de orçamento é fatal e nunca é tratada como falha upstream (%#)',
    async (failure) => {
      const { controller, store } = setup();
      const beforeAttempt = vi.fn(async () => {
        throw failure;
      });
      const invoke = vi.fn(async () => 'never');
      await expect(
        controller.createTurn(new AbortController().signal).run({ beforeAttempt, invoke }),
      ).rejects.toBe(failure);
      expect(beforeAttempt).toHaveBeenCalledTimes(1);
      expect(invoke).not.toHaveBeenCalled();
      expect(store.deadlines.size).toBe(0);
    },
  );
  it('quota local de um provedor é skip explícito, sem contar uma chamada HTTP inexistente', async () => {
    const { controller, store } = setup();
    const beforeAttempt = vi.fn(async (id: string) =>
      id === 'primary' ? { allowed: false, retryAfterMs: 3000 } : { allowed: true },
    );
    const invoke = vi.fn(async (id: string) => id);
    const result = await controller
      .createTurn(new AbortController().signal)
      .run({ beforeAttempt, invoke });
    expect(result).toMatchObject({ candidateId: 'secondary', attempts: 1, fallbackUsed: true });
    expect(invoke).toHaveBeenCalledOnce();
    expect(await store.remainingMs('primary')).toBe(3000);
  });
  it('todos em cooldown retornam 503 e Retry-After sem reservar orçamento nem invocar modelos', async () => {
    const { controller, store, beforeAttempt } = setup();
    await store.block('primary', 1200);
    await store.block('secondary', 3000);
    const invoke = vi.fn(async () => 'never');
    await expect(
      controller.createTurn(new AbortController().signal).run({ beforeAttempt, invoke }),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE', status: 503, retryAfterSeconds: 2 });
    expect(beforeAttempt).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('todos com quotas locais esgotadas retornam 503 sem executar callback de modelo', async () => {
    const { controller } = setup();
    const beforeAttempt = vi.fn(async () => ({ allowed: false, retryAfterMs: 3000 }));
    const invoke = vi.fn(async () => 'never');
    await expect(
      controller.createTurn(new AbortController().signal).run({ beforeAttempt, invoke }),
    ).rejects.toMatchObject({ status: 503, retryAfterSeconds: 3 });
    expect(invoke).not.toHaveBeenCalled();
  });
  it.each([400, 403, 422])('HTTP %s não tenta outra rota', async (status) => {
    const upstream = await httpProviders(() => ({ status }));
    const { controller, beforeAttempt } = setup();
    await expect(
      controller
        .createTurn(new AbortController().signal)
        .run({ beforeAttempt, invoke: upstream.invoke }),
    ).rejects.toMatchObject({ status });
    expect(upstream.requests).toEqual(['primary']);
    expect(beforeAttempt).toHaveBeenCalledOnce();
  });
  it('AppError interno e ferramenta inválida são fatais mesmo com status 502', async () => {
    const { controller, beforeAttempt, store } = setup();
    const failure = new AppError('LLM_INVALID_TOOL', 502, 'Ferramenta inválida');
    const invoke = vi.fn(async () => {
      throw failure;
    });
    await expect(
      controller.createTurn(new AbortController().signal).run({ beforeAttempt, invoke }),
    ).rejects.toBe(failure);
    expect(invoke).toHaveBeenCalledOnce();
    expect(store.deadlines.size).toBe(0);
  });
  it('erro desconhecido com texto de quota/política não é classificado pela mensagem', async () => {
    const { controller, beforeAttempt } = setup();
    const failure = new Error('insufficient_quota retry after 2 seconds private-content');
    const invoke = vi.fn(async () => {
      throw failure;
    });
    await expect(
      controller.createTurn(new AbortController().signal).run({ beforeAttempt, invoke }),
    ).rejects.toBe(failure);
    expect(invoke).toHaveBeenCalledOnce();
  });
  it('falha ao persistir cooldown bloqueia continuação em outro provedor', async () => {
    const { store } = setup();
    const failure = new AppError('LLM_UNAVAILABLE', 503, 'Controle indisponível');
    vi.spyOn(store, 'block').mockRejectedValue(failure);
    const controller = new LlmInvocationController({
      candidates: [
        { id: 'primary', timeoutMs: 1000 },
        { id: 'secondary', timeoutMs: 1000 },
      ],
      cooldownMs: 100,
      maxCooldownMs: 5000,
      cooldownStore: store,
    });
    const invoke = vi.fn(async () => {
      throw { status: 503 };
    });
    await expect(
      controller
        .createTurn(new AbortController().signal)
        .run({ beforeAttempt: async () => ({ allowed: true }), invoke }),
    ).rejects.toBe(failure);
    expect(invoke).toHaveBeenCalledOnce();
  });
  it('remove listeners de abort após sucesso e após falha terminal', async () => {
    const { controller, beforeAttempt } = setup();
    const signal = new AbortController().signal;
    const add = vi.spyOn(signal, 'addEventListener');
    const remove = vi.spyOn(signal, 'removeEventListener');
    await controller.createTurn(signal).run({ beforeAttempt, invoke: async () => 'ok' });
    await expect(
      controller.createTurn(signal).run({
        beforeAttempt,
        invoke: async () => {
          throw new Error('terminal');
        },
      }),
    ).rejects.toThrow('terminal');
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe('classificação e Retry-After sanitizados', () => {
  it.each([
    [408, 'timeout'],
    [429, 'rate_limit'],
    [402, 'quota'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [401, 'configuration'],
    [404, 'configuration'],
  ])('classifica HTTP %s por metadados', (status, expected) => {
    expect(classifyLlmInvocationFailure({ status })).toBe(expected);
  });
  it('reconhece timeout/network por classe SDK ou código estruturado, nunca pelo corpo', () => {
    class APIConnectionError extends Error {}
    class APIConnectionTimeoutError extends Error {}
    class APIUserAbortError extends Error {}
    expect(classifyLlmInvocationFailure(new APIConnectionError())).toBe('network');
    expect(classifyLlmInvocationFailure(new APIConnectionTimeoutError())).toBe('timeout');
    expect(classifyLlmInvocationFailure(new APIUserAbortError())).toBeUndefined();
    expect(classifyLlmInvocationFailure({ cause: { code: 'ECONNRESET' } })).toBe('network');
    expect(classifyLlmInvocationFailure({ statusCode: 429, code: 'insufficient_quota' })).toBe(
      'quota',
    );
    expect(
      classifyLlmInvocationFailure({ status: 503, code: 'content_policy_violation' }),
    ).toBeUndefined();
    expect(classifyLlmInvocationFailure({ error: { code: 'insufficient_quota' } })).toBeUndefined();
  });
  it('aceita segundos e data HTTP; limita headers enormes/inválidos conservadoramente', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const error = (header: unknown) => ({ headers: { 'retry-after': header } });
    expect(llmRetryAfterMs(error('2'), now, 5000)).toBe(2000);
    expect(llmRetryAfterMs(error('Sat, 24 Oct 2026 12:00:04 GMT'), now, 5000)).toBe(4000);
    expect(llmRetryAfterMs(error('999999999999999999999999999'), now, 5000)).toBe(5000);
    expect(llmRetryAfterMs(error('private-invalid-canary'), now, 5000)).toBe(5000);
    expect(llmRetryAfterMs(error('-1'), now, 5000)).toBe(5000);
    expect(llmRetryAfterMs(error('0'), now, 5000)).toBe(0);
    expect(llmRetryAfterMs({}, now, 5000)).toBeUndefined();
  });
});

describe('cooldown Redis falha fechado', () => {
  it('usa apenas chave de candidato e números; aceita TTL existente maior sem encurtá-lo', async () => {
    const evalRedis = vi.fn(async () => 4000);
    const store = new RedisLlmCooldownStore(
      { eval: evalRedis },
      { keyPrefix: 'test:cooldown', maxCooldownMs: 5000 },
    );
    expect(await store.remainingMs('primary')).toBe(4000);
    await store.block('primary', 2000);
    expect(evalRedis.mock.calls[0]!.slice(1)).toEqual([1, 'test:cooldown:primary', 5000]);
    expect(evalRedis.mock.calls[1]!.slice(1)).toEqual([1, 'test:cooldown:primary', 2000, 5000]);
  });
  it.each([-1, '500', NaN, 5001, null, [1000]])(
    'TTL inválido %s não libera modelo',
    async (value) => {
      const store = new RedisLlmCooldownStore(
        { eval: async () => value },
        { keyPrefix: 'test:cooldown', maxCooldownMs: 5000 },
      );
      await expect(store.remainingMs('primary')).rejects.toMatchObject({
        code: 'LLM_UNAVAILABLE',
        status: 503,
      });
    },
  );
  it('não expõe erro Redis, segredo ou chave em falhas', async () => {
    const store = new RedisLlmCooldownStore(
      {
        eval: async () => {
          throw new Error('private-redis-canary');
        },
      },
      { keyPrefix: 'test:private-key-canary', maxCooldownMs: 5000 },
    );
    const failure: unknown = await store.block('primary', 1000).catch((error: unknown) => error);
    expect(String(failure)).not.toContain('private-');
    await expect(store.block('primary', Infinity)).rejects.toMatchObject({ status: 503 });
    await expect(store.remainingMs('private/id')).rejects.toMatchObject({ status: 503 });
  });
});
