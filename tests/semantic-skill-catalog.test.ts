import { describe, expect, it } from 'vitest';
import { makeSemanticSkillCatalog } from '../evaluation/semantic-skill-catalog.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

describe('F3.7 ONNX lab catalog export', () => {
  it('exports only public-facing skill identifiers and labels from real PPKS', async () => {
    const catalog = makeSemanticSkillCatalog(await projectPpksEvidenceGraph());
    expect(catalog.schemaVersion).toBe('semantic-skill-catalog-v0');
    expect(catalog.skills.length).toBeGreaterThan(0);
    expect(catalog.skills.every((entry) => Object.keys(entry).join() === 'id,label')).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain('sourceIds');
    expect(JSON.stringify(catalog)).not.toContain('claim-');
    expect(JSON.stringify(catalog)).not.toContain('academic_record');
  });

  it('never exports claims and sources as catalog entries', () => {
    const snapshot: EvidenceGraphSnapshot = {
      schemaVersion: '1.0',
      nodes: [
        { kind: 'skill', id: 'skill-java', label: 'Java' },
        {
          kind: 'source',
          id: 'source-internal',
          label: 'do not export',
          origin: 'academic_record',
          visibility: 'private',
          verificationStatus: 'document_verified',
        },
        {
          kind: 'claim',
          id: 'claim-credential',
          label: 'not public',
          subjectId: 'candidate',
          predicate: 'USES_TECHNOLOGY',
          objectId: 'skill-java',
          scope: 'study',
          sourceIds: ['source-internal'],
        },
      ],
      relations: [],
    };
    expect(makeSemanticSkillCatalog(snapshot)).toEqual({
      schemaVersion: 'semantic-skill-catalog-v0',
      origin: 'ppks_public_project_and_engagement_technology_labels',
      skills: [{ id: 'skill-java', label: 'Java' }],
    });
  });
});
