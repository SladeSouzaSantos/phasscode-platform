import { createHash } from 'node:crypto';
import {
  evidenceGraphSnapshotSchema,
  type EvidenceGraphSnapshot,
} from '../domain/evidence-graph.js';

type GraphNode = EvidenceGraphSnapshot['nodes'][number];
type GraphRelation = EvidenceGraphSnapshot['relations'][number];
type Delta = 'added' | 'removed' | 'modified';

export interface GraphSnapshotDelta {
  entity: 'node' | 'relation';
  key: string;
  kind: string;
  change: Delta;
  /** Field names only: no documents, source URLs, credentials or claim text. */
  changedFields: readonly string[];
  requiresHumanReview: true;
}

export interface GraphSnapshotDiff {
  schemaVersion: '1.0';
  baselineDigest: string;
  candidateDigest: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    reviewRequired: boolean;
  };
  changes: readonly GraphSnapshotDelta[];
}

function normalizeNode(node: GraphNode): GraphNode {
  if (node.kind === 'claim') {
    return { ...node, sourceIds: [...node.sourceIds].sort() };
  }
  if (node.kind === 'engagement') {
    return { ...node, areas: [...node.areas].sort() };
  }
  return node;
}

function normalizeRelation(relation: GraphRelation): GraphRelation {
  return { ...relation, sourceIds: [...relation.sourceIds].sort() };
}

function relationKey(relation: GraphRelation): string {
  return [relation.from, relation.type, relation.to].join('|');
}

function entries(graph: EvidenceGraphSnapshot): {
  nodes: Map<string, GraphNode>;
  relations: Map<string, GraphRelation>;
} {
  const nodes = new Map(graph.nodes.map((node) => [node.id, normalizeNode(node)] as const));
  const relations = new Map<string, GraphRelation>();
  for (const relation of graph.relations) {
    const key = relationKey(relation);
    if (relations.has(key)) throw new Error('GRAPH_DUPLICATE_RELATION');
    relations.set(key, normalizeRelation(relation));
  }
  return { nodes, relations };
}

function stableDigest(parts: ReturnType<typeof entries>): string {
  const ordered = {
    nodes: [...parts.nodes].sort(([a], [b]) => a.localeCompare(b)),
    relations: [...parts.relations].sort(([a], [b]) => a.localeCompare(b)),
  };
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

function fieldsChanged(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function compare<T extends { kind?: string; type?: string }>(
  entity: GraphSnapshotDelta['entity'],
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
): GraphSnapshotDelta[] {
  const changes: GraphSnapshotDelta[] = [];
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  for (const key of keys) {
    const oldValue = before.get(key);
    const newValue = after.get(key);
    const changedFields =
      oldValue && newValue
        ? fieldsChanged(oldValue as Record<string, unknown>, newValue as Record<string, unknown>)
        : [];
    if (oldValue && newValue && changedFields.length === 0) continue;
    const value = newValue ?? oldValue!;
    changes.push({
      entity,
      key,
      kind: value.kind ?? value.type ?? 'unknown',
      change: !oldValue ? 'added' : !newValue ? 'removed' : 'modified',
      changedFields,
      requiresHumanReview: true,
    });
  }
  return changes;
}

/**
 * Read-only F3.6 preview between two valid PPKS graph snapshots.
 * Never imports into Neo4j, guesses missing claims or authorizes publication.
 */
export function diffGraphSnapshots(
  baseline: EvidenceGraphSnapshot,
  candidate: EvidenceGraphSnapshot,
): GraphSnapshotDiff {
  const before = entries(evidenceGraphSnapshotSchema.parse(baseline));
  const after = entries(evidenceGraphSnapshotSchema.parse(candidate));
  const changes = [
    ...compare('node', before.nodes, after.nodes),
    ...compare('relation', before.relations, after.relations),
  ];
  return {
    schemaVersion: '1.0',
    baselineDigest: stableDigest(before),
    candidateDigest: stableDigest(after),
    summary: {
      added: changes.filter((change) => change.change === 'added').length,
      removed: changes.filter((change) => change.change === 'removed').length,
      modified: changes.filter((change) => change.change === 'modified').length,
      reviewRequired: changes.length > 0,
    },
    changes,
  };
}
