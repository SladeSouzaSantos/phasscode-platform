/**
 * Gate 9 / F4.1 — static compatibility inventory, NOT an execution on HydraDB.
 * No client initialization, API calls, graph writes or connection to MiniMac.
 *
 * The source of truth for existing Neo4j queries is imported, and the
 * source-code surface is checked to fail closed when a new query is exported.
 */
import { createHash } from 'node:crypto';
import {
  graphConstraintCypher,
  graphNodesCypher,
  graphRelationsCypher,
  graphPruneRelationsCypher,
  graphPruneNodesCypher,
  graphFindEvidenceCypher,
  graphGetSourceCypher,
} from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';

export type Gate9Operation = Readonly<{
  name: string;
  purpose: 'seed' | 'maintenance' | 'read' | 'observability';
  queryDigest16: string;
  parameterNames: readonly string[];
  status: 'adaptation_required' | 'runtime_verification_required';
  blockers: readonly string[];
}>;
export type Gate9Input = Readonly<{
  querySource: string;
  driverSource: string;
}>;
type InternalOperation = {
  name: string;
  purpose: Gate9Operation['purpose'];
  query: string;
  checks: string[];
  status: Gate9Operation['status'];
  blockers: string[];
};
const COUNT_NODES =
  'MATCH (n:OrbeEvidence) RETURN count(n) AS total';
const COUNT_RELATIONS =
  'MATCH (:OrbeEvidence)-[r:ORBE_RELATION]->(:OrbeEvidence) RETURN count(r) AS total';

const known: InternalOperation[] = [
  {
    name: 'graphConstraintCypher', purpose: 'seed', query: graphConstraintCypher,
    checks: ['CREATE CONSTRAINT', 'IS UNIQUE'],
    status: 'adaptation_required',
    blockers: ['DDL_CONSTRAINT_NOT_IN_DOCUMENTED_SUBSET'],
  },
  {
    name: 'graphNodesCypher', purpose: 'seed', query: graphNodesCypher,
    checks: ['UNWIND $rows', 'MERGE (n:OrbeEvidence', 'SET n += row.properties'],
    status: 'adaptation_required',
    blockers: ['DYNAMIC_SET_MAP', 'STRING_ID_MAPPING'],
  },
  {
    name: 'graphRelationsCypher', purpose: 'seed', query: graphRelationsCypher,
    checks: ['UNWIND $rows', 'MERGE (start)-[edge:ORBE_RELATION', 'edge.sourceIds'],
    status: 'adaptation_required',
    blockers: ['MERGE_RELATION_RESTRICTIONS', 'LIST_SOURCE_IDS_NEED_EDGES'],
  },
  {
    name: 'graphPruneRelationsCypher', purpose: 'maintenance',
    query: graphPruneRelationsCypher,
    checks: ['IS NULL', 'DELETE edge', 'snapshot <> $snapshot'],
    status: 'runtime_verification_required',
    blockers: ['IS_NULL_UNSUPPORTED', 'DELETE_SEMANTICS_UNVERIFIED'],
  },
  {
    name: 'graphPruneNodesCypher', purpose: 'maintenance',
    query: graphPruneNodesCypher,
    checks: ['IS NULL', 'DETACH DELETE n', 'snapshot <> $snapshot'],
    status: 'runtime_verification_required',
    blockers: ['IS_NULL_UNSUPPORTED', 'DETACH_DELETE_SEMANTICS_UNVERIFIED'],
  },
  {
    name: 'graphFindEvidenceCypher', purpose: 'read',
    query: graphFindEvidenceCypher,
    checks: [
      'toLower(skill.label)', 'claim.scope IN [',
      'WITH claim ORDER BY claim.id LIMIT $limit',
      'source.id IN claim.sourceIds',
      'collect(source.payload)',
    ],
    status: 'adaptation_required',
    blockers: [
      'TOLOWER_UNDOCUMENTED', 'IN_UNSUPPORTED',
      'WITH_ORDER_LIMIT_RESTRICTIONS', 'SOURCE_IDS_NEED_EDGES',
      'COLLECT_AGGREGATION_UNVERIFIED',
    ],
  },
  {
    name: 'graphGetSourceCypher', purpose: 'read',
    query: graphGetSourceCypher,
    checks: ['id: $id', 'RETURN source.payload AS source LIMIT 1'],
    status: 'adaptation_required',
    blockers: ['EXTERNAL_STRING_SOURCE_ID_MAPPING', 'LIMIT_SUPPORT_VERIFY'],
  },
  {
    name: 'driverCountNodesQuery', purpose: 'observability',
    query: COUNT_NODES,
    checks: ['count(n)'],
    status: 'runtime_verification_required',
    blockers: ['COUNT_AGGREGATION_UNVERIFIED'],
  },
  {
    name: 'driverCountRelationsQuery', purpose: 'observability',
    query: COUNT_RELATIONS,
    checks: ['count(r)'],
    status: 'runtime_verification_required',
    blockers: ['COUNT_AGGREGATION_UNVERIFIED'],
  },
];
const expectedExports = [
  'graphConstraintCypher', 'graphNodesCypher', 'graphRelationsCypher',
  'graphPruneRelationsCypher', 'graphPruneNodesCypher',
  'graphFindEvidenceCypher', 'graphGetSourceCypher',
].sort();

