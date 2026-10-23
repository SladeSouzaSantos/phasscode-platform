import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Runs inside the selected image, on a private network with fresh synthetic dependencies.
const api = process.env.PHASSCODE_TEST_API_URL;
assert.equal(api, 'http://api:3000', 'This probe is restricted to the disposable Compose API.');
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://synthetic:synthetic@postgres:5432/phasscode_phase3_test',
  'This probe requires its own synthetic database.',
);
assert.equal(process.env.GOOGLE_CALENDAR_MODE, 'fake');
assert.equal(process.env.NOTIFICATION_MODE, 'fake');

const call = async (path, init = {}) => {
  const response = await fetch(api + path, { ...init, signal: AbortSignal.timeout(10000) });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
};
const post = (path, body, headers = {}) =>
  call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const assertLegacy = (body, initial) => {
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      'conversationId',
      ...(initial ? ['conversationToken'] : []),
      'answer',
      'sources',
      'meta',
    ].sort(),
    'The legacy chat response must not gain optional actions without opt-in.',
  );
  assert.equal(body.meta.provider, 'mock');
  assert.equal(body.meta.simulated, true);
  assert.equal(typeof body.answer, 'string');
  assert.ok(body.answer.length);
  assert.ok(Array.isArray(body.sources));
};

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  statement_timeout: 5000,
});
try {
  const expected = JSON.parse(process.env.PHASSCODE_TEST_EXPECTED_MIGRATIONS);
  const applied = await pool.query('SELECT name,checksum FROM schema_migrations ORDER BY name');
  assert.deepEqual(
    Object.fromEntries(applied.rows.map(({ name, checksum }) => [name, checksum])),
    expected,
    'The image must apply exactly the migration files and checksums in this checkout.',
  );
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/ready')).status, 200);
  const first = await post('/api/v1/chat', { message: 'oi' });
  assert.equal(first.status, 200);
  assertLegacy(first.body, true);
  const continued = await post(
    '/api/v1/chat',
    { message: 'Quais suas habilidades?', conversationId: first.body.conversationId },
    { 'x-conversation-token': first.body.conversationToken },
  );
  assert.equal(continued.status, 200);
  assertLegacy(continued.body, false);
  assert.equal(
    (
      await post(
        '/api/v1/chat',
        { message: 'oi', conversationId: first.body.conversationId },
        { 'x-conversation-token': 'A'.repeat(43) },
      )
    ).status,
    404,
  );
  assert.equal((await call('/api/v1/auth/session')).body.authenticated, false);
  assert.equal((await call('/api/v1/me')).status, 401);
  assert.equal((await call('/api/v1/admin/meetings')).status, 401);
  const jwks = await call('/.well-known/jwks.json');
  assert.equal(jwks.status, 200);
  assert.ok(jwks.body.keys.length);
  assert.ok(jwks.body.keys.every((key) => !('d' in key) && key.alg === 'RS256'));

  const start = new Date(Date.now() + 2 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  if (start.getUTCDay() === 0) start.setUTCDate(start.getUTCDate() + 1);
  const availability = await call(
    `/api/v1/meetings/availability?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date(start.getTime() + 86400000).toISOString())}`,
  );
  assert.equal(availability.status, 200);
  assert.equal(availability.body.simulated, true);
  assert.ok(availability.body.slots.length);
  const proposal = await post('/api/v1/meetings/proposals', {
    start: availability.body.slots[0].start,
    name: 'Synthetic Docker Visitor',
    email: 'phase3-image@example.test',
    topic: 'Offline image qualification',
  });
  assert.equal(proposal.status, 201);
  assert.equal(proposal.body.simulated, true);
  const request = {
    proposalId: proposal.body.proposalId,
    confirmationToken: proposal.body.confirmationToken,
    consent: true,
    consentVersion: proposal.body.consentVersion,
  };
  const headers = { 'idempotency-key': randomUUID() };
  assert.equal(
    (await post('/api/v1/meetings/requests', { ...request, consent: false }, headers)).status,
    400,
  );
  const requested = await post('/api/v1/meetings/requests', request, headers);
  assert.equal(requested.status, 201);
  assert.equal(requested.body.status, 'PENDING');
  const retried = await post('/api/v1/meetings/requests', request, headers);
  assert.equal(retried.status, 201);
  assert.ok(retried.body.id === requested.body.id, 'A retry must preserve the meeting identity.');
  assert.equal((await call(`/api/v1/meetings/requests/${requested.body.id}/status`)).status, 404);
  const status = await call(`/api/v1/meetings/requests/${requested.body.id}/status`, {
    headers: { 'x-meeting-token': requested.body.meetingToken },
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.status, 'PENDING');
  assert.ok(!('name' in status.body) && !('email' in status.body) && !('topic' in status.body));

  let delivered = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const channels = await pool.query(
      `SELECT d.channel FROM notification_deliveries d JOIN meeting_outbox o ON o.id=d.outbox_id WHERE o.meeting_id=$1 AND d.status='SENT'`,
      [requested.body.id],
    );
    if (new Set(channels.rows.map(({ channel }) => channel)).size === 2) {
      delivered = true;
      break;
    }
    await delay(100);
  }
  assert.ok(delivered, 'The separate worker must process both fake notification channels.');
  const state = await pool.query(
    'SELECT status,reserved_start,calendar_create_uncertain FROM meetings WHERE id=$1',
    [requested.body.id],
  );
  assert.equal(state.rows[0].status, 'PENDING');
  assert.equal(state.rows[0].reserved_start, null);
  assert.equal(state.rows[0].calendar_create_uncertain, false);
  console.info(
    'PASS: enabled API/worker, legacy chat, private proposal/consent and fake delivery.',
  );
} finally {
  await pool.end();
}
