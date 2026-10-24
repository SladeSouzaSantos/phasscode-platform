import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { CalendarConfig } from '../../shared-config/src/calendar.js';
import { AppError } from '../../../apps/orbe-node/src/domain/errors.js';

export interface BusyInterval {
  start: Date;
  end: Date;
}
export interface CalendarEventInput {
  meetingId: string;
  version: number;
  start: Date;
  end: Date;
  timeZone: string;
  attendee: { name: string; email: string };
  topic: string;
  bufferMinutes?: number;
}
export interface CalendarPort {
  readonly simulated: boolean;
  freeBusy(start: Date, end: Date): Promise<BusyInterval[]>;
  ensureEvent(input: CalendarEventInput): Promise<{ eventId: string; htmlLink?: string }>;
  cancelEvent(input: {
    meetingId: string;
    version: number;
    eventId?: string;
    requireEventEvidence?: boolean;
  }): Promise<void>;
}
export function googleEventId(meetingId: string): string {
  if (!z.uuid().safeParse(meetingId).success) throw new Error('Identificador de reunião inválido.');
  return `m${meetingId.replaceAll('-', '').toLowerCase()}`;
}
const unavailable = () =>
  new AppError('CALENDAR_UNAVAILABLE', 503, 'O calendário está temporariamente indisponível.');
const mismatch = () =>
  new AppError('CALENDAR_EVENT_MISMATCH', 409, 'O evento existente não corresponde à reunião.');
const reconciliationPending = () =>
  new AppError(
    'CALENDAR_RECONCILIATION_PENDING',
    503,
    'A criação anterior ainda exige reconciliação. A reserva permanece protegida.',
    5,
  );
const eventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  htmlLink: z.url().optional(),
  start: z.object({ dateTime: z.iso.datetime({ offset: true }) }),
  end: z.object({ dateTime: z.iso.datetime({ offset: true }) }),
  extendedProperties: z.object({ private: z.object({ meetingId: z.string() }) }),
});
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 262144) throw unavailable();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export class GoogleCalendarAdapter implements CalendarPort {
  readonly simulated = false;
  constructor(
    private readonly config: Pick<
      CalendarConfig,
      'GOOGLE_CALENDAR_ID' | 'GOOGLE_CALENDAR_HTTP_TIMEOUT_MS'
    >,
    private readonly accessToken: () => Promise<string>,
    private readonly transport: typeof fetch = fetch,
    private readonly baseUrl = 'https://www.googleapis.com/calendar/v3',
  ) {}
  private async request(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<{ status: number; data?: unknown }> {
    try {
      const token = await this.accessToken();
      const response = await this.transport(`${this.baseUrl}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.GOOGLE_CALENDAR_HTTP_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if ([404, 409, 410, 204].includes(response.status)) {
        await response.body?.cancel();
        return { status: response.status };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw unavailable();
      }
      return { status: response.status, data: await boundedJson(response) };
    } catch {
      throw unavailable();
    }
  }
  private eventPath(id: string): string {
    return `/calendars/${encodeURIComponent(this.config.GOOGLE_CALENDAR_ID!)}/events/${id}`;
  }
  async freeBusy(start: Date, end: Date): Promise<BusyInterval[]> {
    if (
      !Number.isFinite(start.getTime()) ||
      end <= start ||
      // Public queries allow 31 days plus the configured buffer on both ends.
      end.getTime() - start.getTime() > 32 * 86400000
    )
      throw unavailable();
    const response = await this.request('/freeBusy', 'POST', {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: this.config.GOOGLE_CALENDAR_ID }],
    });
    const parsed = z
      .object({
        calendars: z.record(
          z.string(),
          z.object({
            busy: z
              .array(
                z.object({
                  start: z.iso.datetime({ offset: true }),
                  end: z.iso.datetime({ offset: true }),
                }),
              )
              .max(5000),
            errors: z.array(z.unknown()).optional(),
          }),
        ),
      })
      .safeParse(response.data);
    const calendar = parsed.success
      ? parsed.data.calendars[this.config.GOOGLE_CALENDAR_ID!]
      : undefined;
    if (!calendar || calendar.errors?.length) throw unavailable();
    return calendar.busy.map((interval) => {
      const result = { start: new Date(interval.start), end: new Date(interval.end) };
      if (result.end <= result.start) throw unavailable();
      return result;
    });
  }
  private verify(data: unknown, input: CalendarEventInput): { eventId: string; htmlLink?: string } {
    const parsed = eventSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.id !== googleEventId(input.meetingId) ||
      parsed.data.status === 'cancelled' ||
      parsed.data.extendedProperties.private.meetingId !== input.meetingId ||
      new Date(parsed.data.start.dateTime).getTime() !== input.start.getTime() ||
      new Date(parsed.data.end.dateTime).getTime() !== input.end.getTime()
    )
      throw mismatch();
    return {
      eventId: parsed.data.id,
      ...(parsed.data.htmlLink ? { htmlLink: parsed.data.htmlLink } : {}),
    };
  }
  async ensureEvent(input: CalendarEventInput): Promise<{ eventId: string; htmlLink?: string }> {
    const id = googleEventId(input.meetingId);
    const existing = await this.request(this.eventPath(id));
    if (existing.status === 200) return this.verify(existing.data, input);
    if (existing.status !== 404) throw mismatch();
    const buffer = (input.bufferMinutes ?? 0) * 60000;
    const reservedStart = new Date(input.start.getTime() - buffer);
    const reservedEnd = new Date(input.end.getTime() + buffer);
    const busy = await this.freeBusy(reservedStart, reservedEnd);
    if (busy.some((interval) => interval.start < reservedEnd && interval.end > reservedStart))
      throw new AppError('CALENDAR_CONFLICT', 409, 'O horário deixou de estar disponível.');
    const created = await this.request(
      `/calendars/${encodeURIComponent(this.config.GOOGLE_CALENDAR_ID!)}/events?sendUpdates=none`,
      'POST',
      {
        id,
        summary: 'Reunião PHASSCODE',
        description: input.topic,
        start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
        end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
        attendees: [{ email: input.attendee.email, displayName: input.attendee.name }],
        extendedProperties: { private: { meetingId: input.meetingId } },
      },
    );
    if (created.status === 409) {
      const verified = await this.request(this.eventPath(id));
      return this.verify(verified.data, input);
    }
    if (created.status !== 200 && created.status !== 201) throw unavailable();
    // Read-after-write confirms identity and times before the local state becomes CONFIRMED.
    const verified = await this.request(this.eventPath(id));
    return this.verify(verified.data, input);
  }
  async cancelEvent(input: {
    meetingId: string;
    version: number;
    eventId?: string;
    requireEventEvidence?: boolean;
  }): Promise<void> {
    const id = googleEventId(input.meetingId);
    if (input.eventId && input.eventId !== id) throw mismatch();
    const existing = await this.request(this.eventPath(id));
    if (existing.status === 404) {
      // Absence now is not evidence that an older timed-out insert cannot commit later.
      if (input.requireEventEvidence) throw reconciliationPending();
      return;
    }
    if (existing.status === 410) return;
    if (existing.status !== 200) throw unavailable();
    if (
      typeof existing.data === 'object' &&
      existing.data !== null &&
      'status' in existing.data &&
      existing.data.status === 'cancelled'
    )
      return;
    const owned = eventSchema.safeParse(existing.data);
    if (
      !owned.success ||
      owned.data.id !== id ||
      owned.data.extendedProperties.private.meetingId !== input.meetingId
    )
      throw mismatch();
    const result = await this.request(this.eventPath(id), 'DELETE');
    if (![204, 404, 410].includes(result.status)) throw unavailable();
    const verified = await this.request(this.eventPath(id));
    if (![404, 410].includes(verified.status)) {
      if (!(
        typeof verified.data === 'object' &&
        verified.data !== null &&
        'status' in verified.data &&
        verified.data.status === 'cancelled'
      ))
        throw unavailable();
    }
  }
}

export class FakeCalendarAdapter implements CalendarPort {
  readonly simulated = true;
  readonly events = new Map<string, CalendarEventInput>();
  private readonly cancelledEvents = new Set<string>();
  async freeBusy(start: Date, end: Date): Promise<BusyInterval[]> {
    return [...this.events.values()]
      .filter((item) => item.start < end && item.end > start)
      .map(({ start, end }) => ({ start, end }));
  }
  async ensureEvent(input: CalendarEventInput): Promise<{ eventId: string }> {
    if (this.cancelledEvents.has(input.meetingId)) throw mismatch();
    const existing = this.events.get(input.meetingId);
    if (
      existing &&
      (existing.start.getTime() !== input.start.getTime() ||
        existing.end.getTime() !== input.end.getTime())
    )
      throw mismatch();
    const buffer = (input.bufferMinutes ?? 0) * 60000;
    if (
      !existing &&
      (
        await this.freeBusy(
          new Date(input.start.getTime() - buffer),
          new Date(input.end.getTime() + buffer),
        )
      ).length
    )
      throw new AppError('CALENDAR_CONFLICT', 409, 'Horário indisponível.');
    this.events.set(input.meetingId, input);
    return { eventId: googleEventId(input.meetingId) };
  }
  async cancelEvent(input: {
    meetingId: string;
    version: number;
    eventId?: string;
    requireEventEvidence?: boolean;
  }): Promise<void> {
    if (
      input.requireEventEvidence &&
      !this.events.has(input.meetingId) &&
      !this.cancelledEvents.has(input.meetingId)
    )
      throw reconciliationPending();
    if (this.events.has(input.meetingId)) this.cancelledEvents.add(input.meetingId);
    this.events.delete(input.meetingId);
  }
}
export function createCalendar(config: CalendarConfig): CalendarPort {
  if (config.GOOGLE_CALENDAR_MODE === 'fake' && config.NODE_ENV !== 'production')
    return new FakeCalendarAdapter();
  if (config.GOOGLE_CALENDAR_MODE !== 'google')
    return {
      simulated: false,
      freeBusy: async () => {
        throw unavailable();
      },
      ensureEvent: async () => {
        throw unavailable();
      },
      cancelEvent: async () => {
        throw unavailable();
      },
    };
  const oauth = new OAuth2Client({
    clientId: config.GOOGLE_CALENDAR_CLIENT_ID!,
    clientSecret: config.GOOGLE_CALENDAR_CLIENT_SECRET!,
    transporterOptions: { timeout: config.GOOGLE_CALENDAR_HTTP_TIMEOUT_MS, retry: false },
  });
  oauth.setCredentials({ refresh_token: config.GOOGLE_CALENDAR_REFRESH_TOKEN! });
  return new GoogleCalendarAdapter(config, async () => {
    const result = await oauth.getAccessToken();
    if (!result.token) throw unavailable();
    return result.token;
  });
}
