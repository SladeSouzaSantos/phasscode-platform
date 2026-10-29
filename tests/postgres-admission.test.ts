import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PostgresConversationStore } from '../apps/orbe-node/src/adapters/postgres-store.js';
import type { TurnResult } from '../apps/orbe-node/src/domain/ports.js';

const input = () => ({ id: randomUUID(), tokenHash: 'a'.repeat(64), isNew: true });
const turn = (): TurnResult => ({
  response: {
    conversationId: randomUUID(),
    answer: 'Resposta fundamentada.',
    sources: [],
    meta: { provider: 'mock', simulated: true, promptVersion: 'orbe-v3' },
  },
  messages: [
    { role: 'user', content: 'Projetos PHASSCODE' },
    { role: 'assistant', content: 'Resposta fundamentada.' },
  ],
});
function fakePool(max: number) {
  const clients: Array<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = [];
  const connect = vi.fn(async () => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.startsWith('SELECT token_hash') ? [{ token_hash: 'a'.repeat(64) }] : [],
        rowCount: 1,
      })),
      release: vi.fn(),
    };
    clients.push(client);
    return client;
  });
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
  const pool = { options: { max }, connect, query, end: vi.fn() } as unknown as pg.Pool;
  return { pool, connect, query, clients };
}
function gate(count: number) {
  let enteredCount = 0;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    operation: async () => {
      if (++enteredCount === count) enter();
      await blocked;
      return turn();
    },
  };
}

describe('admissão de turnos PostgreSQL', () => {
  it('compartilha o limite por pool e preserva espaço para readiness sem fila de chat', async () => {
    const fake = fakePool(10);
    const first = new PostgresConversationStore(fake.pool);
    const second = new PostgresConversationStore(fake.pool);
    const slow = gate(8);
    const pending = Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? first : second).runTurn(input(), slow.operation),
    );
    await slow.entered;
    try {
      await expect(first.runTurn(input(), async () => turn())).rejects.toMatchObject({
        code: 'CHAT_CAPACITY_REACHED',
        status: 503,
        retryAfterSeconds: 1,
      });
      expect(fake.connect).toHaveBeenCalledTimes(8);
      await expect(second.ready()).resolves.toBeUndefined();
      expect(fake.query).toHaveBeenCalledTimes(3);
    } finally {
      slow.release();
      await Promise.all(pending);
    }
    await expect(second.runTurn(input(), async () => turn())).resolves.toBeDefined();
    expect(fake.clients.every((client) => client.release.mock.calls.length === 1)).toBe(true);
  });

  it('não perde a vaga quando o checkout falha e não vaza a mensagem do driver', async () => {
    const fake = fakePool(3);
    fake.connect.mockRejectedValueOnce(new Error('postgresql://private:secret@internal'));
    const store = new PostgresConversationStore(fake.pool);
    await expect(store.runTurn(input(), async () => turn())).rejects.toMatchObject({
      code: 'DB_UNAVAILABLE',
      status: 503,
      retryAfterSeconds: 1,
      message: 'O histórico de conversas está temporariamente indisponível.',
    });
    await expect(store.runTurn(input(), async () => turn())).resolves.toBeDefined();
  });

  it('faz rollback e recupera a admissão quando a geração falha', async () => {
    const fake = fakePool(3);
    const store = new PostgresConversationStore(fake.pool);
    await expect(
      store.runTurn(input(), async () => {
        throw new Error('provider failure');
      }),
    ).rejects.toThrow('provider failure');
    expect(fake.clients[0]!.query).toHaveBeenCalledWith('ROLLBACK');
    expect(fake.clients[0]!.query).not.toHaveBeenCalledWith('COMMIT');
    expect(fake.clients[0]!.release).toHaveBeenCalledOnce();
    await expect(store.runTurn(input(), async () => turn())).resolves.toBeDefined();
  });

  it('libera admissão mesmo quando a devolução do client lança erro', async () => {
    const fake = fakePool(3);
    const store = new PostgresConversationStore(fake.pool);
    await expect(
      store.runTurn(input(), async () => {
        fake.clients[0]!.release.mockImplementationOnce(() => {
          throw new Error('release failure');
        });
        return turn();
      }),
    ).rejects.toThrow('release failure');
    await expect(store.runTurn(input(), async () => turn())).resolves.toBeDefined();
  });

  it('permite uma operação em pool de tamanho um sem prometer reserva de conexão', async () => {
    const fake = fakePool(1);
    const store = new PostgresConversationStore(fake.pool);
    const slow = gate(1);
    const pending = store.runTurn(input(), slow.operation);
    await slow.entered;
    try {
      await expect(store.runTurn(input(), async () => turn())).rejects.toMatchObject({
        code: 'CHAT_CAPACITY_REACHED',
      });
    } finally {
      slow.release();
      await pending;
    }
  });
});
