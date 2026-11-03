import neo4j from 'neo4j-driver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Neo4jGraphStore,
  graphOrCanonical,
} from '../apps/orbe-node/src/adapters/neo4j-driver-store.js';
import { Neo4jEvidenceRepository } from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';

const uri = process.env.TEST_NEO4J_URI;
const enabled = Boolean(uri && process.env.TEST_NEO4J_AUTH);

describe.skipIf(!enabled)('F3.2: disposable Neo4j integration', () => {
  let store: Neo4jGraphStore;

  beforeAll(async () => {
    const driver = neo4j.driver(
      uri ?? 'bolt://neo4j:7687',
      neo4j.auth.basic('neo4j', process.env.TEST_NEO4J_AUTH ?? ''),
    );
    store = new Neo4jGraphStore(driver);
    await store.verifyConnectivity();
  }, 30000);

  afterAll(async () => store?.close());

  it('seeds twice without duplicates and preserves PPKS counts', async () => {
    const graph = await projectPpksEvidenceGraph();
    const first = await store.seed(graph);
    const firstCounts = await store.count();
    const second = await store.seed(graph);
    const secondCounts = await store.count();
    expect(first).toEqual(second);
    expect(firstCounts).toEqual(secondCounts);
    expect(firstCounts).toEqual({
      nodes: graph.nodes.length,
      relations: graph.relations.length,
    });
  }, 90000);

  it('retrieves Java claims with all sources and preserves the pending degree', async () => {
    const repository = new Neo4jEvidenceRepository(store);
    const matches = await repository.findEvidence([
      { kind: 'vacancy_requirement', id: 'java-requirement', label: 'Java', mandatory: true },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.claims.length).toBeGreaterThan(0);
    for (const claim of matches[0]?.claims ?? []) {
      expect(
        claim.sourceIds.every((id) => matches[0]?.sources.some((source) => source.id === id)),
      ).toBe(true);
    }
    const source = await repository.getSource('source-formacao-computacao');
    expect(source).toMatchObject({ visibility: 'private' });
  }, 30000);

  it('rejects visitor-supplied Cypher', async () => {
    await expect(store.read('MATCH (n) DETACH DELETE n', {})).rejects.toThrow(
      'GRAPH_UNAPPROVED_CYPHER',
    );
  });

  it('falls back to canonical PPKS when the graph fails', async () => {
    const answer = await graphOrCanonical(
      async () => {
        throw new Error('neo4j disconnected');
      },
      async () => 'canonical PPKS',
    );
    expect(answer).toBe('canonical PPKS');
  });
});
