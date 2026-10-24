import { z } from 'zod';

export const LLM_FALLBACK_PROVIDER_IDS = ['openrouter', 'gemini', 'groq', 'cohere'] as const;
export type LlmFallbackProviderId = (typeof LLM_FALLBACK_PROVIDER_IDS)[number];
export const LLM_FALLBACK_REQUIRED_FIELDS = ['API_KEY', 'MODEL', 'MAX_CALLS'] as const;
export const LLM_FALLBACK_PROVIDER_FIELDS = [...LLM_FALLBACK_REQUIRED_FIELDS, 'WINDOW_MS'] as const;
export interface LlmFallbackProviderConfig {
  id: LlmFallbackProviderId;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxCalls: number;
  windowMs: number;
}
export type LlmFallbackConfig =
  | { enabled: false }
  | {
      enabled: true;
      providers: LlmFallbackProviderConfig[];
      cooldownMs: number;
      maxCooldownMs: number;
      maxAttemptsPerTurn: number;
    };

export const LLM_FALLBACK_ENV_NAMES = [
  'LLM_FALLBACK_ENABLED',
  'LLM_FALLBACK_ATTEMPT_TIMEOUT_MS',
  'LLM_FALLBACK_COOLDOWN_MS',
  'LLM_FALLBACK_MAX_COOLDOWN_MS',
  'LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN',
  ...LLM_FALLBACK_PROVIDER_IDS.flatMap((id) =>
    LLM_FALLBACK_PROVIDER_FIELDS.map((suffix) => `LLM_${id.toUpperCase()}_${suffix}`),
  ),
];
const maxWindowMs = 2_678_400_000;
const optional = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const number = (minimum: number, maximum: number, defaultValue: number) =>
  z.preprocess(optional, z.coerce.number().int().min(minimum).max(maximum).default(defaultValue));

export function loadLlmFallbackConfig(
  env: NodeJS.ProcessEnv,
  settings: {
    timeoutMs: number;
    globalWindowMs: number;
    nodeEnv: 'development' | 'test' | 'production';
  },
): LlmFallbackConfig {
  if (!env.LLM_FALLBACK_ENABLED || env.LLM_FALLBACK_ENABLED === 'false') return { enabled: false };
  if (env.LLM_FALLBACK_ENABLED !== 'true')
    throw new Error('LLM_FALLBACK_ENABLED deve ser true ou false.');
  const schema = z.object({
    LLM_FALLBACK_ATTEMPT_TIMEOUT_MS: number(100, 60000, Math.min(5000, settings.timeoutMs)),
    LLM_FALLBACK_COOLDOWN_MS: number(1, maxWindowMs, 60000),
    LLM_FALLBACK_MAX_COOLDOWN_MS: number(1, maxWindowMs, 86400000),
    LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN: number(1, 6, 6),
  });
  const controls = schema.safeParse(env);
  if (!controls.success)
    throw new Error(
      `Configuração de fallback LLM inválida: ${controls.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`,
    );
  const value = controls.data;
  if (value.LLM_FALLBACK_ATTEMPT_TIMEOUT_MS > settings.timeoutMs)
    throw new Error('LLM_FALLBACK_ATTEMPT_TIMEOUT_MS não pode superar LLM_TIMEOUT_MS.');
  if (value.LLM_FALLBACK_MAX_COOLDOWN_MS < value.LLM_FALLBACK_COOLDOWN_MS)
    throw new Error('LLM_FALLBACK_MAX_COOLDOWN_MS deve cobrir LLM_FALLBACK_COOLDOWN_MS.');

  const providers: LlmFallbackProviderConfig[] = [];
  for (const id of LLM_FALLBACK_PROVIDER_IDS) {
    const prefix = `LLM_${id.toUpperCase()}_`;
    const required = LLM_FALLBACK_REQUIRED_FIELDS.map((suffix) => prefix + suffix);
    const fields = LLM_FALLBACK_PROVIDER_FIELDS.map((suffix) => prefix + suffix);
    if (!fields.some((name) => env[name]?.trim())) continue;
    const missing = required.filter((name) => !env[name]?.trim());
    if (missing.length)
      throw new Error(`Fallback LLM requer campos completos: ${missing.join(', ')}.`);
    const parsed = z
      .object({
        API_KEY: z.string().trim().min(1).max(4096),
        MODEL: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
        MAX_CALLS: z.coerce.number().int().min(1).max(1_000_000),
        WINDOW_MS: number(1000, maxWindowMs, settings.globalWindowMs),
      })
      .safeParse(Object.fromEntries(fields.map((name) => [name.slice(prefix.length), env[name]])));
    if (!parsed.success)
      throw new Error(
        `Configuração de fallback LLM inválida: ${parsed.error.issues.map((issue) => `${prefix}${issue.path.join('.')}`).join(', ')}.`,
      );
    if (
      id === 'openrouter' &&
      parsed.data.MODEL !== 'openrouter/free' &&
      !parsed.data.MODEL.endsWith(':free')
    )
      throw new Error('LLM_OPENROUTER_MODEL permite somente :free ou openrouter/free.');
    if (id === 'cohere' && settings.nodeEnv === 'production')
      throw new Error(
        'LLM_COHERE_API_KEY não pode habilitar Cohere trial em NODE_ENV=production no fallback gratuito.',
      );
    providers.push({
      id,
      apiKey: parsed.data.API_KEY,
      model: parsed.data.MODEL,
      timeoutMs: value.LLM_FALLBACK_ATTEMPT_TIMEOUT_MS,
      maxCalls: parsed.data.MAX_CALLS,
      windowMs: parsed.data.WINDOW_MS,
    });
  }
  if (!providers.length) throw new Error('Fallback LLM requer ao menos um provedor completo.');
  return {
    enabled: true,
    providers,
    cooldownMs: value.LLM_FALLBACK_COOLDOWN_MS,
    maxCooldownMs: value.LLM_FALLBACK_MAX_COOLDOWN_MS,
    maxAttemptsPerTurn: value.LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN,
  };
}
