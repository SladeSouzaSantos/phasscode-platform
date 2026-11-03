import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { deriveCuratedTransferableSkills } from '../apps/orbe-node/src/application/graph-transfer-planner.js';
import { createStructuredVacancyPlanner } from '../apps/orbe-node/src/application/graph-vacancy-plan.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import type {
  EvidenceGraphRepository,
  EvidenceGraphMatch,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const catalog = [
  { id: 'skill-java', label: 'Java' },
  { id: 'skill-javascript', label: 'JavaScript' },
  { id: 'skill-sql', label: 'SQL' },
  { id: 'skill-sql-server', label: 'SQL Server', aliases: ['MSSQL'] },
  { id: 'skill-react', label: 'React', aliases: ['ReactJS'] },
];
const planner = createStructuredVacancyPlanner(catalog);

const java: VacancyRequirement = {
  kind: 'vacancy_requirement',
  id: 'skill-java',
  label: 'Java',
  mandatory: true,
};
const react: VacancyRequirement = {
  kind: 'vacancy_requirement',
  id: 'skill-react',
  label: 'React',
  mandatory: true,
};

const repo = (findEvidence: EvidenceGraphRepository['findEvidence']): EvidenceGraphRepository => ({
  findEvidence,
  getSource: vi.fn(),
});

describe('F3.3 no-loss structured vacancy requirements', () => {
  it('preserves required, desirable and unknown skills without false equivalences', () => {
    const plan = planner([
      { label: 'JavaScript', mandatory: true },
      { label: 'SQL Server', mandatory: true },
      { label: 'ReactJS', mandatory: false },
      { label: 'Go', mandatory: true },
      { label: 'AWS Certified Developer', mandatory: false },
    ]);
    expect(plan.requirements.map((r) => [r.id, r.mandatory])).toEqual([
      ['skill-javascript', true],
      ['skill-sql-server', true],
      ['skill-react', false],
    ]);
    expect(plan.unknown).toEqual([
      { label: 'Go', mandatory: true },
      { label: 'AWS Certified Developer', mandatory: false },
    ]);
  });

  it('deduplicates aliases while retaining mandatory requirements', () => {
    const plan = planner([
      { label: 'ReactJS', mandatory: false },
      { label: 'React', mandatory: true },
      { label: 'Go', mandatory: false },
      { label: 'GO', mandatory: true },
    ]);
    expect(plan.requirements).toEqual([{ ...react, mandatory: true }]);
    expect(plan.unknown).toEqual([{ label: 'Go', mandatory: true }]);
  });

  it('keeps 40+ distinct requirements without truncation', () => {
    const extensive = createStructuredVacancyPlanner(
      Array.from({ length: 45 }, (_, index) => ({
        id: 'skill-' + index,
        label: 'Technology ' + index,
      })),
    );
    const plan = extensive(
      Array.from({ length: 45 }, (_, index) => ({
        label: 'Technology ' + index,
        mandatory: index % 2 === 0,
      })),
    );
    expect(plan.requirements).toHaveLength(45);
    expect(plan.unknown).toEqual([]);
    expect(plan.requirements[44]?.mandatory).toBe(true);
  });

  it('requires a canonical fallback when even one explicit vacancy requirement is unknown', async () => {
    const findEvidence = vi.fn(async () => [] as EvidenceGraphMatch[]);
    const canonical = vi.fn(async () => 'Análise da vaga com base PPKS, sem omitir Go');
    const output = await evaluateGraphRecruiterPreview('Compare a vaga', {
      evidence: repo(findEvidence),
      identifyRequirements: () => [java],
      requirementPlan: () =>
        planner([
          { label: 'Java', mandatory: true },
          { label: 'Go', mandatory: false },
        ]),
      canonicalPpks: canonical,
    });
    expect(output).toMatchObject({
      mode: 'canonical_ppks',
      reason: 'unrecognized_requirements',
      unrecognizedRequirements: ['Go'],
    });
    expect(canonical).toHaveBeenCalledOnce();
    expect(findEvidence).not.toHaveBeenCalled();
  });

  it('passes desirable status to graph evidence when all items are known', async () => {
    const findEvidence = vi.fn(async (items: readonly VacancyRequirement[]) =>
      items.map((r) => ({
        requirementId: r.id,
        claims: [
          {
            kind: 'claim' as const,
            id: 'claim-' + r.id,
            label: 'Projeto em ' + r.label,
            subjectId: 'project-one',
            predicate: 'USES_TECHNOLOGY' as const,
            objectId: r.id,
            scope: 'personal_project' as const,
            sourceIds: ['public-id'],
          },
        ],
        sources: [
          {
            kind: 'source' as const,
            id: 'public-id',
            label: 'Projeto público',
            origin: 'github' as const,
            visibility: 'public' as const,
            verificationStatus: 'code_reviewed' as const,
          },
        ],
      })),
    );
    const output = await evaluateGraphRecruiterPreview('Descrição estruturada', {
      evidence: repo(findEvidence),
      identifyRequirements: () => [],
      requirementPlan: () => planner([{ label: 'ReactJS', mandatory: false }]),
      canonicalPpks: () => 'PPKS',
    });
    expect(output.mode).toBe('verified_graph');
    expect(findEvidence.mock.calls[0]?.[0]?.[0]?.mandatory).toBe(false);
  });

  it('refuses ambiguous aliases instead of conflating technologies', () => {
    expect(() =>
      createStructuredVacancyPlanner([
        { id: 'skill-js', label: 'JavaScript', aliases: ['JS'] },
        { id: 'skill-node', label: 'Node', aliases: ['JS'] },
      ]),
    ).toThrow('GRAPH_VACANCY_AMBIGUOUS_ALIAS');
  });
});

