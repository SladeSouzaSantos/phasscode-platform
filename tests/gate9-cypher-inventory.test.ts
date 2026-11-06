import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGate9CypherInventory } from '../evaluation/hydradb-gate9-cypher-inventory.js';

const querySource = readFileSync(
  'apps/orbe-node/src/adapters/neo4j-graph-queries.ts', 'utf8',
);
const driverSource = readFileSync(
  'apps/orbe-node/src/adapters/neo4j-driver-store.ts', 'utf8',
);
function report(
  source = querySource,
  driver = driverSource,
) {
  return createGate9CypherInventory({ querySource: source, driverSource: driver });
}

describe('HydraDB Gate 9 — static Orbe Cypher inventory', () => {
  it('inventories all seven exported queries and two driver count queries', () => {
    const value = report();
    expect(value.operationCount).toBe(9);
    expect(value.seededQueries).toBe(3);
    expect(value.directReads).toBe(2);
    expect(value.maintenanceQueries).toBe(2);
    expect(value.observabilityQueries).toBe(2);
    expect(value.adaptationRequired).toBe(5);
    expect(value.runtimeVerificationRequired).toBe(4);
    expect(value.operations.every(x => x.blockers.length > 0)).toBe(true);
  });

  it('records actual fixed parameterized queries and their known blockers', () => {
    const value = report();
    const find = value.operations.find(x => x.name === 'graphFindEvidenceCypher');
    expect(find?.parameterNames).toEqual(['limit', 'skill']);
    expect(find?.blockers).toContain('IN_UNSUPPORTED');
    expect(find?.blockers).toContain('SOURCE_IDS_NEED_EDGES');
    const getSource = value.operations.find(x => x.name === 'graphGetSourceCypher');
    expect(getSource?.parameterNames).toEqual(['id']);
    expect(getSource?.blockers).toContain('EXTERNAL_STRING_SOURCE_ID_MAPPING');
  });

  it('never claims runtime Cypher, Bolt or speed equivalence from static analysis', () => {
    const value = report();
    expect(value.mode).toBe('static_source_inventory_only');
    expect(value.graphQueriesExecuted).toBe(0);
    expect(value.actualCypherCompatibility).toBe('not_tested');
    expect(value.actualBoltCompatibility).toBe('not_tested');
    expect(value.performanceBenchmark).toBe('not_tested');
  });

  it('fails closed when a new exported query was not inventoried', () => {
    const changed = querySource.replace(
      'export const graphGetSourceCypher',
      'export const graphNewCypher = "RETURN 1";\nexport const graphGetSourceCypher',
    );
    expect(() => report(changed)).toThrow('GATE9_CYPHER_EXPORT_SURFACE_DRIFT');
  });

  it('detects a changed approved-read allowlist', () => {
    const changed = driverSource.replace(
      'new Set([graphFindEvidenceCypher, graphGetSourceCypher])',
      'new Set([graphFindEvidenceCypher])',
    );
    expect(() => report(querySource, changed))
      .toThrow('GATE9_READ_ALLOWLIST_DRIFT');
  });

  it('detects a weakened Neo4j-only connection guard', () => {
    const changed = driverSource.replace(
      "options.uri !== 'bolt://neo4j:7687'",
      "options.uri !== 'bolt://arbitrary:7687'",
    );
    expect(() => report(querySource, changed))
      .toThrow('GATE9_DRIVER_ENDPOINT_GUARD_DRIFT');
  });

  it('detects changed source-level read counting queries', () => {
    const changed = driverSource.replace(
      'MATCH (n:OrbeEvidence) RETURN count(n) AS total',
      'MATCH (n:OrbeEvidence) RETURN count(n.id) AS total',
    );
    expect(() => report(querySource, changed))
      .toThrow('GATE9_COUNT_QUERY_DRIFT');
  });
});
