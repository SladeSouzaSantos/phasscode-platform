import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  AuthSession,
  AuthStore,
  AuthUser,
  ExternalProfile,
  NewAuthSession,
  OAuthTransaction,
} from './types.js';

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  csrf_token: string;
  expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  email: string | null;
  display_name: string;
  disabled_at: Date | null;
  roles: string[];
}
const sessionSelect = `SELECT s.*, u.email, u.display_name, u.disabled_at,
 ARRAY(SELECT role FROM auth_user_roles WHERE user_id=u.id ORDER BY role) AS roles
 FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id`;
const mapSession = (row: SessionRow): AuthSession => ({
  id: row.id,
  userId: row.user_id,
  familyId: row.family_id,
  tokenHash: row.token_hash,
  csrfToken: row.csrf_token,
  expiresAt: row.expires_at,
  absoluteExpiresAt: row.absolute_expires_at,
  revokedAt: row.revoked_at,
  user: {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roles: row.roles,
    disabled: row.disabled_at !== null,
  },
});
async function insertSession(
  client: Pick<pg.PoolClient, 'query'> | pg.Pool,
  session: NewAuthSession,
) {
  await client.query(
    'INSERT INTO auth_sessions(id,user_id,family_id,token_hash,csrf_token,expires_at,absolute_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      session.id,
      session.userId,
      session.familyId,
      session.tokenHash,
      session.csrfToken,
      session.expiresAt,
      session.absoluteExpiresAt,
    ],
  );
}
// Use one lock for the whole family before taking any session row locks. A row
// lock alone cannot stop a concurrent revocation from missing a newly inserted
// child under PostgreSQL's READ COMMITTED statement snapshots.
async function lockSessionFamily(client: pg.PoolClient, familyId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1346912595))', [familyId]);
}
export class PgAuthStore implements AuthStore {
  constructor(readonly pool: pg.Pool) {}
  async saveTransaction(transaction: OAuthTransaction): Promise<void> {
    await this.pool.query('DELETE FROM auth_oauth_transactions WHERE expires_at < now()');
    await this.pool.query(
      'INSERT INTO auth_oauth_transactions(state_hash,browser_hash,nonce,verifier,expires_at) VALUES ($1,$2,$3,$4,$5)',
      [
        transaction.stateHash,
        transaction.browserHash,
        transaction.nonce,
        transaction.verifier,
        transaction.expiresAt,
      ],
    );
  }
  async consumeTransaction(
    stateHash: string,
    browserHash: string,
  ): Promise<OAuthTransaction | undefined> {
    const result = await this.pool.query<{
      state_hash: string;
      browser_hash: string;
      nonce: string;
      verifier: string;
      expires_at: Date;
    }>(
      'UPDATE auth_oauth_transactions SET consumed_at=now() WHERE state_hash=$1 AND browser_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING *',
      [stateHash, browserHash],
    );
    const row = result.rows[0];
    return row
      ? {
          stateHash: row.state_hash,
          browserHash: row.browser_hash,
          nonce: row.nonce,
          verifier: row.verifier,
          expiresAt: row.expires_at,
        }
      : undefined;
  }
  async findOrCreateUser(profile: ExternalProfile): Promise<AuthUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${profile.issuer}\n${profile.subject}`,
      ]);
      const existing = await client.query<{ user_id: string }>(
        'SELECT user_id FROM auth_external_identities WHERE issuer=$1 AND subject=$2',
        [profile.issuer, profile.subject],
      );
      const id = existing.rows[0]?.user_id ?? randomUUID();
      if (!existing.rows[0]) {
        await client.query('INSERT INTO auth_users(id,email,display_name) VALUES ($1,$2,$3)', [
          id,
          profile.email,
          profile.displayName,
        ]);
        await client.query(
          "INSERT INTO auth_external_identities(id,user_id,provider,issuer,subject) VALUES ($1,$2,'google',$3,$4)",
          [randomUUID(), id, profile.issuer, profile.subject],
        );
        await client.query("INSERT INTO auth_user_roles(user_id,role) VALUES ($1,'user')", [id]);
      }
      const result = await client.query<{
        email: string | null;
        display_name: string;
        disabled_at: Date | null;
        roles: string[];
      }>(
        'SELECT u.*, ARRAY(SELECT role FROM auth_user_roles WHERE user_id=u.id ORDER BY role) roles FROM auth_users u WHERE id=$1',
        [id],
      );
      await client.query('COMMIT');
      const row = result.rows[0]!;
      return {
        id,
        email: row.email,
        displayName: row.display_name,
        roles: row.roles,
        disabled: row.disabled_at !== null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  insertSession(session: NewAuthSession): Promise<void> {
    return insertSession(this.pool, session);
  }
  async sessionByHash(hash: string): Promise<AuthSession | undefined> {
    const row = (
      await this.pool.query<SessionRow>(`${sessionSelect} WHERE s.token_hash=$1`, [hash])
    ).rows[0];
    return row ? mapSession(row) : undefined;
  }
  async sessionById(id: string): Promise<AuthSession | undefined> {
    const row = (await this.pool.query<SessionRow>(`${sessionSelect} WHERE s.id=$1`, [id])).rows[0];
    return row ? mapSession(row) : undefined;
  }
  async rotateSession(
    oldId: string,
    session: NewAuthSession,
  ): Promise<'rotated' | 'reused' | 'expired'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const family = (
        await client.query<{ family_id: string }>(
          'SELECT family_id FROM auth_sessions WHERE id=$1',
          [oldId],
        )
      ).rows[0];
      if (!family) {
        await client.query('COMMIT');
        return 'expired';
      }
      if (session.familyId !== family.family_id)
        throw new Error('A renovação deve preservar a família da sessão.');
      await lockSessionFamily(client, family.family_id);
      const row = (
        await client.query<{
          revoked_at: Date | null;
          expires_at: Date;
          absolute_expires_at: Date;
          family_id: string;
          user_id: string;
        }>('SELECT * FROM auth_sessions WHERE id=$1 FOR UPDATE', [oldId])
      ).rows[0];
      if (!row) {
        await client.query('COMMIT');
        return 'expired';
      }
      if (row.family_id !== family.family_id || row.user_id !== session.userId)
        throw new Error('A renovação deve preservar o usuário e a família da sessão.');
      if (row.revoked_at) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',
          [row.family_id],
        );
        await client.query('COMMIT');
        return 'reused';
      }
      if (
        row.expires_at.getTime() <= Date.now() ||
        row.absolute_expires_at.getTime() <= Date.now()
      ) {
        await client.query('COMMIT');
        return 'expired';
      }
      await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [oldId]);
      await insertSession(client, session);
      await client.query('COMMIT');
      return 'rotated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async revokeFamily(familyId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSessionFamily(client, familyId);
      await client.query(
        'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',
        [familyId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
