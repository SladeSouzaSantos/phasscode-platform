import { describe, expect, it } from 'vitest';
import {
  evidenceGraphSnapshotSchema,
  evidenceSourceSchema,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const source = {
  kind: 'source',
  id: 'ppks-project',
  label: 'Ficha técnica curada',
  origin: 'ppks_catalog',
  visibility: 'public',
  verificationStatus: 'catalog_only',
  sourceUrl: 'https://github.com/SladeSouzaSantos/phasscode-platform',
} as const;

const project = {
  kind: 'project',
  id: 'phasscode-platform',
  label: 'PHASSCODE Platform',
  category: 'personal',
} as const;

const skill = { kind: 'skill', id: 'typescript', label: 'TypeScript' } as const;

const claim = {
  kind: 'claim',
  id: 'platform-typescript',
  label: 'O projeto PHASSCODE usa TypeScript',
  subjectId: 'phasscode-platform',
  predicate: 'USES_TECHNOLOGY',
  objectId: 'typescript',
  scope: 'personal_project',
  sourceIds: ['ppks-project'],
} as const;

const graph = () => ({
  schemaVersion: '1.0' as const,
  nodes: [source, project, skill, claim],
  relations: [
    {
      from: 'phasscode-platform',
      to: 'typescript',
      type: 'USES_TECHNOLOGY' as const,
      sourceIds: ['ppks-project'],
    },
  ],
});

describe('GraphRAG F3.1: contrato de proveniência tipada', () => {
  it('aceita claim de projeto com fonte explícita sem equiparar a emprego', () => {
    const parsed = evidenceGraphSnapshotSchema.parse(graph());
    expect(parsed.nodes.find((node) => node.id === 'platform-typescript')).toMatchObject({
      kind: 'claim',
      scope: 'personal_project',
      sourceIds: ['ppks-project'],
    });
  });

  it('recusa claim sem fonte e com fonte de outro tipo', () => {
    const missing = graph();
    missing.nodes[3] = { ...claim, sourceIds: [] };
    expect(evidenceGraphSnapshotSchema.safeParse(missing).success).toBe(false);

    const wrong = graph();
    wrong.nodes[3] = { ...claim, sourceIds: ['typescript'] };
    expect(evidenceGraphSnapshotSchema.safeParse(wrong).success).toBe(false);
  });

  it('recusa relacionamento com origem desconhecida e IDs duplicados', () => {
    const dangling = graph();
    dangling.relations[0] = { ...dangling.relations[0]!, to: 'react' };
    expect(evidenceGraphSnapshotSchema.safeParse(dangling).success).toBe(false);

    const duplicate = graph();
    duplicate.nodes.push({ ...skill, id: 'phasscode-platform' });
    expect(evidenceGraphSnapshotSchema.safeParse(duplicate).success).toBe(false);
  });

  it('não permite classificar trabalho misto de Geowellex como exclusivo de software', () => {
    const candidate = { kind: 'candidate', id: 'candidate', label: 'Candidato' } as const;
    const company = { kind: 'company', id: 'geowellex', label: 'Geowellex' } as const;
    const engagement = {
      kind: 'engagement',
      id: 'experience-geowellex',
      label: 'Mud logging e desenvolvimento',
      candidateId: 'candidate',
      companyId: 'geowellex',
      type: 'employee',
      softwareWorkScope: 'exclusive',
      areas: ['engineering', 'software-development'],
      startedAt: '2017-03',
      endedAt: '2018-10',
    } as const;
    const invalid = { schemaVersion: '1.0', nodes: [candidate, company, engagement], relations: [] };
    expect(evidenceGraphSnapshotSchema.safeParse(invalid).success).toBe(false);
    expect(
      evidenceGraphSnapshotSchema.safeParse({
        ...invalid,
        nodes: [candidate, company, { ...engagement, softwareWorkScope: 'mixed' }],
      }).success,
    ).toBe(true);
  });

  it('preserva fonte privada sem fabricar URL ou SHA de revisão', () => {
    const parsed = evidenceSourceSchema.parse({
      ...source,
      id: 'diploma-declarado',
      origin: 'academic_record',
      visibility: 'private',
      verificationStatus: 'owner_confirmed',
      sourceUrl: undefined,
    });
    expect(parsed.sourceUrl).toBeUndefined();
    expect(parsed.sourceCommit).toBeUndefined();
    expect(parsed.verificationStatus).toBe('owner_confirmed');
  });
});
