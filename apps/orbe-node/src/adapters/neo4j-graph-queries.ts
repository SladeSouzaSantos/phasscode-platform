import { createHash } from 'node:crypto';
import type {
  EvidenceClaim,
  EvidenceGraphMatch,
  EvidenceGraphSnapshot,
  EvidenceSource,
  VacancyRequirement,
} from '../domain/evidence-graph.js';
import {
  evidenceClaimSchema,
  evidenceGraphSnapshotSchema,
  evidenceSourceSchema,
} from '../domain/evidence-graph.js';

/** F3.2: Cypher is never generated from LLM or visitor text. */
export const graphConstraintCypher =
  'CREATE CONSTRAINT orbe_graph_node_id IF NOT EXISTS FOR (n:OrbeEvidence) REQUIRE n.id IS UNIQUE';

export const graphNodesCypher = [
  'UNWIND $rows AS row',
  'MERGE (n:OrbeEvidence {id: row.id})',
  'SET n += row.properties, n.snapshot = $snapshot',
].join('\n');

export const graphRelationsCypher = [
  'UNWIND $rows AS row',
  'MATCH (start:OrbeEvidence {id: row.from})',
  'MATCH (finish:OrbeEvidence {id: row.to})',
  'MERGE (start)-[edge:ORBE_RELATION {key: row.key}]->(finish)',
  'SET edge.type = row.type, edge.sourceIds = row.sourceIds, edge.snapshot = $snapshot',
].join('\n');

/** Remove stale relationships first, then stale nodes; only under our own label/type. */
export const graphPruneRelationsCypher =
  'MATCH (:OrbeEvidence)-[edge:ORBE_RELATION]->(:OrbeEvidence) WHERE edge.snapshot <> $snapshot DELETE edge';
export const graphPruneNodesCypher =
  'MATCH (n:OrbeEvidence) WHERE n.snapshot <> $snapshot DETACH DELETE n';

/**
 * A production seed executor must execute all items inside a single write transaction.
 * Each query is fixed and its data is supplied through Cypher parameters.
 */
export interface CypherOperation {
  readonly query: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface Neo4jGraphSeedPlan {
  readonly snapshot: string;
  readonly nodes: number;
  readonly relations: number;
  readonly operations: readonly CypherOperation[];
}

/** Identical PPKS input creates identical operations, keys, and snapshot SHA. */
export function planNeo4jGraphSeed(input: EvidenceGraphSnapshot): Neo4jGraphSeedPlan {
  const graph = evidenceGraphSnapshotSchema.parse(input);
  const digest = createHash('sha256').update(JSON.stringify(graph)).digest('hex');
  const rows = graph.nodes.map((node) => ({
    id: node.id,
    properties: {
      ...node,
      payload: JSON.stringify(node),
      // Distinguish public records from owner-confirmed/private sources.
      sourceIds: node.kind === 'claim' ? node.sourceIds : [],
    },
  }));
  const edges = graph.relations.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
    key: [edge.from, edge.type, edge.to].join('::'),
    sourceIds: edge.sourceIds,
  }));
  const unique = new Set(edges.map((edge) => edge.key));
  if (unique.size !== edges.length) throw new Error('GRAPH_DUPLICATE_RELATION');
  return {
    snapshot: digest,
    nodes: rows.length,
    relations: edges.length,
    operations: [
      { query: graphNodesCypher, params: { rows, snapshot: digest } },
      { query: graphRelationsCypher, params: { rows: edges, snapshot: digest } },
      { query: graphPruneRelationsCypher, params: { snapshot: digest } },
      { query: graphPruneNodesCypher, params: { snapshot: digest } },
    ],
  };
}

export interface GraphReadExecutor {
  /** Executed via an official Neo4j driver read transaction in the next adapter step. */
  read(query: string, params: Readonly<Record<string, unknown>>): Promise<readonly unknown[]>;
}

export const graphFindEvidenceCypher = [
  'MATCH (skill:OrbeEvidence {kind: "skill"})',
  'WHERE toLower(skill.label) = toLower($skill)',
  'MATCH (claim:OrbeEvidence {kind: "claim", predicate: "USES_TECHNOLOGY", objectId: skill.id})',
  'WHERE claim.scope IN ["professional", "mixed_role", "professional_project", "personal_project", "study"]',
  'WITH claim ORDER BY claim.id LIMIT $limit',
  'MATCH (source:OrbeEvidence {kind: "source"})',
  'WHERE source.id IN claim.sourceIds',
  'RETURN claim.payload AS claim, collect(source.payload) AS sources',
].join('\n');

export const graphGetSourceCypher = [
  'MATCH (source:OrbeEvidence {kind: "source", id: $id})',
  'RETURN source.payload AS source LIMIT 1',
].join('\n');

const evidenceRow = (
  value: unknown,
): { claim: string; sources: string[] } | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.claim !== 'string' || !Array.isArray(row.sources)) return undefined;
  if (!row.sources.every((item) => typeof item === 'string')) return undefined;
  return { claim: row.claim, sources: row.sources as string[] };
};

/**
 * Read-only bounded direct skill lookup; does not extrapolate related skills.
 * On backend errors the orchestrator must degrade to the canonical PPKS.
 */
export class Neo4jEvidenceRepository {
  constructor(private readonly executor: GraphReadExecutor) {}

  async findEvidence(
    requirements: readonly VacancyRequirement[],
    options: { maxClaimsPerRequirement?: number } = {},
  ): Promise<readonly EvidenceGraphMatch[]> {
    const limit = Math.min(20, Math.max(1, options.maxClaimsPerRequirement ?? 5));
    const results: EvidenceGraphMatch[] = [];
    for (const requirement of requirements) {
      const rows = await this.executor.read(graphFindEvidenceCypher, {
        skill: requirement.label,
        limit,
      });
      const claims: EvidenceClaim[] = [];
      const sources = new Map<string, EvidenceSource>();
      for (const raw of rows) {
        const row = evidenceRow(raw);
        if (!row) throw new Error('GRAPH_INVALID_RESULT');
        const claim = evidenceClaimSchema.parse(JSON.parse(row.claim));
        const currentSources = row.sources.map((value) =>
          evidenceSourceSchema.parse(JSON.parse(value)),
        );
        // A claim without all recorded source IDs is not evidence.
        if (!claim.sourceIds.every((id) => currentSources.some((source) => source.id === id))) {
          continue;
        }
        claims.push(claim);
        for (const source of currentSources) sources.set(source.id, source);
      }
      results.push({ requirementId: requirement.id, claims, sources: [...sources.values()] });
    }
    return results;
  }

  async getSource(sourceId: string): Promise<EvidenceSource | undefined> {
    const rows = await this.executor.read(graphGetSourceCypher, { id: sourceId });
    if (rows.length === 0) return undefined;
    const first = rows[0];
    if (typeof first !== 'object' || first === null || !('source' in first)) {
      throw new Error('GRAPH_INVALID_RESULT');
    }
    const source = (first as { source: unknown }).source;
    if (typeof source !== 'string') throw new Error('GRAPH_INVALID_RESULT');
    return evidenceSourceSchema.parse(JSON.parse(source));
  }
}
