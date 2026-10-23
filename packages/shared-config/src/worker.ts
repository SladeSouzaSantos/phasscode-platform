import { z } from 'zod';

const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_ENABLED: bool.default(false),
  DATABASE_URL: optional,
  REDIS_URL: optional,
  NOTIFICATION_MODE: z.enum(['disabled', 'fake', 'real']).default('disabled'),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: optional,
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,
  NOTIFICATION_HTTP_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  OUTBOX_LEASE_MS: z.coerce.number().int().min(60000).max(900000).default(120000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  REMINDER_BEFORE_MINUTES: z.coerce.number().int().min(1).max(10080).default(60),
});
export type WorkerConfig = z.infer<typeof schema>;
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Configuração worker inválida: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && config.NOTIFICATION_MODE === 'fake')
    throw new Error('Produção não permite notificações fake.');
  if (config.WORKER_ENABLED && (!config.DATABASE_URL || !config.REDIS_URL))
    throw new Error('Worker requer PostgreSQL e Redis.');
  if (
    config.WORKER_ENABLED &&
    config.NODE_ENV === 'production' &&
    (config.NOTIFICATION_MODE !== 'real' || env.GOOGLE_CALENDAR_MODE !== 'google')
  )
    throw new Error('Worker em produção requer Calendar Google e notificações reais.');
  if (config.NOTIFICATION_MODE === 'real') {
    if (
      !(config.SMTP_HOST && config.SMTP_FROM) &&
      !(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID)
    )
      throw new Error('Notificações reais requerem SMTP ou Telegram configurado.');
    if (
      !!config.TELEGRAM_BOT_TOKEN !== !!config.TELEGRAM_CHAT_ID ||
      !!config.SMTP_USER !== !!config.SMTP_PASSWORD ||
      !!config.SMTP_HOST !== !!config.SMTP_FROM
    )
      throw new Error('Credenciais parciais de notificações não são permitidas.');
  }
  return config;
}
