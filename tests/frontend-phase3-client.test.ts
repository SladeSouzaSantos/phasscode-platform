import { afterEach, expect, it, vi } from 'vitest';
import { Phase3Client } from '../examples/phase3-client.js';
import { OrbeClient } from '../examples/frontend-client.js';

afterEach(() => vi.unstubAllGlobals());
const session = (csrfToken: string) => ({
  authenticated: true,
  user: {
    id: 'synthetic-user',
    email: 'visitor@example.test',
    displayName: 'Visitor',
    roles: ['user'],
  },
  csrfToken,
  expiresAt: '2026-12-01T12:00:00Z',
});

it('coalesces concurrent refreshes and waits for the new CSRF before logout', async () => {
  const initial = session('A'.repeat(43));
  const rotated = session('B'.repeat(43));
  let release: (() => void) | undefined;
  const transport = vi.fn(async (url: string, options?: RequestInit) => {
    expect(options?.credentials).toBe('include');
    if (url.endsWith('/session')) return Response.json(initial);
    if (url.endsWith('/refresh')) {
      expect(options?.headers).toEqual({ 'X-CSRF-Token': initial.csrfToken });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return Response.json(rotated);
    }
    expect(url).toContain('/logout');
    expect(options?.headers).toEqual({ 'X-CSRF-Token': rotated.csrfToken });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', transport);
  const client = new Phase3Client('https://api.example.test');
  const first = client.refresh();
  const second = client.refresh();
  const logout = client.logout();
  expect(first).toBe(second);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(transport).toHaveBeenCalledTimes(2);
  release!();
  await Promise.all([first, second, logout]);
  expect(transport).toHaveBeenCalledTimes(3);
});

it('requires an authenticated session before attempting an administrative mutation', async () => {
  const transport = vi.fn(async () =>
    Response.json({ authenticated: false, csrfToken: null, user: null, expiresAt: null }),
  );
  vi.stubGlobal('fetch', transport);
  const client = new Phase3Client('https://api.example.test');
  await expect(client.decide('synthetic-meeting', 'approve')).rejects.toMatchObject({
    status: 401,
    code: 'AUTH_REQUIRED',
  });
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not confirm a prepared proposal automatically and keeps status tokens out of URLs', async () => {
  const transport = vi.fn(async () => Response.json({}));
  vi.stubGlobal('fetch', transport);
  const client = new Phase3Client('https://api.example.test');
  await client.prepareProposal({
    start: '2026-12-01T12:00:00Z',
    name: 'Synthetic',
    email: 'visitor@example.test',
    topic: 'Test',
  });
  expect(transport).toHaveBeenCalledTimes(1);
  const input = {
    proposalId: 'synthetic-proposal',
    confirmationToken: 'S'.repeat(43),
    consent: true as const,
    consentVersion: 'meetings-v1',
  };
  await client.confirmRequest(input, 'same-idempotency-key');
  await client.confirmRequest(input, 'same-idempotency-key');
  const requests = transport.mock.calls as unknown as [string, RequestInit][];
  expect(requests[1]?.[1].headers).toEqual(requests[2]?.[1].headers);
  expect(requests[1]?.[1].body).toEqual(requests[2]?.[1].body);
  await client.status('synthetic-meeting', input.confirmationToken);
  const last = requests.at(-1)!;
  expect(last[0]).not.toContain(input.confirmationToken);
  expect(last[1].headers).toEqual({ 'X-Meeting-Token': input.confirmationToken });
  expect(last[1].credentials).toBe('omit');
});

it('preserves the default chat headers and enables actions only in the updated client', async () => {
  const transport = vi.fn(async () =>
    Response.json({
      conversationId: 'synthetic',
      conversationToken: 'C'.repeat(43),
      answer: 'Test',
    }),
  );
  vi.stubGlobal('fetch', transport);
  await new OrbeClient('https://api.example.test').send('oi');
  await new OrbeClient('https://api.example.test', { meetingActions: true }).send('oi');
  const requests = transport.mock.calls as unknown as [string, RequestInit][];
  expect(requests[0]?.[1].headers).toEqual({ 'Content-Type': 'application/json' });
  expect(requests[1]?.[1].headers).toEqual({
    'Content-Type': 'application/json',
    'X-Orbe-Capabilities': 'meetings-v1',
  });
});

it('excludes private error bodies from exceptions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: { code: 'CALENDAR_UNAVAILABLE', message: 'PRIVATE_PROVIDER_DETAIL' } },
        { status: 503 },
      ),
    ),
  );
  const client = new Phase3Client('https://api.example.test');
  await expect(client.availability('from', 'to')).rejects.toThrow('CALENDAR_UNAVAILABLE');
  await expect(client.availability('from', 'to')).rejects.not.toThrow('PRIVATE_PROVIDER_DETAIL');
});
