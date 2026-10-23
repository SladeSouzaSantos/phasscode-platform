import type { MeetingStatus } from '../../../../packages/contracts/src/meetings.js';

export interface BusyInterval {
  start: Date;
  end: Date;
}
export interface CalendarPort {
  readonly simulated: boolean;
  freeBusy(start: Date, end: Date): Promise<BusyInterval[]>;
  ensureEvent(input: {
    meetingId: string;
    version: number;
    start: Date;
    end: Date;
    timeZone: string;
    attendee: { name: string; email: string };
    topic: string;
    bufferMinutes?: number;
  }): Promise<{ eventId: string; htmlLink?: string }>;
  cancelEvent(input: {
    meetingId: string;
    version: number;
    eventId?: string;
    requireEventEvidence?: boolean;
  }): Promise<void>;
}
export interface MeetingRecord {
  id: string;
  status: MeetingStatus;
  name: string;
  email: string;
  topic: string;
  start: Date;
  end: Date;
  timeZone: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  tokenHash: string;
  failureCode: string | null;
  externalEventId: string | null;
  calendarCreateUncertain: boolean;
  calendarCancelledAt: Date | null;
}
export interface ProposalRecord {
  id: string;
  tokenHash: string;
  name: string;
  email: string;
  topic: string;
  start: Date;
  end: Date;
  timeZone: string;
  consentVersion: string;
  expiresAt: Date;
}
export type MeetingNotificationData = MeetingRecord;
export interface MeetingCursor {
  createdAt: string;
  id: string;
}
export interface CalendarLease {
  meeting: MeetingRecord;
  leaseId: string;
}
export interface MeetingStore {
  createProposal(proposal: ProposalRecord, now: Date): Promise<void>;
  getProposal(id: string, tokenHash: string): Promise<ProposalRecord | null>;
  findIdempotent(keyHash: string, bodyHash: string): Promise<MeetingRecord | null>;
  consumeProposal(input: {
    proposalId: string;
    tokenHash: string;
    keyHash: string;
    bodyHash: string;
    consentVersion: string;
    now: Date;
  }): Promise<MeetingRecord>;
  get(id: string): Promise<MeetingRecord | null>;
  getPrivate(id: string, tokenHash: string): Promise<MeetingRecord | null>;
  busy(start: Date, end: Date): Promise<BusyInterval[]>;
  list(input: {
    limit: number;
    cursor?: MeetingCursor;
    status?: MeetingStatus;
  }): Promise<MeetingRecord[]>;
  approve(
    id: string,
    version: number,
    actorId: string,
    bufferMinutes: number,
    now: Date,
  ): Promise<MeetingRecord>;
  transition(
    id: string,
    target: 'REJECTED' | 'CANCELLED',
    actorId: string,
    now: Date,
  ): Promise<MeetingRecord>;
  claimCalendar(
    id: string,
    kind: 'CREATE' | 'CANCEL',
    leaseSeconds: number,
    now: Date,
  ): Promise<CalendarLease | null>;
  calendarCreateStarted(id: string, leaseId: string, now: Date): Promise<boolean>;
  calendarCreated(id: string, leaseId: string, eventId: string, now: Date): Promise<boolean>;
  calendarCancelled(id: string, leaseId: string, now: Date): Promise<void>;
  calendarFailed(
    id: string,
    leaseId: string,
    code: string,
    terminal: boolean,
    now: Date,
    clearCreateUncertainty?: boolean,
  ): Promise<void>;
  exhaustCalendar(id: string, code: string, expectedVersion: number, now: Date): Promise<boolean>;
  retain(cutoff: Date, now: Date): Promise<number>;
}