function insist(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function parameters(query: string): string[] {
  return [...new Set([...query.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g)]
    .map(match => match[1]!))].sort();
}
export function createGate9CypherInventory(input: Gate9Input) {
  insist(input.querySource.length > 0 && input.driverSource.length > 0,
    'GATE9_SOURCE_MISSING');
  const declared = [...input.querySource.matchAll(
    /export const (graph[A-Za-z0-9]+Cypher)\s*=/g,
  )].map(match => match[1]!).sort();
  insist(JSON.stringify(declared) === JSON.stringify(expectedExports),
    'GATE9_CYPHER_EXPORT_SURFACE_DRIFT');
  insist(input.driverSource.includes(
    'new Set([graphFindEvidenceCypher, graphGetSourceCypher])',
  ), 'GATE9_READ_ALLOWLIST_DRIFT');
  insist(input.driverSource.includes("options.uri !== 'bolt://neo4j:7687'"),
    'GATE9_DRIVER_ENDPOINT_GUARD_DRIFT');
  insist(input.driverSource.includes('session.executeWrite('),
    'GATE9_TRANSACTION_SEED_GUARD_DRIFT');
  insist(input.driverSource.includes(COUNT_NODES) &&
    input.driverSource.includes(COUNT_RELATIONS),
  'GATE9_COUNT_QUERY_DRIFT');

  for (const operation of known) {
    insist(operation.query.trim().length > 0 &&
      operation.checks.every(fragment => operation.query.includes(fragment)),
    'GATE9_QUERY_SHAPE_DRIFT_' + operation.name);
  }
  insist(known.length === 9 &&
    new Set(known.map(item => item.name)).size === known.length,
  'GATE9_OPERATION_REGISTRY_DRIFT');

  const operations: Gate9Operation[] = known.map(item => ({
    name: item.name,
    purpose: item.purpose,
    queryDigest16: digest(item.query).slice(0, 16),
    parameterNames: parameters(item.query),
    status: item.status,
    blockers: item.blockers,
  }));
  return {
    schemaVersion: 'hydradb-gate9-cypher-inventory-v1',
    mode: 'static_source_inventory_only',
    sourceFileSha256: digest(input.querySource),
    driverFileSha256: digest(input.driverSource),
    operationCount: operations.length,
    seededQueries: operations.filter(o => o.purpose === 'seed').length,
    directReads: operations.filter(o => o.purpose === 'read').length,
    maintenanceQueries: operations.filter(o => o.purpose === 'maintenance').length,
    observabilityQueries: operations.filter(o => o.purpose === 'observability').length,
    adaptationRequired: operations.filter(o => o.status === 'adaptation_required').length,
    runtimeVerificationRequired: operations.filter(
      o => o.status === 'runtime_verification_required',
    ).length,
    operations,
    oracle: 'repo_code_plus_pinned_hydradb_v0.3.0_documented_subset',
    graphQueriesExecuted: 0,
    actualBoltCompatibility: 'not_tested',
    actualCypherCompatibility: 'not_tested',
    performanceBenchmark: 'not_tested',
    limitations: [
      'Blockers based on pinned upstream documentation; not runtime assertions',
      'GraphRAG Neo4j query contract is not wire-compatible by substitution',
      'Existing isolated LAB projections do not reproduce every Orbe operation',
      'No graph engine was started or queried in this inventory',
    ],
  };
}
