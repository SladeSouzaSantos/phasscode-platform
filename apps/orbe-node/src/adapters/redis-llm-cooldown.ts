import { AppError } from '../domain/errors.js';
import type { LlmCooldownStore } from './llm-invocation-controller.js';

interface CooldownRedis {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}
const readScript = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl == -2 then return 0 end
if ttl < 0 or ttl > tonumber(ARGV[1]) or redis.call('GET', KEYS[1]) ~= '1' then return -1 end
return math.max(1, ttl)
`;
const blockScript = `
local duration = tonumber(ARGV[1])
local maximum = tonumber(ARGV[2])
local ttl = redis.call('PTTL', KEYS[1])
if ttl ~= -2 then
  if ttl < 0 or ttl > maximum or redis.call('GET', KEYS[1]) ~= '1' then return -1 end
  if ttl >= duration then return math.max(1, ttl) end
end
redis.call('SET', KEYS[1], '1', 'PX', duration)
return duration
`;
const unavailable = () =>
  new AppError(
    'LLM_UNAVAILABLE',
    503,
    'O controle de disponibilidade de IA está indisponível. Tente novamente.',
    5,
  );

export class RedisLlmCooldownStore implements LlmCooldownStore {
  constructor(
    private readonly redis: CooldownRedis,
    private readonly options: { keyPrefix: string; maxCooldownMs: number },
  ) {
    if (
      !/^[A-Za-z0-9:_-]{1,100}$/.test(options.keyPrefix) ||
      !Number.isSafeInteger(options.maxCooldownMs) ||
      options.maxCooldownMs < 1 ||
      options.maxCooldownMs > 2_678_400_000
    )
      throw new Error('Configuração inválida do controle de disponibilidade de IA.');
  }
  private key(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw unavailable();
    return `${this.options.keyPrefix}:${id}`;
  }
  private async eval(script: string, id: string, args: number[]): Promise<number> {
    let value: unknown;
    try {
      value = await this.redis.eval(script, 1, this.key(id), ...args);
    } catch {
      throw unavailable();
    }
    if (
      !Number.isSafeInteger(value) ||
      typeof value !== 'number' ||
      value < 0 ||
      value > this.options.maxCooldownMs
    )
      throw unavailable();
    return value;
  }
  remainingMs(id: string): Promise<number> {
    return this.eval(readScript, id, [this.options.maxCooldownMs]);
  }
  async block(id: string, durationMs: number): Promise<void> {
    if (
      !Number.isSafeInteger(durationMs) ||
      durationMs < 1 ||
      durationMs > this.options.maxCooldownMs
    )
      throw unavailable();
    const result = await this.eval(blockScript, id, [durationMs, this.options.maxCooldownMs]);
    if (result < durationMs) throw unavailable();
  }
}
