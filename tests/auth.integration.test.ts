import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPool } from '../packages/database/src/pool.js';
import { migrate } from '../packages/database/src/migrations.js';
import { PgAuthStore } from '../apps/orbe-node/src/auth/postgres.js';
import { authHash } from '../apps/orbe-node/src/auth/service.js';
import type {
  ExternalProfile,
  NewAuthSession,
  OAuthTransaction,
} from '../apps/orbe-node/src/auth/types.js';
import { authApp, authConfig, fakeGoogle, login, type FakeGoogle } from './auth-fixtures.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL obrigatório para integração auth descartável.');
const pool = createPool(url);
const userIds = new Set<string>();
const states = new Set<string>();
const apps: Array<{ close(): Promise<void> }> = [];
class TrackingStore extends PgAuthStore {
  override async findOrCreateUser(profile: ExternalProfile) {
    const user = await super.findOrCreateUser(profile);
    userIds.add(user.id);
    return user;
  }
  override async saveTransaction(transaction: OAuthTransaction) {
    states.add(transaction.stateHash);
    return super.saveTransaction(transaction);
  }
}
const store = new TrackingStore(pool);
let google: FakeGoogle;
beforeAll(async () => {
  await migrate(pool);
  google = await fakeGoogle();
});
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  if (google) await google.close();
  try {
    await pool.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_role_audit WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_user_roles WHERE user_id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_external_identities WHERE user_id=ANY($1::uuid[])', [
      [...userIds],
    ]);
    await pool.query('DELETE FROM auth_users WHERE id=ANY($1::uuid[])', [[...userIds]]);
    await pool.query('DELETE FROM auth_oauth_transactions WHERE state_hash::text=ANY($1::text[])', [
      [...states],
    ]);
  } finally {
    await pool.end();
  }
});
const profile = () => ({
  issuer: google.issuer,
  subject: randomUUID(),
  email: 'auth-integration@example.test',
  displayName: 'Synthetic user',
});
const newSession = (userId: string, familyId: string = randomUUID()): NewAuthSession => ({
  id: randomUUID(),
  userId,
  familyId,
  tokenHash: authHash(randomUUID()),
  csrfToken: randomBytes(32).toString('base64url'),
  expiresAt: new Date(Date.now() + 1800_000),
  absoluteExpiresAt: new Date(Date.now() + 28800_000),
});

