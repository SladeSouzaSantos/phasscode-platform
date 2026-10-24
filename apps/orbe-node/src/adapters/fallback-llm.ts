import type { Redis } from 'ioredis';
import type { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Config } from '../../../../packages/shared-config/src/index.js';
import type {
  LlmFallbackConfig,
  LlmFallbackProviderId,
} from '../../../../packages/shared-config/src/llm-fallback.js';
import { AppError } from '../domain/errors.js';
import type { LlmCallBudget } from '../domain/llm-budget.js';
import type { LlmInvocationFactory } from '../domain/llm-invocation.js';
import { createFallbackModelFactory, type BoundModelPort } from './llm-model-factory.js';
import { LlmInvocationController, type LlmCooldownStore } from './llm-invocation-controller.js';
import { RedisLlmCallBudget } from './redis-llm-budget.js';
import { RedisLlmCooldownStore } from './redis-llm-cooldown.js';
import { createFallbackRedisIdentities } from './fallback-redis-identities.js';

type EnabledFallback = Extract<LlmFallbackConfig, { enabled: true }>;
export interface LlmInvocationEvent {
  provider: LlmFallbackProviderId;
  attempts: number;
  fallbackUsed: boolean;
}
interface FallbackDependencies {
  config: EnabledFallback;
  models: {
    bindTools(tools: StructuredToolInterface[]): Map<LlmFallbackProviderId, BoundModelPort>;
  };
  globalBudget: LlmCallBudget;
  providerBudgets: ReadonlyMap<LlmFallbackProviderId, LlmCallBudget>;
  cooldownStore: LlmCooldownStore;
  maxContextChars: number;
  onInvocation?: (event: LlmInvocationEvent) => void;
}

export function createFallbackInvocationFactory({
  config,
  models,
  globalBudget,
  providerBudgets,
  cooldownStore,
  maxContextChars,
  onInvocation,
}: FallbackDependencies): LlmInvocationFactory {
  const controller = new LlmInvocationController({
    candidates: config.providers,
    cooldownMs: config.cooldownMs,
    maxCooldownMs: config.maxCooldownMs,
    maxAttemptsPerTurn: config.maxAttemptsPerTurn,
    cooldownStore,
  });
  for (const { id } of config.providers)
    if (!providerBudgets.has(id)) throw new Error('Orçamento do provedor de fallback ausente.');
  return (tools, signal) => {
    const bound = models.bindTools(tools);
    const turn = controller.createTurn(signal);
    return async (messages) => {
      const result = await turn.run<AIMessage>({
        beforeAttempt: async (candidateId) => {
          signal.throwIfAborted();
          const contextCharacters = bound
            .get(candidateId as LlmFallbackProviderId)!
            .contextCharacters?.(messages);
          if (contextCharacters !== undefined && contextCharacters > maxContextChars)
            throw new AppError(
              'LLM_CONTEXT_LIMIT',
              502,
              'Limite de contexto do assistente atingido. Envie uma mensagem mais curta.',
            );
          const budget = providerBudgets.get(candidateId as LlmFallbackProviderId)!;
          try {
            await budget.reserve();
          } catch (error) {
            // A provider's local allowance may advance the chain. Global limits
            // and Redis failures must always stop, before any outbound request.
            if (error instanceof AppError && error.code === 'LLM_BUDGET_EXHAUSTED')
              return { allowed: false, retryAfterMs: (error.retryAfterSeconds ?? 1) * 1000 };
            throw error;
          }
          signal.throwIfAborted();
          await globalBudget.reserve();
          signal.throwIfAborted();
          return { allowed: true };
        },
        invoke: (candidateId, attemptSignal) =>
          bound
            .get(candidateId as LlmFallbackProviderId)!
            .invoke(messages, { signal: attemptSignal }),
      });
      onInvocation?.({
        provider: result.candidateId as LlmFallbackProviderId,
        attempts: result.attempts,
        fallbackUsed: result.fallbackUsed,
      });
      return result.value;
    };
  };
}

// Quotas are shared by replicas using the same global namespace and credential.
// No credential, URL or model content is used in plaintext in Redis key names.
export function createRedisFallbackInvocationFactory(
  config: Config,
  redis: Redis,
  globalBudget: LlmCallBudget,
  onInvocation?: (event: LlmInvocationEvent) => void,
): LlmInvocationFactory {
  if (!config.llmFallback.enabled) throw new Error('Fallback LLM não está habilitado.');
  const fallback = config.llmFallback;
  const identities = createFallbackRedisIdentities(
    config.LLM_GLOBAL_BUDGET_KEY,
    fallback.providers,
  );
  const providerBudgets = new Map(
    fallback.providers.map((provider) => [
      provider.id,
      new RedisLlmCallBudget(redis, {
        key: identities.providers.get(provider.id)!.quotaKey,
        maxCalls: provider.maxCalls,
        windowMs: provider.windowMs,
      }),
    ]),
  );
  const cooldowns = new RedisLlmCooldownStore(redis, {
    keyPrefix: identities.cooldownKeyPrefix,
    maxCooldownMs: fallback.maxCooldownMs,
  });
  return createFallbackInvocationFactory({
    config: fallback,
    models: createFallbackModelFactory({
      providers: fallback.providers,
      maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
      ...(config.OPENROUTER_REASONING_ENABLED !== undefined
        ? { openRouterReasoningEnabled: config.OPENROUTER_REASONING_ENABLED }
        : {}),
    }),
    globalBudget,
    providerBudgets,
    maxContextChars: config.CHAT_CONTEXT_CHARS,
    cooldownStore: {
      remainingMs: (id) =>
        cooldowns.remainingMs(identities.providers.get(id as LlmFallbackProviderId)!.cooldownId),
      block: (id, durationMs) =>
        cooldowns.block(
          identities.providers.get(id as LlmFallbackProviderId)!.cooldownId,
          durationMs,
        ),
    },
    ...(onInvocation ? { onInvocation } : {}),
  });
}
