import { z } from 'zod';

const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GOOGLE_CALENDAR_MODE: z.enum(['disabled', 'fake', 'google']).default('disabled'),
  GOOGLE_CALENDAR_ID: optional,
  GOOGLE_CALENDAR_CLIENT_ID: optional,
  GOOGLE_CALENDAR_CLIENT_SECRET: optional,
  GOOGLE_CALENDAR_REFRESH_TOKEN: optional,
  GOOGLE_CALENDAR_HTTP_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
});
export type CalendarConfig = z.infer<typeof schema>;
export function loadCalendarConfig(env: NodeJS.ProcessEnv = process.env): CalendarConfig {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Configuração Calendar inválida: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = result.data;
  if (config.NODE_ENV === 'production' && config.GOOGLE_CALENDAR_MODE === 'fake')
    throw new Error('Produção não permite Calendar fake.');
  if (
    config.GOOGLE_CALENDAR_MODE === 'google' &&
    [
      config.GOOGLE_CALENDAR_ID,
      config.GOOGLE_CALENDAR_CLIENT_ID,
      config.GOOGLE_CALENDAR_CLIENT_SECRET,
      config.GOOGLE_CALENDAR_REFRESH_TOKEN,
    ].some((value) => !value)
  )
    throw new Error(
      'Google Calendar requer ID, client ID, client secret e refresh token próprios.',
    );
  return config;
}
