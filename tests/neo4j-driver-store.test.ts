import { describe, expect, it, vi } from 'vitest';
import {
  Neo4jGraphStore,
  createNeo4jConnection,
  graphOrCanonical,
} from '../apps/orbe-node/src/adapters/neo4j-driver-store.js';
import { graphFindEvidenceCypher } from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';

type FakeTransaction = { run: ReturnType<typeof vi.fn> };

const fake = () => {
  const tx: FakeTransaction = { run: vi.fn().mockResolvedValue({ records: [] }) };
  const closeSession = vi.fn().mockResolvedValue(undefined);
  const executeRead = vi.fn(async (f: (tx: FakeTransaction) => Promise<unknown>) => f(tx));
  const executeWrite = vi.fn(async (f: (tx: FakeTransaction) => Promise<unknown>) => f(tx));
  const session = vi.fn(() => ({ executeRead, executeWrite, close: closeSession }));
  const close = vi.fn().mockResolvedValue(undefined);
  const verifyConnectivity = vi.fn().mockResolvedValue(undefined);
  return {
    driver: { session, close, verifyConnectivity },
    tx,
    executeRead,
    executeWrite,
    closeSession,
  };
};

describe('F3.2: official driver adapter contract', () => {
  it('rejects non-internal URIs and missing passwords before connecting', () => {
    expect(() =>
      createNeo4jConnection({
        uri: 'neo4j+s://public.example.com:7687',
        username: 'neo4j',
        password: 'secret',
      }),
    ).toThrow('GRAPH_INVALID_INTERNAL_BOLT_URI');
    expect(() =>
      createNeo4jConnection({ uri: 'bolt://neo4j:7687', username: 'neo4j', password: '' }),
    ).toThrow('GRAPH_MISSING_AUTH');
  });

  it('rejects arbitrary Cypher and never opens a session for it', async () => {
    const f = fake();
    const store = new Neo4jGraphStore(f.driver as never);
    await expect(store.read('MATCH (n) DETACH DELETE n', {})).rejects.toThrow(
      'GRAPH_UNAPPROVED_CYPHER',
    );
    expect(f.driver.session).not.toHaveBeenCalled();
  });

  it('runs approved parameterized reads and closes the managed session', async () => {
    const f = fake();
    const store = new Neo4jGraphStore(f.driver as never);
    await store.read(graphFindEvidenceCypher, { skill: 'React', limit: 5 });
    expect(f.executeRead).toHaveBeenCalledTimes(1);
    expect(f.tx.run).toHaveBeenCalledWith(graphFindEvidenceCypher, { skill: 'React', limit: 5 });
    expect(f.closeSession).toHaveBeenCalledTimes(1);
  });

  it('creates the constraint separately and writes the seed atomically', async () => {
    const f = fake();
    const store = new Neo4jGraphStore(f.driver as never);
    const snapshot = await projectPpksEvidenceGraph();
    const result = await store.seed(snapshot);
    expect(result.nodes).toBe(snapshot.nodes.length);
    expect(result.relations).toBe(snapshot.relations.length);
    expect(f.executeWrite).toHaveBeenCalledTimes(2);
    expect(f.tx.run).toHaveBeenCalledTimes(5);
    expect(f.closeSession).toHaveBeenCalledTimes(1);
  });

  it('closes the session after a failed transaction', async () => {
    const f = fake();
    f.tx.run.mockRejectedValueOnce(new Error('connection lost'));
    const store = new Neo4jGraphStore(f.driver as never);
    await expect(store.seed(await projectPpksEvidenceGraph())).rejects.toThrow('connection lost');
    expect(f.closeSession).toHaveBeenCalledOnce();
  });

  it('uses the canonical fallback when Neo4j is unavailable', async () => {
    const result = await graphOrCanonical(
      async (): Promise<string> => {
        throw new Error('connection closed');
      },
      async () => 'PPKS_CANONICAL',
    );
    expect(result).toBe('PPKS_CANONICAL');
  });
});