describe('F3.3 transferable foundations from the real PPKS graph', () => {
  it('only derives the explicitly curated direction Java to React', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    const semantic = JSON.parse(
      await readFile('knowledge/ppks/semantic-relations.json', 'utf8'),
    ) as unknown;
    const rules = deriveCuratedTransferableSkills(
      snapshot,
      semantic as Parameters<typeof deriveCuratedTransferableSkills>[1],
    );
    expect(rules['skill-react']?.map((item) => item.id)).toContain('skill-java');
    expect(rules['skill-java']).toBeUndefined();
    expect(rules['skill-go']).toBeUndefined();
    expect(rules['skill-postgresql']).toBeUndefined();
    expect(rules['skill-firebase']).toBeUndefined();
  });

  it('rejects fabricated or missing semantic endpoints', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    expect(() =>
      deriveCuratedTransferableSkills(snapshot, {
        schemaVersion: '1.0',
        nodes: [
          { id: 'a', skill: 'Java' },
          { id: 'b', skill: 'Go' },
        ],
        edges: [{ from: 'a', to: 'b', relation: 'transferable_foundation' }],
      }),
    ).toThrow('GRAPH_TRANSFER_UNMAPPED_ENDPOINT');
    expect(() =>
      deriveCuratedTransferableSkills(snapshot, {
        schemaVersion: '1.0',
        nodes: [{ id: 'a', skill: 'Java' }],
        edges: [{ from: 'a', to: 'missing', relation: 'transferable_foundation' }],
      }),
    ).toThrow('GRAPH_TRANSFER_DANGLING_EDGE');
  });

  it('uses curated Java evidence as React adaptation potential, never as React employment', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    const semantic = JSON.parse(
      await readFile('knowledge/ppks/semantic-relations.json', 'utf8'),
    ) as Parameters<typeof deriveCuratedTransferableSkills>[1];
    const transferableSkills = deriveCuratedTransferableSkills(snapshot, semantic);
    const publicSource = {
      kind: 'source' as const,
      id: 'source-sig',
      label: 'SIGAA',
      origin: 'github' as const,
      visibility: 'public' as const,
      verificationStatus: 'code_reviewed' as const,
    };
    const findEvidence = vi.fn(async (items: readonly VacancyRequirement[]) =>
      items.map((r) =>
        r.id === 'skill-java'
          ? {
              requirementId: r.id,
              claims: [
                {
                  kind: 'claim' as const,
                  id: 'claim-java',
                  label: 'Java no SIGAA',
                  subjectId: 'project-sig',
                  predicate: 'USES_TECHNOLOGY' as const,
                  objectId: 'skill-java',
                  scope: 'professional' as const,
                  sourceIds: [publicSource.id],
                },
              ],
              sources: [publicSource],
            }
          : { requirementId: r.id, claims: [], sources: [] },
      ),
    );
    const output = await evaluateGraphRecruiterPreview('React', {
      identifyRequirements: () => [react],
      evidence: repo(findEvidence),
      canonicalPpks: () => 'Resposta canônica',
      transferableSkills,
    });
    expect(output.mode).toBe('transferable_graph');
    expect(output.answer).toContain('Java no SIGAA');
    expect(output.answer).toContain('Não consta atuação direta');
    expect(output.answer).not.toContain('experiência profissional com React');
  });
});