it('consumes an OAuth transaction exactly once across store instances and does not consume on browser mismatch', async () => {
  const transaction = {
    stateHash: authHash(randomUUID()),
    browserHash: authHash(randomUUID()),
    nonce: randomUUID(),
    verifier: randomUUID(),
    expiresAt: new Date(Date.now() + 60000),
  };
  await store.saveTransaction(transaction);
  expect(
    await store.consumeTransaction(transaction.stateHash, authHash('wrong-browser')),
  ).toBeUndefined();
  const other = new PgAuthStore(pool);
  const results = await Promise.all([
    store.consumeTransaction(transaction.stateHash, transaction.browserHash),
    other.consumeTransaction(transaction.stateHash, transaction.browserHash),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
});
it('creates one central user per issuer/subject under concurrent logins and never merges by email', async () => {
  const identity = profile();
  const users = await Promise.all(
    Array.from({ length: 8 }, () => store.findOrCreateUser(identity)),
  );
  expect(new Set(users.map((user) => user.id)).size).toBe(1);
  expect(users.every((user) => user.roles.join(',') === 'user')).toBe(true);
  const other = await store.findOrCreateUser({ ...identity, subject: randomUUID() });
  expect(other.id).not.toBe(users[0]!.id);
});
it('serializes refresh across instances and revokes the family on reuse', async () => {
  const user = await store.findOrCreateUser(profile());
  const original = newSession(user.id);
  await store.insertSession(original);
  const first = newSession(user.id, original.familyId),
    second = newSession(user.id, original.familyId);
  const outcomes = await Promise.all([
    store.rotateSession(original.id, first),
    new PgAuthStore(pool).rotateSession(original.id, second),
  ]);
  expect(outcomes.sort()).toEqual(['reused', 'rotated']);
  const active = await pool.query(
    'SELECT id FROM auth_sessions WHERE family_id=$1 AND revoked_at IS NULL',
    [original.familyId],
  );
  expect(active.rowCount).toBe(0);
});
async function waitForBlockedQuery(query: string): Promise<number> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ pid: number }>(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query=$1",
      [query],
    );
    if (result.rows[0]) return result.rows[0].pid;
    await delay(20);
  }
  throw new Error('A operação concorrente não alcançou a barreira de lock PostgreSQL.');
}
it.each(['logout', 'reused refresh'] as const)(
  '%s waits for an in-flight rotation and revokes its newly inserted child',
  async (operation) => {
    const user = await store.findOrCreateUser(profile());
    const original = newSession(user.id);
    await store.insertSession(original);
    const current = operation === 'logout' ? original : newSession(user.id, original.familyId);
    if (current !== original)
      expect(await store.rotateSession(original.id, current)).toBe('rotated');
    const child = newSession(user.id, original.familyId);
    const blocker = await pool.connect();
    const pending: Promise<unknown>[] = [];
    let blocked = false;
    try {
      await blocker.query('BEGIN');
      blocked = true;
      await blocker.query('SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE', [current.id]);
      const rotation = store.rotateSession(current.id, child);
      pending.push(rotation);
      const rotationPid = await waitForBlockedQuery(
        'SELECT * FROM auth_sessions WHERE id=$1 FOR UPDATE',
      );
      const lock = await pool.query<{ held: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND granted) AS held",
        [rotationPid],
      );
      expect(lock.rows[0]?.held).toBe(true);
      const revocation =
        operation === 'logout'
          ? new PgAuthStore(pool).revokeFamily(original.familyId)
          : new PgAuthStore(pool).rotateSession(
              original.id,
              newSession(user.id, original.familyId),
            );
      pending.push(revocation);
      await waitForBlockedQuery('SELECT pg_advisory_xact_lock(hashtextextended($1, 1346912595))');
      // Release only after rotation owns the family lock and revocation is
      // waiting for it, so the test does not depend on scheduler timing.
      await blocker.query('COMMIT');
      blocked = false;
      expect(await rotation).toBe('rotated');
      expect(await revocation).toBe(operation === 'logout' ? undefined : 'reused');
      expect((await store.sessionByHash(child.tokenHash))?.revokedAt).toBeInstanceOf(Date);
      const active = await pool.query(
        'SELECT id FROM auth_sessions WHERE family_id=$1 AND revoked_at IS NULL',
        [original.familyId],
      );
      expect(active.rowCount).toBe(0);
    } finally {
      if (blocked) await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(pending);
    }
  },
);
it('rejects rotation into another family or user without revoking the original session', async () => {
  const user = await store.findOrCreateUser(profile());
  const other = await store.findOrCreateUser(profile());
  const original = newSession(user.id);
  await store.insertSession(original);
  await expect(store.rotateSession(original.id, newSession(user.id))).rejects.toThrow('família');
  await expect(
    store.rotateSession(original.id, newSession(other.id, original.familyId)),
  ).rejects.toThrow('usuário');
  expect((await store.sessionByHash(original.tokenHash))?.revokedAt).toBeNull();
});
it('persists Google login across HTTP service instances and revokes a JWT immediately at logout', async () => {
  const config = authConfig(google);
  const first = await authApp(config, store);
  const second = await authApp(config, new PgAuthStore(pool));
  apps.push(first.app, second.app);
  const result = await login(first.app, first.service, google, { sub: randomUUID() });
  expect(result.callback.statusCode).toBe(302);
  expect(
    (await second.app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(200);
  const session = await store.sessionByHash(authHash(result.sessionCookie.split('=')[1]!));
  expect(session?.user.id).toBe(result.state.user.id);
  await pool.query('UPDATE auth_users SET disabled_at=now() WHERE id=$1', [result.state.user.id]);
  expect(
    (await second.app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(401);
  await pool.query('UPDATE auth_users SET disabled_at=NULL WHERE id=$1', [result.state.user.id]);
  const bearer = await first.service.issueAccessToken({
    cookies: { 'phasscode-session': result.sessionCookie.split('=')[1] },
    headers: {},
  } as unknown as FastifyRequest);
  expect(
    (await second.app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${bearer}` } }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await second.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          cookie: result.sessionCookie,
          origin: 'http://localhost:5173',
          'x-csrf-token': result.state.csrfToken,
        },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (await first.app.inject({ url: '/api/v1/me', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(401);
  expect(
    (await second.app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${bearer}` } }))
      .statusCode,
  ).toBe(401);
});
it('reads administrative permissions from the central database for every request', async () => {
  const config = authConfig(google);
  const { app, service } = await authApp(config, store);
  apps.push(app);
  const result = await login(app, service, google, { sub: randomUUID() });
  expect(
    (await app.inject({ url: '/test-admin', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(403);
  await pool.query("INSERT INTO auth_user_roles(user_id,role) VALUES ($1,'admin')", [
    result.state.user.id,
  ]);
  expect(
    (await app.inject({ url: '/test-admin', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(200);
  await pool.query("DELETE FROM auth_user_roles WHERE user_id=$1 AND role='admin'", [
    result.state.user.id,
  ]);
  expect(
    (await app.inject({ url: '/test-admin', headers: { cookie: result.sessionCookie } }))
      .statusCode,
  ).toBe(403);
});
it('rejects expired OAuth state and expired sessions without creating a new session', async () => {
  const transaction = {
    stateHash: authHash(randomUUID()),
    browserHash: authHash(randomUUID()),
    nonce: randomUUID(),
    verifier: randomUUID(),
    expiresAt: new Date(0),
  };
  await store.saveTransaction(transaction);
  expect(
    await store.consumeTransaction(transaction.stateHash, transaction.browserHash),
  ).toBeUndefined();
  const user = await store.findOrCreateUser(profile());
  const original = { ...newSession(user.id), expiresAt: new Date(0) };
  await store.insertSession(original);
  expect(await store.rotateSession(original.id, newSession(user.id, original.familyId))).toBe(
    'expired',
  );
});
