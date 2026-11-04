import { describe, expect, it } from 'vitest';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { diffGraphSnapshots } from '../apps/orbe-node/src/application/graph-snapshot-diff.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const baseline: EvidenceGraphSnapshot = {
  schemaVersion: '1.0',
  nodes: [
    { kind: 'candidate', id: 'candidate', label: 'Public candidate' },
    { kind: 'project', id: 'project-main', label: 'Project', category: 'personal' },
    { kind: 'project', id: 'project-legacy', label: 'Legacy', category: 'study' },
    { kind: 'skill', id: 'skill-typescript', label: 'TypeScript' },
    {
      kind: 'source',
      id: 'source-public',
      label: 'Public code',
      origin: 'github',
      visibility: 'public',
      verificationStatus: 'code_reviewed',
      sourceUrl: 'https://github.com/example/project/blob/first/README.md',
      sourceCommit: 'a'.repeat(40),
      lastModified: '2026-11-01T00:00:00Z',
    },
    {
      kind: 'source',
      id: 'source-secondary',
      label: 'Public tests',
      origin: 'github',
      visibility: 'public',
      verificationStatus: 'code_reviewed',
      sourceUrl: 'https://github.com/example/project/blob/first/tests.ts',
    },
    {
      kind: 'claim',
      id: 'claim-main-typescript',
      label: 'Project uses TypeScript',
      subjectId: 'project-main',
      predicate: 'USES_TECHNOLOGY',
      objectId: 'skill-typescript',
      scope: 'personal_project',
      sourceIds: ['source-public', 'source-secondary'],
    },
  ],
  relations: [
    {
      from: 'project-main',
      to: 'skill-typescript',
      type: 'USES_TECHNOLOGY',
      sourceIds: ['source-public', 'source-secondary'],
    },
  ],
};

describe('F3.6 PPKS offline diff requires review before Neo4j mutations', () => {
  it('is reproducible and zero-change for repeated identical snapshots', () => {
    const a = diffGraphSnapshots(baseline, baseline);
    const b = diffGraphSnapshots(baseline, structuredClone(baseline));
    expect(a).toEqual(b);
    expect(a.summary).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
      reviewRequired: false,
    });
    expect(a.changes).toEqual([]);
    expect(a.baselineDigest).toBe(a.candidateDigest);
  });

  it('ignores node/edge ordering and unordered source reference sets', () => {
    const reordered: EvidenceGraphSnapshot = {
      ...baseline,
      nodes: [...baseline.nodes].reverse().map((node) =>
        node.kind === 'claim' ? { ...node, sourceIds: [...node.sourceIds].reverse() } : node,
      ),
      relations: baseline.relations.map((edge) => ({
        ...edge,
        sourceIds: [...edge.sourceIds].reverse(),
      })),
    };
    const result = diffGraphSnapshots(baseline, reordered);
    expect(result.changes).toEqual([]);
    expect(result.baselineDigest).toBe(result.candidateDigest);
  });

  it('reports new, removed and modified records with field names, without evidence content', () => {
    const candidate: EvidenceGraphSnapshot = {
      ...baseline,
      nodes: [
        ...baseline.nodes
          .filter((node) => node.id !== 'project-legacy')
          .map((node) =>
            node.id === 'source-public' && node.kind === 'source'
              ? {
                  ...node,
                  sourceCommit: 'b'.repeat(40),
                  lastModified: '2026-11-04T00:00:00Z',
                }
              : node.id === 'project-main' && node.kind === 'project'
                ? { ...node, label: 'Reviewed project title' }
                : node,
          ),
        { kind: 'project', id: 'project-added', label: 'New project', category: 'study' },
      ],
    };
    const result = diffGraphSnapshots(baseline, candidate);
    expect(result.summary).toEqual({
      added: 1,
      removed: 1,
      modified: 2,
      reviewRequired: true,
    });
    expect(result.changes).toContainEqual({
      entity: 'node',
      key: 'source-public',
      kind: 'source',
      change: 'modified',
      changedFields: ['lastModified', 'sourceCommit'],
      requiresHumanReview: true,
    });
    expect(JSON.stringify(result)).not.toContain('https://github.com');
    expect(JSON.stringify(result)).not.toContain('Reviewed project title');
    expect(JSON.stringify(result)).not.toContain('2026-11-04T');
    expect(diffGraphSnapshots(baseline, candidate)).toEqual(result);
  });

  it('reports changed relationship provenance without changing any graph', () => {
    const input = structuredClone(baseline);
    input.relations[0]!.sourceIds = ['source-public'];
    const result = diffGraphSnapshots(baseline, input);
    expect(result.changes).toEqual([
      {
        entity: 'relation',
        key: 'project-main|USES_TECHNOLOGY|skill-typescript',
        kind: 'USES_TECHNOLOGY',
        change: 'modified',
        changedFields: ['sourceIds'],
        requiresHumanReview: true,
      },
    ]);
    expect(baseline.relations[0]!.sourceIds).toHaveLength(2);
  });

  it('fails closed on unknown source references, schema mismatches and duplicate edges', () => {
    const dangling = structuredClone(baseline);
    dangling.relations[0]!.sourceIds = ['source-absent'];
    expect(() => diffGraphSnapshots(baseline, dangling)).toThrow();
    expect(() =>
      diffGraphSnapshots(baseline, { ...baseline, schemaVersion: '2.0' } as never),
    ).toThrow();
    const duplicate: EvidenceGraphSnapshot = {
      ...baseline,
      relations: [...baseline.relations, ...baseline.relations],
    };
    expect(() => diffGraphSnapshots(baseline, duplicate)).toThrow('GRAPH_DUPLICATE_RELATION');
  });

  it('accepts the real PPKS projection without requiring Neo4j or network access', async () => {
    const graph = await projectPpksEvidenceGraph();
    const result = diffGraphSnapshots(graph, graph);
    expect(result.summary.reviewRequired).toBe(false);
    expect(result.changes).toEqual([]);
  });
});
