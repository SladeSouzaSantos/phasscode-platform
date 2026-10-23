import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  meetingAdminListQuerySchema,
  meetingProposalInputSchema,
  meetingRequestInputSchema,
  type MeetingAdminItem,
  type MeetingAdminListQuery,
  type MeetingProposalInput,
  type MeetingProposalResponse,
  type MeetingRequestInput,
  type MeetingRequestResponse,
  type MeetingStatusResponse,
} from '../../../../packages/contracts/src/meetings.js';
import type { MeetingConfig } from '../../../../packages/shared-config/src/meetings.js';
import { AppError } from '../domain/errors.js';
import type {
  BusyInterval,
  CalendarPort,
  MeetingCursor,
  MeetingRecord,
  MeetingStore,
} from './ports.js';

export const hashMeetingSecret = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const unavailable = () =>
  new AppError('MEETING_NOT_FOUND', 404, 'Solicitação indisponível ou token inválido.');
const invalidSlot = () =>
  new AppError(
    'MEETING_SLOT_UNAVAILABLE',
    409,
    'O horário não está disponível. Consulte a disponibilidade novamente.',
  );
const cursorSchema = z.strictObject({ createdAt: z.iso.datetime(), id: z.uuid() });
export class MeetingService {
  private readonly dateFormatter: Intl.DateTimeFormat;
  constructor(
    private readonly config: MeetingConfig,
    private readonly store: MeetingStore,
    private readonly calendar: CalendarPort,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
  }
  private enabled() {
    if (!this.config.enabled)
      throw new AppError('MEETINGS_DISABLED', 503, 'O agendamento está desabilitado.');
  }
  private parts(date: Date) {
    const parts = this.dateFormatter.formatToParts(date);
    const value = (key: string) => parts.find((part) => part.type === key)!.value;
    return {
      day: `${value('year')}-${value('month')}-${value('day')}`,
      weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value('weekday')) + 1,
      minute: Number(value('hour')) * 60 + Number(value('minute')),
      second: Number(value('second')),
    };
  }
  private validSlot(start: Date, now: Date) {
    const end = new Date(start.getTime() + this.config.durationMinutes * 60000);
    if (
      !Number.isFinite(start.getTime()) ||
      start.getMilliseconds() !== 0 ||
      start.getTime() < now.getTime() + this.config.minNoticeMinutes * 60000 ||
      end.getTime() > now.getTime() + this.config.maxHorizonDays * 86400000
    )
      return false;
    const local = this.parts(start);
    const localEnd = this.parts(end);
    return (
      this.config.workdays.includes(local.weekday) &&
      local.second === 0 &&
      local.day === localEnd.day &&
      local.minute >= this.config.workStartMinutes &&
      localEnd.minute <= this.config.workEndMinutes &&
      (local.minute - this.config.workStartMinutes) % this.config.slotStepMinutes === 0
    );
  }
  private conflict(start: Date, end: Date, busy: BusyInterval[]) {
    const buffer = this.config.bufferMinutes * 60000;
    return busy.some(
      (interval) =>
        start.getTime() < interval.end.getTime() + buffer &&
        end.getTime() + buffer > interval.start.getTime(),
    );
  }
  private async checkExternal(start: Date, end: Date) {
    const buffer = this.config.bufferMinutes * 60000;
    const busy = await this.calendar.freeBusy(
      new Date(start.getTime() - buffer),
      new Date(end.getTime() + buffer),
    );
    if (this.conflict(start, end, busy)) throw invalidSlot();
  }
  async availability(from: string, to: string) {
    this.enabled();
    const start = new Date(from);
    const end = new Date(to);
    const now = this.clock();
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > this.config.maxAvailabilityDays * 86400000 ||
      start.getTime() < now.getTime() - 60000 ||
      end.getTime() > now.getTime() + this.config.maxHorizonDays * 86400000
    )
      throw new AppError(
        'INVALID_AVAILABILITY_RANGE',
        400,
        'Informe um intervalo futuro dentro do horizonte e do limite de consulta.',
      );
    const buffer = this.config.bufferMinutes * 60000;
    const [external, internal] = await Promise.all([
      this.calendar.freeBusy(new Date(start.getTime() - buffer), new Date(end.getTime() + buffer)),
      this.store.busy(new Date(start.getTime() - buffer), new Date(end.getTime() + buffer)),
    ]);
    const slots: { start: string; end: string }[] = [];
    // Iterate instants, then apply local policy: DST gaps/repeated hours are never invented.
    for (
      let time = Math.ceil(start.getTime() / 60000) * 60000;
      time + this.config.durationMinutes * 60000 <= end.getTime();
      time += 60000
    ) {
      const slot = new Date(time);
      const finish = new Date(time + this.config.durationMinutes * 60000);
      if (
        this.validSlot(slot, now) &&
        !this.conflict(slot, finish, external) &&
        !this.conflict(slot, finish, internal)
      )
        slots.push({ start: slot.toISOString(), end: finish.toISOString() });
      if (slots.length >= 1000) break;
    }
    return {
      timeZone: this.config.timeZone,
      durationMinutes: this.config.durationMinutes,
      simulated: this.calendar.simulated,
      slots,
    };
  }
  async prepareProposal(input: MeetingProposalInput): Promise<MeetingProposalResponse> {
    this.enabled();
    const parsed = meetingProposalInputSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError('INVALID_REQUEST', 400, 'Informe nome, e-mail, assunto e início válidos.');
    const now = this.clock();
    const start = new Date(parsed.data.start);
    const end = new Date(start.getTime() + this.config.durationMinutes * 60000);
    if (!this.validSlot(start, now)) throw invalidSlot();
    await this.checkExternal(start, end);
    if (
      this.conflict(
        start,
        end,
        await this.store.busy(
          new Date(start.getTime() - this.config.bufferMinutes * 60000),
          new Date(end.getTime() + this.config.bufferMinutes * 60000),
        ),
      )
    )
      throw invalidSlot();
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + this.config.proposalTtlMinutes * 60000);
    const summary = {
      ...parsed.data,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: this.config.timeZone,
    };
    await this.store.createProposal(
      {
        ...summary,
        start,
        end,
        id,
        tokenHash: hashMeetingSecret(token),
        consentVersion: this.config.consentVersion,
        expiresAt,
      },
      now,
    );
    return {
      proposalId: id,
      confirmationToken: token,
      expiresAt: expiresAt.toISOString(),
      summary,
      consentVersion: this.config.consentVersion,
      simulated: this.calendar.simulated,
    };
  }
  async request(
    input: MeetingRequestInput,
    idempotencyKey: string,
  ): Promise<MeetingRequestResponse> {
    this.enabled();
    const parsed = meetingRequestInputSchema.safeParse(input);
    if (!parsed.success || !/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey))
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Confirme a proposta, o consentimento e uma chave de idempotência válida.',
      );
    const data = parsed.data;
    const keyHash = hashMeetingSecret(idempotencyKey);
    const tokenHash = hashMeetingSecret(data.confirmationToken);
    const bodyHash = hashMeetingSecret(
      JSON.stringify({
        proposalId: data.proposalId,
        tokenHash,
        consent: true,
        consentVersion: data.consentVersion,
      }),
    );
    const previous = await this.store.findIdempotent(keyHash, bodyHash);
    if (previous) return { ...this.public(previous), meetingToken: data.confirmationToken };
    const proposal = await this.store.getProposal(data.proposalId, tokenHash);
    const now = this.clock();
    if (!proposal || proposal.expiresAt <= now || proposal.consentVersion !== data.consentVersion)
      throw unavailable();
    if (!this.validSlot(proposal.start, now)) throw invalidSlot();
    await this.checkExternal(proposal.start, proposal.end);
    if (
      this.conflict(
        proposal.start,
        proposal.end,
        await this.store.busy(
          new Date(proposal.start.getTime() - this.config.bufferMinutes * 60000),
          new Date(proposal.end.getTime() + this.config.bufferMinutes * 60000),
        ),
      )
    )
      throw invalidSlot();
    const meeting = await this.store.consumeProposal({
      proposalId: proposal.id,
      tokenHash,
      keyHash,
      bodyHash,
      consentVersion: data.consentVersion,
      now,
    });
    return { ...this.public(meeting), meetingToken: data.confirmationToken };
  }
  private public(meeting: MeetingRecord): MeetingStatusResponse {
    return {
      id: meeting.id,
      status: meeting.status,
      start: meeting.start.toISOString(),
      end: meeting.end.toISOString(),
      timeZone: meeting.timeZone,
      updatedAt: meeting.updatedAt.toISOString(),
    };
  }
  async status(id: string, token: string) {
    this.enabled();
    if (!z.uuid().safeParse(id).success || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable();
    const meeting = await this.store.getPrivate(id, hashMeetingSecret(token));
    if (!meeting) throw unavailable();
    return this.public(meeting);
  }
  async list(input: MeetingAdminListQuery) {
    this.enabled();
    const parsed = meetingAdminListQuerySchema.safeParse(input);
    if (!parsed.success) throw new AppError('INVALID_REQUEST', 400, 'Paginação inválida.');
    let cursor: MeetingCursor | undefined;
    if (parsed.data.cursor) {
      try {
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(parsed.data.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new AppError('INVALID_REQUEST', 400, 'Cursor inválido.');
      }
    }
    const rows = await this.store.list({
      limit: parsed.data.limit + 1,
      ...(cursor ? { cursor } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });
    const more = rows.length > parsed.data.limit;
    const page = rows.slice(0, parsed.data.limit);
    const items: MeetingAdminItem[] = page.map((row) => ({
      ...this.public(row),
      name: row.name,
      email: row.email,
      topic: row.topic,
      createdAt: row.createdAt.toISOString(),
      version: row.version,
      failureCode: row.failureCode,
    }));
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
            ).toString('base64url')
          : null,
    };
  }
  private async get(id: string) {
    if (!z.uuid().safeParse(id).success) throw unavailable();
    const row = await this.store.get(id);
    if (!row) throw unavailable();
    return row;
  }
  async approve(id: string, actorId: string) {
    this.enabled();
    const row = await this.get(id);
    if (row.status === 'APPROVED' || row.status === 'CONFIRMED') return this.public(row);
    if (!['PENDING', 'FAILED'].includes(row.status))
      throw new AppError('MEETING_INVALID_STATE', 409, 'A solicitação não permite aprovação.');
    if (!this.validSlot(row.start, this.clock())) throw invalidSlot();
    await this.checkExternal(row.start, row.end);
    return this.public(
      await this.store.approve(id, row.version, actorId, this.config.bufferMinutes, this.clock()),
    );
  }
  async reject(id: string, actorId: string) {
    this.enabled();
    await this.get(id);
    return this.public(await this.store.transition(id, 'REJECTED', actorId, this.clock()));
  }
  async cancel(id: string, actorId: string) {
    this.enabled();
    await this.get(id);
    return this.public(await this.store.transition(id, 'CANCELLED', actorId, this.clock()));
  }
  async processCalendarCreate(id: string): Promise<void> {
    this.enabled();
    const lease = await this.store.claimCalendar(
      id,
      'CREATE',
      this.config.calendarLeaseSeconds,
      this.clock(),
    );
    if (!lease) {
      const current = await this.get(id);
      if (current.status === 'APPROVED')
        throw new AppError(
          'MEETING_OPERATION_BUSY',
          503,
          'Operação de calendário em andamento.',
          5,
        );
      return;
    }
    const row = lease.meeting;
    try {
      if (row.start <= this.clock()) throw invalidSlot();
      // Persist before any remote write: client timeout does not prove Google aborted it.
      if (!(await this.store.calendarCreateStarted(id, lease.leaseId, this.clock())))
        throw new AppError('CALENDAR_PENDING', 503, 'Operação de calendário em andamento.', 5);
      // ensureEvent performs FreeBusy immediately before insert, after checking its deterministic ID.
      const result = await this.calendar.ensureEvent({
        meetingId: row.id,
        version: row.version,
        start: row.start,
        end: row.end,
        timeZone: row.timeZone,
        attendee: { name: row.name, email: row.email },
        topic: row.topic,
        bufferMinutes: this.config.bufferMinutes,
      });
      const confirmed = await this.store.calendarCreated(
        id,
        lease.leaseId,
        result.eventId,
        this.clock(),
      );
      if (!confirmed && (await this.get(id)).status === 'CANCELLED')
        await this.processCalendarCancel(id);
      else if (!confirmed && (await this.get(id)).status === 'APPROVED')
        throw new AppError('CALENDAR_PENDING', 503, 'Operação de calendário em andamento.', 5);
    } catch (error) {
      const terminal = error instanceof AppError && error.status === 409;
      await this.store.calendarFailed(
        id,
        lease.leaseId,
        terminal && error instanceof AppError && error.code === 'CALENDAR_EVENT_MISMATCH'
          ? 'CALENDAR_EVENT_MISMATCH'
          : terminal && error instanceof AppError && error.code === 'CALENDAR_CONFLICT'
            ? 'CALENDAR_CONFLICT'
            : 'CALENDAR_UNAVAILABLE',
        terminal,
        this.clock(),
        terminal &&
          error instanceof AppError &&
          error.code === 'CALENDAR_CONFLICT' &&
          !row.calendarCreateUncertain,
      );
      if (!terminal)
        throw new AppError(
          'CALENDAR_UNAVAILABLE',
          503,
          'Integração de calendário indisponível.',
          5,
        );
    }
  }
  async processCalendarCancel(id: string): Promise<void> {
    this.enabled();
    const lease = await this.store.claimCalendar(
      id,
      'CANCEL',
      this.config.calendarLeaseSeconds,
      this.clock(),
    );
    if (!lease) {
      const current = await this.get(id);
      if (current.status === 'CANCELLED' && !current.calendarCancelledAt)
        throw new AppError('CALENDAR_PENDING', 503, 'Operação de calendário em andamento.', 5);
      return;
    }
    try {
      await this.calendar.cancelEvent({
        meetingId: id,
        version: lease.meeting.version,
        ...(lease.meeting.externalEventId ? { eventId: lease.meeting.externalEventId } : {}),
        requireEventEvidence:
          lease.meeting.calendarCreateUncertain && !lease.meeting.externalEventId,
      });
      await this.store.calendarCancelled(id, lease.leaseId, this.clock());
      const current = await this.get(id);
      if (current.status === 'CANCELLED' && !current.calendarCancelledAt)
        throw new AppError('CALENDAR_PENDING', 503, 'Operação de calendário em andamento.', 5);
    } catch (error) {
      const reconciliationPending =
        error instanceof AppError && error.code === 'CALENDAR_RECONCILIATION_PENDING';
      await this.store.calendarFailed(
        id,
        lease.leaseId,
        reconciliationPending ? 'CALENDAR_RECONCILIATION_PENDING' : 'CALENDAR_UNAVAILABLE',
        false,
        this.clock(),
      );
      if (reconciliationPending) throw error;
      throw new AppError('CALENDAR_UNAVAILABLE', 503, 'Integração de calendário indisponível.', 5);
    }
  }
  async getNotification(id: string) {
    return this.store.get(id);
  }
  async processCalendarFailure(id: string, code: string, expectedVersion: number) {
    const safeCode = /^[A-Z_]{1,80}$/.test(code) ? code : 'CALENDAR_RETRIES_EXHAUSTED';
    const changed = await this.store.exhaustCalendar(id, safeCode, expectedVersion, this.clock());
    if (changed) return;
    const current = await this.get(id);
    if (current.version !== expectedVersion) return;
    if (
      current.status === 'APPROVED' ||
      (current.status === 'CANCELLED' &&
        current.failureCode !== safeCode &&
        !current.calendarCancelledAt)
    )
      throw new AppError('CALENDAR_PENDING', 503, 'Operação de calendário em andamento.', 5);
  }
  async retain() {
    const now = this.clock();
    return this.store.retain(new Date(now.getTime() - this.config.retentionDays * 86400000), now);
  }
}
