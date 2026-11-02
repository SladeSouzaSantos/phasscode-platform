import { AppError } from '../domain/errors.js';
import { MAX_FALLBACK_ATTEMPTS_PER_TURN } from '../domain/llm-limits.js';

export interface LlmCooldownStore {
  remainingMs(candidateId: string): Promise<number>;
  block(candidateId: string, durationMs: number): Promise<void>;
}
export interface LlmInvocationCandidate {
  id: string;
  timeoutMs: number;
}
export interface LlmInvocationOptions {
  candidates: readonly LlmInvocationCandidate[];
  cooldownMs: number;
  maxCooldownMs: number;
  maxAttemptsPerTurn?: number;
  cooldownStore: LlmCooldownStore;
}
export interface LlmInvocationHooks<T> {
  // Provider quota can explicitly skip. Redis/global-budget failures must throw.
  beforeAttempt(candidateId: string): Promise<{ allowed: boolean; retryAfterMs?: number }>;
  invoke(candidateId: string, signal: AbortSignal): Promise<T>;
}
export interface LlmInvocationResult<T> {
  value: T;
  candidateId: string;
  attempts: number;
  fallbackUsed: boolean;
}
type Failure = 'timeout' | 'network' | 'quota' | 'rate_limit' | 'unavailable' | 'configuration';
const candidateIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const networkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const policyCodes = new Set([
  'content_filter',
  'content_policy_violation',
  'safety_violation',
  'moderation_blocked',
  'invalid_request_error',
  'invalid_tool_call',
  'invalid_schema',
  'unsupported_response_format',
]);
const quotaCodes = new Set(['insufficient_quota', 'quota_exceeded', 'credits_exhausted']);
const unavailable = (status = 502, retryAfterSeconds?: number) =>
  new AppError(
    'LLM_UNAVAILABLE',
    status,
    'Os provedores de IA estão indisponíveis. Tente novamente.',
    retryAfterSeconds,
  );

function field(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined;
  } catch {
    return undefined;
  }
}
function className(value: unknown): string | undefined {
  const constructor = field(value, 'constructor');
  try {
    return typeof constructor === 'function' ? constructor.name : undefined;
  } catch {
    return undefined;
  }
}

// No messages, error bodies, prompts, URLs or credentials are inspected or retained.
export function classifyLlmInvocationFailure(error: unknown): Failure | undefined {
  if (error instanceof AppError) return undefined;
  const code = field(error, 'code');
  if (typeof code === 'string' && policyCodes.has(code)) return undefined;
  const response = field(error, 'response');
  const status = field(error, 'status') ?? field(error, 'statusCode') ?? field(response, 'status');
  if (typeof status === 'number') {
    if ([400, 403, 422].includes(status)) return undefined;
    if ([401, 404].includes(status)) return 'configuration';
    if (status === 408) return 'timeout';
    if (status === 402) return 'quota';
    if (status === 429)
      return typeof code === 'string' && quotaCodes.has(code) ? 'quota' : 'rate_limit';
    if (status >= 500 && status <= 599) return 'unavailable';
    return undefined;
  }
  const name = className(error);
  if (name === 'APIUserAbortError' || field(error, 'name') === 'AbortError') return undefined;
  if (name === 'APIConnectionTimeoutError' || field(error, 'name') === 'TimeoutError')
    return 'timeout';
  if (name === 'APIConnectionError') return 'network';
  if (typeof code === 'string' && quotaCodes.has(code)) return 'quota';
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause; depth++) {
    const causeCode = field(cause, 'code');
    if (typeof causeCode === 'string' && networkCodes.has(causeCode)) return 'network';
    cause = field(cause, 'cause');
  }
  return undefined;
}

function retryHeader(error: unknown): unknown {
  const headers = field(error, 'headers') ?? field(field(error, 'response'), 'headers');
  try {
    const get = field(headers, 'get');
    if (typeof get === 'function') return Reflect.apply(get, headers, ['retry-after']);
    return field(headers, 'retry-after') ?? field(headers, 'Retry-After');
  } catch {
    return undefined;
  }
}

