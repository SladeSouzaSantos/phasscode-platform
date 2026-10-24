import type { AuthSessionResponse } from '../packages/contracts/src/auth.js';
import type {
  MeetingAdminListQuery,
  MeetingProposalInput,
  MeetingProposalResponse,
  MeetingRequestInput,
  MeetingRequestResponse,
  MeetingStatusResponse,
} from '../packages/contracts/src/meetings.js';
import type { z } from 'zod';
import type {
  meetingAdminListResponseSchema,
  meetingAvailabilityResponseSchema,
} from '../packages/contracts/src/meetings.js';

export class Phase3HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Operação não concluída (${status}, ${code}).`);
  }
}

// Copie/adapte para o frontend. A instância guarda somente sessão/CSRF em memória.
// Cookies HttpOnly são administrados pelo navegador; não há armazenamento de JWT.
export class Phase3Client {
  private session: AuthSessionResponse | undefined;
  private refreshing: Promise<AuthSessionResponse> | undefined;

  constructor(private readonly baseUrl: string) {}

  get googleLoginUrl() {
    return `${this.baseUrl}/api/v1/auth/login/google`;
  }

  private async call<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, options);
    if (!response.ok) {
      if (response.status === 401) this.session = undefined;
      let code = 'REQUEST_FAILED';
      try {
        const body = await response.json();
        if (typeof body?.error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(body.error.code))
          code = body.error.code;
      } catch {
        /* Never include response bodies in errors. */
      }
      throw new Phase3HttpError(response.status, code);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  async getSession(): Promise<AuthSessionResponse> {
    const session = await this.call<AuthSessionResponse>('/api/v1/auth/session', {
      credentials: 'include',
    });
    this.session = session;
    return session;
  }

  private async mutation<T>(path: string): Promise<T> {
    if (this.refreshing) await this.refreshing;
    const session = this.session ?? (await this.getSession());
    if (!session.authenticated || !session.csrfToken)
      throw new Phase3HttpError(401, 'AUTH_REQUIRED');
    return this.call(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': session.csrfToken },
    });
  }

  refresh(): Promise<AuthSessionResponse> {
    if (this.refreshing) return this.refreshing;
    // Schedule after assigning the promise; concurrent callers share exactly one rotation.
    const refresh = Promise.resolve().then(async () => {
      const session = this.session ?? (await this.getSession());
      if (!session.authenticated || !session.csrfToken)
        throw new Phase3HttpError(401, 'AUTH_REQUIRED');
      const rotated = await this.call<AuthSessionResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': session.csrfToken },
      });
      this.session = rotated;
      return rotated;
    });
    this.refreshing = refresh;
    void refresh.then(
      () => {
        if (this.refreshing === refresh) this.refreshing = undefined;
      },
      () => {
        if (this.refreshing === refresh) this.refreshing = undefined;
      },
    );
    return refresh;
  }

  async logout(): Promise<void> {
    await this.mutation('/api/v1/auth/logout');
    this.session = undefined;
  }

  availability(from: string, to: string) {
    return this.call<z.infer<typeof meetingAvailabilityResponseSchema>>(
      `/api/v1/meetings/availability?${new URLSearchParams({ from, to })}`,
      { credentials: 'omit' },
    );
  }

  prepareProposal(input: MeetingProposalInput) {
    return this.call<MeetingProposalResponse>('/api/v1/meetings/proposals', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  // Call only from the visitor's explicit confirmation. Preserve key + body on retry.
  confirmRequest(input: MeetingRequestInput, idempotencyKey: string) {
    return this.call<MeetingRequestResponse>('/api/v1/meetings/requests', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  }

  status(id: string, meetingToken: string) {
    return this.call<MeetingStatusResponse>(
      `/api/v1/meetings/requests/${encodeURIComponent(id)}/status`,
      { credentials: 'omit', headers: { 'X-Meeting-Token': meetingToken } },
    );
  }

  listMeetings(query: Partial<MeetingAdminListQuery> = {}) {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) parameters.set(key, String(value));
    return this.call<z.infer<typeof meetingAdminListResponseSchema>>(
      `/api/v1/admin/meetings?${parameters}`,
      { credentials: 'include' },
    );
  }

  decide(id: string, action: 'approve' | 'reject' | 'cancel') {
    return this.mutation<MeetingStatusResponse>(
      `/api/v1/admin/meetings/${encodeURIComponent(id)}/${action}`,
    );
  }
}
