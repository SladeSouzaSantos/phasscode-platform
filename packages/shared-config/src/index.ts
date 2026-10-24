import { z } from 'zod';
import { loadAuthConfig, type AuthConfig } from './auth.js';
import { loadMeetingConfig, type MeetingConfig } from './meetings.js';
import { loadCalendarConfig, type CalendarConfig } from './calendar.js';
import { loadWorkerConfig, type WorkerConfig } from './worker.js';
import { loadLlmFallbackConfig, type LlmFallbackConfig } from './llm-fallback.js';
export type {
  LlmFallbackConfig,
  LlmFallbackProviderConfig,
  LlmFallbackProviderId,
} from './llm-fallback.js';

const unsafeLlmDiagnostics = [
  'LANGCHAIN_VERBOSE',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
] as const;

export function assertLlmPrivacyEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const enabled = unsafeLlmDiagnostics.filter((name) => env[name] === 'true');
  if (enabled.length) {
    throw new Error(`Diagnóstico de LLM incompatível com a privacidade: ${enabled.join(', ')}.`);
  }
}

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);
const optionalBoolean = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
);
const optionalPositiveInteger = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().min(1).max(1_000_000).optional(),
);
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  PERSISTENCE: z.enum(['memory', 'postgres']).default('memory'),
  DATABASE_URL: optionalText,
  REDIS_URL: optionalText,
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().default(''),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  CHAT_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(40).default(12),
  CHAT_CONTEXT_CHARS: z.coerce.number().int().min(4000).max(32000).default(12000),
  CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CHAT_MAX_CONVERSATIONS: z.coerce.number().int().min(1).max(10000).default(1000),
  LLM_PROVIDER: z.enum(['mock', 'openai', 'openai-compatible']).default('mock'),
  LLM_MODEL: optionalText,
  LLM_API_KEY: optionalText,
  LLM_BASE_URL: optionalText,
  LLM_API_MODE: z.enum(['responses', 'chat-completions']).default('responses'),
  OPENROUTER_REASONING_ENABLED: optionalBoolean,
  LLM_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(15000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(2000).default(800),
  LLM_GLOBAL_MAX_CALLS: optionalPositiveInteger,
  LLM_GLOBAL_WINDOW_MS: z.coerce.number().int().min(1000).max(2_678_400_000).default(86_400_000),
  LLM_GLOBAL_BUDGET_KEY: z
    .string()
    .regex(/^[A-Za-z0-9:_-]{1,120}$/)
    .default('phasscode:llm:global'),
});
export type Config = z.infer<typeof envSchema> & {
  corsOrigins: string[];
  trustedProxies: string[];
  auth: AuthConfig;
  meetings: MeetingConfig;
  calendar: CalendarConfig;
  worker: WorkerConfig;
  llmFallback: LlmFallbackConfig;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  assertLlmPrivacyEnvironment(env);
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Configuração inválida: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  const config = parsed.data;
  const corsOrigins = config.CORS_ORIGINS.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    corsOrigins.length === 0 ||
    corsOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin;
      } catch {
        return true;
      }
    })
  )
    throw new Error('CORS_ORIGINS deve conter origens HTTP explícitas, sem wildcard ou caminho.');
  if (config.PERSISTENCE === 'postgres' && !config.DATABASE_URL)
    throw new Error('DATABASE_URL é obrigatória para postgres.');
  if (
    config.NODE_ENV === 'production' &&
    (config.PERSISTENCE !== 'postgres' || !config.REDIS_URL)
  ) {
    throw new Error('Produção requer PostgreSQL e Redis configurados.');
  }
  const llmFallback = loadLlmFallbackConfig(env, {
    nodeEnv: config.NODE_ENV,
    timeoutMs: config.LLM_TIMEOUT_MS,
    globalWindowMs: config.LLM_GLOBAL_WINDOW_MS,
  });
  if (
    config.OPENROUTER_REASONING_ENABLED !== undefined &&
    (llmFallback.enabled
      ? !llmFallback.providers.some((provider) => provider.id === 'openrouter')
      : config.LLM_PROVIDER !== 'openai-compatible' || config.LLM_API_MODE !== 'chat-completions')
  ) {
    throw new Error(
      llmFallback.enabled
        ? 'OPENROUTER_REASONING_ENABLED requer um candidato OpenRouter no fallback.'
        : 'OPENROUTER_REASONING_ENABLED requer LLM_PROVIDER=openai-compatible e LLM_API_MODE=chat-completions.',
    );
  }
  if (
    !llmFallback.enabled &&
    config.LLM_PROVIDER !== 'mock' &&
    (!config.LLM_API_KEY || !config.LLM_MODEL)
  ) {
    throw new Error('LLM_API_KEY e LLM_MODEL são obrigatórios para o provedor real.');
  }
  if (!llmFallback.enabled && config.LLM_PROVIDER === 'openai-compatible' && !config.LLM_BASE_URL)
    throw new Error('LLM_BASE_URL é obrigatória para openai-compatible.');
  if (!llmFallback.enabled && config.LLM_BASE_URL) {
    const url = new URL(config.LLM_BASE_URL);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('LLM_BASE_URL inválida.');
    if (config.NODE_ENV === 'production' && url.protocol !== 'https:')
      throw new Error('LLM_BASE_URL requer HTTPS em produção.');
  }
  if (
    (llmFallback.enabled || config.LLM_PROVIDER !== 'mock') &&
    (!config.REDIS_URL || !config.LLM_GLOBAL_MAX_CALLS)
  ) {
    throw new Error(
      'Provedor real requer REDIS_URL e LLM_GLOBAL_MAX_CALLS para controlar o consumo.',
    );
  }
  const auth = loadAuthConfig({ ...env, CORS_ORIGINS: corsOrigins.join(',') });
  const meetings = loadMeetingConfig(env);
  const calendar = loadCalendarConfig(env);
  const worker = loadWorkerConfig(env);
  if (
    (auth.enabled || meetings.enabled || worker.WORKER_ENABLED) &&
    (config.PERSISTENCE !== 'postgres' || !config.REDIS_URL)
  ) {
    throw new Error('Login, reuniões e worker requerem PostgreSQL e Redis configurados.');
  }
  if (meetings.enabled && (!auth.enabled || calendar.GOOGLE_CALENDAR_MODE === 'disabled')) {
    throw new Error(
      'Reuniões habilitadas requerem autenticação administrativa e calendário configurados.',
    );
  }
  if (
    meetings.enabled &&
    meetings.calendarLeaseSeconds * 1000 < 6 * calendar.GOOGLE_CALENDAR_HTTP_TIMEOUT_MS
  ) {
    throw new Error('A lease de calendário deve cobrir pelo menos seis timeouts HTTP do Calendar.');
  }
  if (worker.WORKER_ENABLED && !meetings.enabled)
    throw new Error('Worker requer reuniões habilitadas.');
  return {
    ...config,
    corsOrigins,
    auth,
    meetings,
    calendar,
    worker,
    llmFallback,
    trustedProxies: config.TRUST_PROXY.split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