export function llmRetryAfterMs(
  error: unknown,
  now: number,
  maxCooldownMs: number,
): number | undefined {
  const value = retryHeader(error);
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 128) return maxCooldownMs;
  const text = value.trim();
  let result: number;
  if (/^\d+(?:\.\d+)?$/.test(text)) result = Number(text) * 1000;
  else if (
    /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      text,
    )
  )
    result = Date.parse(text) - now;
  else return maxCooldownMs;
  if (!Number.isFinite(result)) return maxCooldownMs;
  return Math.max(0, Math.min(maxCooldownMs, Math.ceil(result)));
}

class AttemptTimeout extends Error {}
async function invokeWithDeadline<T>(
  invoke: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  let rejectDeadline!: (reason: unknown) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const onAbort = () => {
    controller.abort(parent.reason);
    rejectDeadline(parent.reason ?? new DOMException('Operação cancelada.', 'AbortError'));
  };
  parent.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    const timeout = new AttemptTimeout();
    controller.abort(timeout);
    rejectDeadline(timeout);
  }, timeoutMs);
  try {
    if (parent.aborted) onAbort();
    const operation = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return invoke(controller.signal);
    });
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', onAbort);
  }
}

export class LlmInvocationController {
  readonly candidates: readonly LlmInvocationCandidate[];
  readonly cooldownMs: number;
  readonly maxCooldownMs: number;
  readonly maxAttemptsPerTurn: number;
  readonly cooldownStore: LlmCooldownStore;
  constructor(options: LlmInvocationOptions) {
    const attempts = options.maxAttemptsPerTurn ?? MAX_FALLBACK_ATTEMPTS_PER_TURN;
    if (
      !options.candidates.length ||
      options.candidates.length > MAX_FALLBACK_ATTEMPTS_PER_TURN ||
      new Set(options.candidates.map(({ id }) => id)).size !== options.candidates.length ||
      options.candidates.some(
        ({ id, timeoutMs }) =>
          !candidateIdPattern.test(id) ||
          !Number.isInteger(timeoutMs) ||
          timeoutMs < 1 ||
          timeoutMs > 60000,
      ) ||
      !Number.isSafeInteger(options.cooldownMs) ||
      options.cooldownMs < 1 ||
      !Number.isSafeInteger(options.maxCooldownMs) ||
      options.maxCooldownMs < options.cooldownMs ||
      options.maxCooldownMs > 2_678_400_000 ||
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > MAX_FALLBACK_ATTEMPTS_PER_TURN
    )
      throw new Error('Configuração inválida do controlador de chamadas de IA.');
    this.candidates = options.candidates.map((candidate) => ({ ...candidate }));
    this.cooldownMs = options.cooldownMs;
    this.maxCooldownMs = options.maxCooldownMs;
    this.maxAttemptsPerTurn = attempts;
    this.cooldownStore = options.cooldownStore;
  }
  createTurn(signal: AbortSignal): LlmInvocationTurn {
    return new LlmInvocationTurn(this, signal);
  }
}

