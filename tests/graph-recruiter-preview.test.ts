import { describe, expect, it, vi } from 'vitest';
import { createCatalogRequirementIdentifier } from '../apps/orbe-node/src/application/graph-requirements.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const catalog = [
  { id: 'skill-java', label: 'Java' },
  { id: 'skill-javascript', label: 'JavaScript', aliases: ['JS'] },
  { id: 'skill-sql', label: 'SQL' },
  { id: 'skill-sql-server', label: 'SQL Server', aliases: ['MSSQL'] },
  { id: 'skill-postgresql', label: 'PostgreSQL', aliases: ['Postgres'] },
  { id: 'skill-react', label: 'React', aliases: ['ReactJS'] },
  { id: 'skill-python', label: 'Python' },
];
const identifyRequirements = createCatalogRequirementIdentifier(catalog);
const source: EvidenceSource = {
  kind: 'source',
  id: 'source-public',
  label: 'Documented project',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const matching = (requirements: readonly VacancyRequirement[]) =>
  requirements.map((item) => ({
    requirementId: item.id,
    claims: [
      {
        kind: 'claim' as const,
        id: 'claim-' + item.id,
        label: item.label + ' documentado no projeto',
        subjectId: 'project-one',
        predicate: 'USES_TECHNOLOGY' as const,
        objectId: item.id,
        scope: 'personal_project' as const,
        sourceIds: [source.id],
      },
    ],
    sources: [source],
  }));
const reader = (
  findEvidence: EvidenceGraphRepository['findEvidence'],
): EvidenceGraphRepository => ({
  findEvidence,
  getSource: vi.fn(async () => source),
});

describe('F3.3 catalog-driven requirement planning (no invented equivalences)', () => {
  it('distinguishes Java from JavaScript and SQL Server from SQL', () => {
    expect(
      identifyRequirements('Precisa de JavaScript, SQL Server e ReactJS?').map((r) => r.id),
    ).toEqual(['skill-javascript', 'skill-sql-server', 'skill-react']);
    expect(identifyRequirements('Experiência com Java e SQL').map((r) => r.id)).toEqual([
      'skill-java',
      'skill-sql',
    ]);
  });

  it('uses curated aliases without translating an adjacent technology into experience', () => {
    expect(identifyRequirements('Postgres e MSSQL').map((r) => r.id)).toEqual([
      'skill-postgresql',
      'skill-sql-server',
    ]);
    expect(identifyRequirements('POO e NoSQL')).toEqual([]);
  });

  it('rejects ambiguous skills instead of guessing intent', () => {
    expect(() =>
      createCatalogRequirementIdentifier([
        { id: 'one', label: 'JavaScript', aliases: ['JS'] },
        { id: 'two', label: 'Node', aliases: ['JS'] },
      ]),
    ).toThrow('GRAPH_AMBIGUOUS_SKILL_ALIAS');
  });

  it('keeps every explicit item in a list longer than the old 29-requirement matrix', () => {
    const many = createCatalogRequirementIdentifier(
      Array.from({ length: 40 }, (_, n) => ({
        id: 'skill-' + n,
        label: 'Technology ' + n,
      })),
    );
    const result = many(Array.from({ length: 40 }, (_, n) => 'Technology ' + n).join(', '));
    expect(result).toHaveLength(40);
    expect(result[39]?.id).toBe('skill-39');
  });
});

describe('F3.3 graph-backed answer with source-of-truth fallback, offline', () => {
  it('renders a verified answer when every requested requirement has public claims', async () => {
    const canonical = vi.fn(() => 'Resposta canônica');
    const output = await evaluateGraphRecruiterPreview('Java e Python', {
      identifyRequirements,
      evidence: reader(async (requirements) => matching(requirements)),
      canonicalPpks: canonical,
    });
    expect(output.mode).toBe('verified_graph');
    expect(output.matchedRequirements).toBe(2);
    expect(output.answer).toContain('Java documentado no projeto');
    expect(output.answer).toContain('Python documentado no projeto');
    expect(canonical).not.toHaveBeenCalled();
  });

  it('falls back once if one of the requested requirements has no direct evidence', async () => {
    const canonical = vi.fn(() => 'PPKS completo para Java e React');
    const output = await evaluateGraphRecruiterPreview('Java, React', {
      identifyRequirements,
      evidence: reader(async (requirements) =>
        matching(requirements).map((match) =>
          match.requirementId === 'skill-react' ? { ...match, claims: [], sources: [] } : match,
        ),
      ),
      canonicalPpks: canonical,
    });
    expect(output.mode).toBe('canonical_ppks');
    expect(output.answer).toBe('PPKS completo para Java e React');
    expect(canonical).toHaveBeenCalledTimes(1);
  });

  it('falls back when the graph is down, never repeating private errors', async () => {
    const canonical = vi.fn(() => 'Fonte PPKS');
    const output = await evaluateGraphRecruiterPreview('Java', {
      identifyRequirements,
      evidence: reader(async () => {
        throw new Error('private-db-password');
      }),
      canonicalPpks: canonical,
    });
    expect(output).toMatchObject({ mode: 'canonical_ppks', answer: 'Fonte PPKS' });
    expect(JSON.stringify(output)).not.toContain('private-db-password');
    expect(canonical).toHaveBeenCalledTimes(1);
  });

  it('falls back on unfamiliar requests without issuing a graph read', async () => {
    const remote = vi.fn(async () => []);
    const output = await evaluateGraphRecruiterPreview('Sem indicação de tecnologia', {
      identifyRequirements,
      evidence: reader(remote),
      canonicalPpks: () => 'Resposta geral PPKS',
    });
    expect(output).toMatchObject({
      mode: 'canonical_ppks',
      reason: 'no_requirements',
      answer: 'Resposta geral PPKS',
    });
    expect(remote).not.toHaveBeenCalled();
  });

  it('does not fallback on a verified answer and does not invent years of experience', async () => {
    const output = await evaluateGraphRecruiterPreview('Java', {
      identifyRequirements,
      evidence: reader(async (requirements) => matching(requirements)),
      canonicalPpks: () => 'Não deveria ser executado',
    });
    expect(output.answer).toContain('personal_project');
    expect(output.answer).not.toMatch(/\b\d+\s+anos\b/i);
  });
});
