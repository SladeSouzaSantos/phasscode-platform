import { z } from 'zod';

export interface MeetingConfig {
  enabled: boolean;
  timeZone: string;
  workdays: number[];
  workStartMinutes: number;
  workEndMinutes: number;
  durationMinutes: number;
  slotStepMinutes: number;
  minNoticeMinutes: number;
  bufferMinutes: number;
  maxHorizonDays: number;
  maxAvailabilityDays: number;
  consentVersion: string;
  retentionDays: number;
  proposalTtlMinutes: number;
  calendarLeaseSeconds: number;
}
const schema = z.object({
  MEETINGS_ENABLED: z.enum(['true', 'false']).default('false'),
  MEETINGS_TIMEZONE: z.string().default('America/Fortaleza'),
  MEETINGS_WORKDAYS: z.string().default('1,2,3,4,5,6'),
  MEETINGS_WORK_START: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('09:00'),
  MEETINGS_WORK_END: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('18:00'),
  MEETINGS_DURATION_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  MEETINGS_SLOT_STEP_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  MEETINGS_MIN_NOTICE_MINUTES: z.coerce.number().int().min(0).max(43200).default(1440),
  MEETINGS_BUFFER_MINUTES: z.coerce.number().int().min(0).max(120).default(15),
  MEETINGS_MAX_HORIZON_DAYS: z.coerce.number().int().min(1).max(180).default(60),
  MEETINGS_MAX_AVAILABILITY_DAYS: z.coerce.number().int().min(1).max(31).default(7),
  MEETINGS_CONSENT_VERSION: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,80}$/)
    .default('meetings-v1'),
  MEETINGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(730).default(90),
  MEETINGS_PROPOSAL_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(30),
  MEETINGS_CALENDAR_LEASE_SECONDS: z.coerce.number().int().min(60).max(600).default(120),
});
export function loadMeetingConfig(env: NodeJS.ProcessEnv = process.env): MeetingConfig {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Configuração de reuniões inválida: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`,
    );
  const value = result.data;
  const time = (text: string) => {
    const [h, m] = text.split(':').map(Number);
    if (h! > 23 || m! > 59) throw new Error('Expediente de reuniões inválido.');
    return h! * 60 + m!;
  };
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.MEETINGS_TIMEZONE }).format();
  } catch {
    throw new Error('MEETINGS_TIMEZONE inválido.');
  }
  const workdays = value.MEETINGS_WORKDAYS.split(',').map((day) => Number(day.trim()));
  if (
    !workdays.length ||
    workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(workdays).size !== workdays.length
  )
    throw new Error('MEETINGS_WORKDAYS deve usar dias ISO únicos de 1 a 7.');
  const start = time(value.MEETINGS_WORK_START);
  const end = time(value.MEETINGS_WORK_END);
  if (start >= end || value.MEETINGS_DURATION_MINUTES > end - start)
    throw new Error('Expediente de reuniões inválido.');
  if (value.MEETINGS_ENABLED === 'true') {
    const required = [
      'MEETINGS_TIMEZONE',
      'MEETINGS_WORKDAYS',
      'MEETINGS_WORK_START',
      'MEETINGS_WORK_END',
      'MEETINGS_DURATION_MINUTES',
      'MEETINGS_MIN_NOTICE_MINUTES',
      'MEETINGS_BUFFER_MINUTES',
      'MEETINGS_MAX_HORIZON_DAYS',
    ];
    const missing = required.filter((name) => !env[name]);
    if (missing.length)
      throw new Error(`Reuniões habilitadas exigem política explícita: ${missing.join(', ')}.`);
  }
  return {
    enabled: value.MEETINGS_ENABLED === 'true',
    timeZone: value.MEETINGS_TIMEZONE,
    workdays,
    workStartMinutes: start,
    workEndMinutes: end,
    durationMinutes: value.MEETINGS_DURATION_MINUTES,
    slotStepMinutes: value.MEETINGS_SLOT_STEP_MINUTES,
    minNoticeMinutes: value.MEETINGS_MIN_NOTICE_MINUTES,
    bufferMinutes: value.MEETINGS_BUFFER_MINUTES,
    maxHorizonDays: value.MEETINGS_MAX_HORIZON_DAYS,
    maxAvailabilityDays: value.MEETINGS_MAX_AVAILABILITY_DAYS,
    consentVersion: value.MEETINGS_CONSENT_VERSION,
    retentionDays: value.MEETINGS_RETENTION_DAYS,
    proposalTtlMinutes: value.MEETINGS_PROPOSAL_TTL_MINUTES,
    calendarLeaseSeconds: value.MEETINGS_CALENDAR_LEASE_SECONDS,
  };
}
