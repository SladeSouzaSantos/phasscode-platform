import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import type { LlmFallbackProviderId } from '../packages/shared-config/src/llm-fallback.js';
import { createFallbackInvocationFactory } from '../apps/orbe-node/src/adapters/fallback-llm.js';
import type { BoundModelPort } from '../apps/orbe-node/src/adapters/llm-model-factory.js';
import {
  LlmInvocationController,
  type LlmInvocationDiagnostic,
} from '../apps/orbe-node/src/adapters/llm-invocation-controller.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';

function harness() {
  const cooldowns = new Map<string, number>();
  const controller = new LlmInvocationController({
    candidates: [
      { id: 'primary', timeoutMs: 1000 },
      { id: 'secondary', timeoutMs: 1000 },
    ],
    cooldownMs: 100,
    maxCooldownMs: 5000,
    maxAttemptsPerTurn: 6,
    cooldownStore: {
      remainingMs: async (id) => cooldowns.get(id) ?? 0,
      block: async (id, ms) => {
        cooldowns.set(id, ms);
      },
    },
  });
  const events: LlmInvocationDiagnostic[] = [];
  const onDiagnostic = (event: LlmInvocationDiagnostic) => events.push(event);
  return { controller, cooldowns, events, onDiagnostic };
}

describe('F3.5 fallback diagnostics (sanitized, no extra LLM requests)', () => {
  it('records an upstream 429 and the successful fallback without raw error data', async () => {
    const { controller, events, onDiagnostic } = harness();
    const invoke = vi.fn(async (id: string) => {
      if (id === 'primary') {
        throw Object.assign(new Error('private-error-body-canary'), {
          status: 429,
          url: 'https://private.example/api?key=private-secret-canary',
        });
      }
      return 'ok';
    });
    const result = await controller.createTurn(new AbortController().signal).run({
      beforeAttempt: async () => ({ allowed: true }),
      invoke,
      onDiagnostic,
    });
    expect(result).toMatchObject({ value: 'ok', attempts: 2, fallbackUsed: true });
    expect(events).toEqual([
      {
        outcome: 'success',
        attempts: 2,
        skippedCooldown: 0,
        skippedLocalQuota: 0,
        candidates: [
          { provider: 'primary', action: 'attempt', failure: 'rate_limit' },
          { provider: 'secondary', action: 'attempt' },
        ],
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private-|https?:|secret|prompt|message/i);
  });

  it('distinguishes cooldown-only 503 without invoking or reserving a provider', async () => {
    const { controller, cooldowns, events, onDiagnostic } = harness();
    cooldowns.set('primary', 1200);
    cooldowns.set('secondary', 3000);
    const beforeAttempt = vi.fn(async () => ({ allowed: true }));
    const invoke = vi.fn(async () => 'unexpected');
    await expect(
      controller.createTurn(new AbortController().signal).run({
        beforeAttempt,
        invoke,
        onDiagnostic,
      }),
    ).rejects.toMatchObject({ code: 'LLM_PROVIDERS_LIMITED', status: 503 });
    expect(beforeAttempt).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        outcome: 'limited',
        attempts: 0,
        skippedCooldown: 2,
        skippedLocalQuota: 0,
        candidates: [
          { provider: 'primary', action: 'cooldown' },
          { provider: 'secondary', action: 'cooldown' },
        ],
      },
    ]);
  });

  it('distinguishes exhausted local quotas from external attempts', async () => {
    const { controller, events, onDiagnostic } = harness();
    const invoke = vi.fn(async () => 'unexpected');
    await expect(
      controller.createTurn(new AbortController().signal).run({
        beforeAttempt: async () => ({ allowed: false, retryAfterMs: 1000 }),
        invoke,
        onDiagnostic,
      }),
    ).rejects.toMatchObject({ code: 'LLM_PROVIDERS_LIMITED', status: 503 });
    expect(invoke).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({
      outcome: 'limited',
      attempts: 0,
      skippedCooldown: 0,
      skippedLocalQuota: 2,
      candidates: [
        { provider: 'primary', action: 'local_quota' },
        { provider: 'secondary', action: 'local_quota' },
      ],
    });
  });

  it('categorizes external 503s without preserving status bodies or raw exceptions', async () => {
    const { controller, events, onDiagnostic } = harness();
    await expect(
      controller.createTurn(new AbortController().signal).run({
        beforeAttempt: async () => ({ allowed: true }),
        invoke: async () => {
          throw Object.assign(new Error('private-upstream-response-canary'), {
            status: 503,
          });
        },
        onDiagnostic,
      }),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    expect(events[0]).toMatchObject({
      outcome: 'error',
      attempts: 2,
      skippedCooldown: 0,
      skippedLocalQuota: 0,
      candidates: [
        { provider: 'primary', action: 'attempt', failure: 'unavailable' },
        { provider: 'secondary', action: 'attempt', failure: 'unavailable' },
      ],
    });
    expect(JSON.stringify(events)).not.toContain('private-upstream-response-canary');
  });

  it('records cancellation and global budget failure without changing their errors', async () => {
    const cancelled = harness();
    const abort = new AbortController();
    await expect(
      cancelled.controller.createTurn(abort.signal).run({
        beforeAttempt: async () => ({ allowed: true }),
        invoke: async () => {
          abort.abort(new DOMException('private-abort-canary', 'AbortError'));
          throw new Error('private-should-not-be-logged');
        },
        onDiagnostic: cancelled.onDiagnostic,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled.events[0]).toMatchObject({ outcome: 'aborted', attempts: 1 });
    expect(JSON.stringify(cancelled.events)).not.toContain('private-');

    const budget = harness();
    const fatal = new AppError('LLM_BUDGET_UNAVAILABLE', 503, 'private-budget-canary');
    await expect(
      budget.controller.createTurn(new AbortController().signal).run({
        beforeAttempt: async () => {
          throw fatal;
        },
        invoke: async () => 'unexpected',
        onDiagnostic: budget.onDiagnostic,
      }),
    ).rejects.toBe(fatal);
    expect(budget.events[0]).toMatchObject({
      outcome: 'error',
      attempts: 0,
      candidates: [],
    });
    expect(JSON.stringify(budget.events)).not.toContain('private-');
  });

  it('never changes the result if telemetry throws, including after a model failure', async () => {
    const { controller } = harness();
    const onDiagnostic = vi.fn(() => {
      throw new Error('private-observability-canary');
    });
    const first = await controller.createTurn(new AbortController().signal).run({
      beforeAttempt: async () => ({ allowed: true }),
      invoke: async () => 'ok',
      onDiagnostic,
    });
    expect(first.value).toBe('ok');
    const terminal = new AppError('LLM_CONTEXT_LIMIT', 502, 'private-internal-canary');
    await expect(
      controller.createTurn(new AbortController().signal).run({
        beforeAttempt: async () => {
          throw terminal;
        },
        invoke: async () => 'unexpected',
        onDiagnostic,
      }),
    ).rejects.toBe(terminal);
    expect(onDiagnostic).toHaveBeenCalledTimes(2);
  });

  it('wires sanitized diagnostics through the real fallback invocation factory', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://127.0.0.1:6379',
      LLM_GLOBAL_MAX_CALLS: '20',
      LLM_FALLBACK_ENABLED: 'true',
      LLM_OPENROUTER_API_KEY: 'synthetic',
      LLM_OPENROUTER_MODEL: 'test-model',
      LLM_OPENROUTER_MAX_CALLS: '10',
    });
    if (!config.llmFallback.enabled) throw new Error('Fallback test setup is disabled.');
    const diagnostics: LlmInvocationDiagnostic[] = [];
    const invoked = vi.fn(() => {
      throw new Error('log transport failure');
    });
    const factory = createFallbackInvocationFactory({
      config: config.llmFallback,
      models: {
        bindTools: () =>
          new Map<LlmFallbackProviderId, BoundModelPort>([
            ['openrouter', { invoke: async () => new AIMessage('ok') }],
          ]),
      },
      globalBudget: { reserve: async () => undefined },
      providerBudgets: new Map([
        ['openrouter' as const, { reserve: async () => undefined }],
      ]),
      cooldownStore: {
        remainingMs: async () => 0,
        block: async () => undefined,
      },
      maxContextChars: 4000,
      onInvocation: invoked,
      onDiagnostic: (event) => diagnostics.push(event),
    });
    const answer = await factory([], new AbortController().signal)([]);
    expect(answer.content).toBe('ok');
    expect(invoked).toHaveBeenCalledOnce();
    expect(diagnostics).toEqual([
      {
        outcome: 'success',
        attempts: 1,
        skippedCooldown: 0,
        skippedLocalQuota: 0,
        candidates: [{ provider: 'openrouter', action: 'attempt' }],
      },
    ]);
  });
});
