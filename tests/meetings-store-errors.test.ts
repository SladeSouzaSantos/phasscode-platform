import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { expect, it, vi } from 'vitest';
import { PostgresMeetingStore } from '../apps/orbe-node/src/meetings/postgres-store.js';

it.each(['23P01', '40P01'])(
  'rolls back reservation conflict %s without exposing a driver error',
  async (code) => {
    const id = randomUUID();
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM meetings'))
        return { rows: [{ id, status: 'PENDING', version: 1 }] };
      if (sql.startsWith('UPDATE meetings'))
        throw Object.assign(new Error('synthetic private driver diagnostic'), { code });
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as pg.Pool;
    await expect(
      new PostgresMeetingStore(pool).approve(id, 1, randomUUID(), 15, new Date()),
    ).rejects.toMatchObject({ code: 'MEETING_SLOT_UNAVAILABLE', status: 409 });
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query.mock.calls.some(([sql]) => sql.includes('meeting_outbox'))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  },
);
