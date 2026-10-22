import { AppError } from '../domain/errors.js';
import type { LlmCallBudget } from '../domain/llm-budget.js';

interface BudgetRedis {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// O relógio, o incremento e a expiração são decididos pelo mesmo Redis, em uma
// única execução. Negativas não estendem a janela; reservas não são reembolsadas.
const reserveScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local state = redis.call('HMGET', key, 'count', 'resetAt', 'limit', 'window')
local count = tonumber(state[1])
local resetAt = tonumber(state[2])

if redis.call('EXISTS', key) == 0 then
  resetAt = now + window
  redis.call('HSET', key, 'count', 1, 'resetAt', resetAt, 'limit', limit, 'window', window)
  redis.call('PEXPIREAT', key, resetAt)
  return {1, math.max(1, math.ceil(window / 1000))}
end

-- Uma janela legítima expira junto com a chave. Hash ainda presente com prazo
-- passado, sem expiração ou metadados divergentes é corrupção, não novo crédito.
if not count or count < 1 or count > limit or count ~= math.floor(count)
  or not resetAt or resetAt ~= math.floor(resetAt)
  or resetAt <= now or resetAt > now + window
  or tonumber(state[3]) ~= limit or tonumber(state[4]) ~= window
  or redis.call('PEXPIRETIME', key) ~= resetAt then
  return {-1, 0}
end

local retryAfter = math.max(1, math.ceil((resetAt - now) / 1000))
if count >= limit then return {0, retryAfter} end
redis.call('HINCRBY', key, 'count', 1)
return {1, retryAfter}
`;

const unavailable = () =>
  new AppError(
    'LLM_BUDGET_UNAVAILABLE',
    503,
    'O controle de consumo de IA está indisponível. Tente novamente.',
  );

export class RedisLlmCallBudget implements LlmCallBudget {
  constructor(
    private readonly redis: BudgetRedis,
    private readonly options: { key: string; maxCalls: number; windowMs: number },
  ) {
    if (
      !/^[A-Za-z0-9:_-]{1,120}$/.test(options.key) ||
      !Number.isInteger(options.maxCalls) ||
      options.maxCalls < 1 ||
      options.maxCalls > 1_000_000 ||
      !Number.isInteger(options.windowMs) ||
      options.windowMs < 1000 ||
      options.windowMs > 2_678_400_000
    ) {
      throw new Error('Configuração inválida do orçamento global de IA.');
    }
  }

  async reserve(): Promise<void> {
    let result: unknown;
    try {
      result = await this.redis.eval(
        reserveScript,
        1,
        this.options.key,
        this.options.maxCalls,
        this.options.windowMs,
      );
    } catch {
      throw unavailable();
    }
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      ![0, 1].includes(result[0] as number) ||
      typeof result[1] !== 'number' ||
      !Number.isSafeInteger(result[1]) ||
      result[1] < 1 ||
      result[1] > Math.ceil(this.options.windowMs / 1000)
    ) {
      throw unavailable();
    }
    if (result[0] === 0) {
      throw new AppError(
        'LLM_BUDGET_EXHAUSTED',
        429,
        'O limite global de chamadas de IA foi atingido. Tente novamente após a janela.',
        result[1],
      );
    }
  }
}
