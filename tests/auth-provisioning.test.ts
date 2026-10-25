import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PgAuthStore } from '../apps/orbe-node/src/auth/postgres.js';
import type { ExternalProfile } from '../apps/orbe-node/src/auth/types.js';

const userId = '628f1aae-f924-44e3-bb43-d4fcfe3d350d';
const profile: ExternalProfile = {
  issuer: 'https://accounts.google.com',
  subject: 'verified-subject',
  email: 'admin@example.test',
  displayName: 'Verified administrator',
};

function provisioningClient({
  grant = true,
  disabled = false,
  failure,
}: {
  grant?: boolean;
  disabled?: boolean;
  failure?: 'role' | 'audit' | 'profile';
} = {}) {
  const databaseError = new Error('SYNTHETIC_DATABASE_FAILURE');
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.startsWith('SELECT user_id FROM auth_external_identities')) {
      expect(parameters).toEqual([profile.issuer, profile.subject]);
      return { rows: [{ user_id: userId }], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO auth_user_roles')) {
      if (failure === 'role') throw databaseError;
      return { rows: grant ? [{ user_id: userId }] : [], rowCount: grant ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO auth_role_audit') && failure === 'audit') throw databaseError;
    if (sql.startsWith('SELECT u.*')) {
      if (failure === 'profile') throw databaseError;
      return {
        rows: [
          {
            email: profile.email,
            display_name: profile.displayName,
            disabled_at: disabled ? new Date(0) : null,
            roles: grant ? ['admin', 'user'] : ['user'],
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const client = { query, release };
  const pool = { connect: vi.fn(async () => client) } as unknown as pg.Pool;
  return {
    store: new PgAuthStore(pool),
    query,
    release,
    databaseError,
    statements: () => query.mock.calls.map(([sql]) => sql),
  };
}

describe('PostgreSQL administrator provisioning transaction', () => {
  it('never requests privilege escalation by default and updates only the linked identity user', async () => {
    const fixture = provisioningClient({ grant: false });
    const user = await fixture.store.findOrCreateUser(profile);
    expect(user).toMatchObject({ id: userId, email: profile.email, roles: ['user'] });
    expect(fixture.query).toHaveBeenCalledWith(
      'SELECT user_id FROM auth_external_identities WHERE issuer=$1 AND subject=$2',
      [profile.issuer, profile.subject],
    );
    expect(fixture.query).toHaveBeenCalledWith(
      'UPDATE auth_users SET email=$2, display_name=$3 WHERE id=$1',
      [userId, profile.email, profile.displayName],
    );
    expect(fixture.statements().some((sql) => sql.startsWith('INSERT INTO auth_user_roles'))).toBe(
      false,
    );
    expect(fixture.statements().some((sql) => sql.startsWith('INSERT INTO auth_role_audit'))).toBe(
      false,
    );
    expect(fixture.statements().at(-1)).toBe('COMMIT');
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it('locks the central user before provisioning and commits the role and audit together', async () => {
    const fixture = provisioningClient();
    expect(await fixture.store.findOrCreateUser(profile, { bootstrapAdmin: true })).toMatchObject({
      id: userId,
      roles: ['admin', 'user'],
    });
    const statements = fixture.statements();
    const lock = statements.indexOf('SELECT id FROM auth_users WHERE id=$1 FOR UPDATE');
    const grant = statements.findIndex((sql) => sql.startsWith('INSERT INTO auth_user_roles'));
    const audit = statements.findIndex((sql) => sql.startsWith('INSERT INTO auth_role_audit'));
    expect(statements[0]).toBe('BEGIN');
    expect(lock).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(lock);
    expect(audit).toBeGreaterThan(grant);
    expect(statements.indexOf('COMMIT')).toBeGreaterThan(audit);
    expect(fixture.query.mock.calls[audit]?.[1]).toEqual([expect.any(String), userId]);
    expect(fixture.release).toHaveBeenCalledOnce();
  });

  it('does not record a grant when the database declines bootstrap for a disabled user', async () => {
    const fixture = provisioningClient({ grant: false, disabled: true });
    expect(await fixture.store.findOrCreateUser(profile, { bootstrapAdmin: true })).toMatchObject({
      id: userId,
      disabled: true,
      roles: ['user'],
    });
    expect(fixture.statements().some((sql) => sql.startsWith('INSERT INTO auth_role_audit'))).toBe(
      false,
    );
    expect(fixture.statements().at(-1)).toBe('COMMIT');
  });

  it.each(['role', 'audit', 'profile'] as const)(
    'rolls back and releases the connection when the %s operation fails',
    async (failure) => {
      const fixture = provisioningClient({ failure });
      await expect(fixture.store.findOrCreateUser(profile, { bootstrapAdmin: true })).rejects.toBe(
        fixture.databaseError,
      );
      expect(fixture.statements()).not.toContain('COMMIT');
      expect(fixture.statements().at(-1)).toBe('ROLLBACK');
      expect(fixture.release).toHaveBeenCalledOnce();
    },
  );
});