export class LlmInvocationTurn {
  private cursor = 0;
  private attemptCount = 0;
  private usedFallback = false;
  private running = false;
  constructor(
    private readonly controller: LlmInvocationController,
    private readonly signal: AbortSignal,
  ) {}
  get attempts() {
    return this.attemptCount;
  }
  get fallbackUsed() {
    return this.usedFallback;
  }
  private bounded(value: number) {
    if (!Number.isFinite(value) || value < 0) throw unavailable(503, 5);
    return Math.min(this.controller.maxCooldownMs, Math.max(1, Math.ceil(value)));
  }
  private async remaining(id: string) {
    const result = await this.controller.cooldownStore.remainingMs(id);
    if (!Number.isSafeInteger(result) || result < 0 || result > this.controller.maxCooldownMs)
      throw unavailable(503, 5);
    return result;
  }
  async run<T>(hooks: LlmInvocationHooks<T>): Promise<LlmInvocationResult<T>> {
    if (this.running) throw unavailable();
    this.running = true;
    let earliest: number | undefined;
    let attempted = false;
    let onlyTimeouts = true;
    let onlyProviderLimits = true;
    try {
      this.signal.throwIfAborted();
      for (; this.cursor < this.controller.candidates.length; this.cursor++) {
        this.signal.throwIfAborted();
        if (this.attemptCount >= this.controller.maxAttemptsPerTurn) throw unavailable();
        const candidate = this.controller.candidates[this.cursor]!;
        const remaining = await this.remaining(candidate.id);
        this.signal.throwIfAborted();
        if (remaining > 0) {
          earliest = Math.min(earliest ?? remaining, remaining);
          continue;
        }
        // Do not catch this hook: failed global budget/Redis must never open a fallback path.
        const reservation = await hooks.beforeAttempt(candidate.id);
        this.signal.throwIfAborted();
        if (!reservation.allowed) {
          const delay = this.bounded(reservation.retryAfterMs ?? this.controller.maxCooldownMs);
          await this.controller.cooldownStore.block(candidate.id, delay);
          this.signal.throwIfAborted();
          earliest = Math.min(earliest ?? delay, delay);
          continue;
        }
        let value: T;
        try {
          value = await invokeWithDeadline(
            (signal) => {
              this.attemptCount++;
              attempted = true;
              if (this.cursor > 0) this.usedFallback = true;
              return hooks.invoke(candidate.id, signal);
            },
            this.signal,
            candidate.timeoutMs,
          );
          this.signal.throwIfAborted();
        } catch (error) {
          this.signal.throwIfAborted();
          const failure =
            error instanceof AttemptTimeout ? 'timeout' : classifyLlmInvocationFailure(error);
          if (!failure) throw error;
          onlyTimeouts = onlyTimeouts && failure === 'timeout';
          onlyProviderLimits =
            onlyProviderLimits && (failure === 'quota' || failure === 'rate_limit');
          const defaultDelay = ['quota', 'configuration'].includes(failure)
            ? this.controller.maxCooldownMs
            : this.controller.cooldownMs;
          const delay = this.bounded(
            Math.max(
              defaultDelay,
              llmRetryAfterMs(error, Date.now(), this.controller.maxCooldownMs) ?? 0,
            ),
          );
          // Failure of cooldown persistence is fatal; no untracked probe of another provider.
          await this.controller.cooldownStore.block(candidate.id, delay);
          this.signal.throwIfAborted();
          earliest = Math.min(earliest ?? delay, delay);
          continue;
        }
        return {
          value,
          candidateId: candidate.id,
          attempts: this.attemptCount,
          fallbackUsed: this.usedFallback,
        };
      }
      this.signal.throwIfAborted();
      if (attempted) {
        if (onlyTimeouts)
          throw new AppError(
            'LLM_TIMEOUT',
            504,
            'O assistente demorou para responder. Tente novamente.',
          );
        if (onlyProviderLimits)
          throw new AppError(
            'LLM_PROVIDERS_LIMITED',
            503,
            'Todos os provedores de IA configurados atingiram limites temporários. Tente novamente depois da renovação das cotas.',
            Math.max(1, Math.ceil((earliest ?? this.controller.cooldownMs) / 1000)),
          );
        throw unavailable();
      }
      // No provider was invoked: all are under cooldown or local quota.
      // A cooldown may follow a quota, outage or timeout; do not claim it was
      // definitely caused by billing/credits.
      throw new AppError(
        'LLM_PROVIDERS_LIMITED',
        503,
        'Nenhum provedor de IA está disponível agora (limite de uso ou período de espera). Tente novamente mais tarde.',
        Math.max(1, Math.ceil((earliest ?? this.controller.cooldownMs) / 1000)),
      );
    } finally {
      this.running = false;
    }
  }
}
