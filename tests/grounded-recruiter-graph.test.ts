import { describe, expect, it, vi } from 'vitest';
import { createGroundedRecruiterGraph } from '../apps/orbe-node/src/application/grounded-recruiter-graph.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const source: EvidenceSource = {
  kind: 'source',
  id: 'source-sig-java',
  label: 'SIG / Java source',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const privateSource: EvidenceSource = {
  ...source,
  id: 'source-private',
  visibility: 'private',
  label: 'Private file',
};
const req = (id: string): VacancyRequirement => ({
  kind: 'vacancy_requirement',
  id,
  label: 'Java',
  mandatory: true,
});
const claim = (id: string, sourceIds: string[]) => ({
  kind: 'claim' as const,
  id,
  label: 'Java documentado em projeto',
  subjectId: 'project-sig',
  predicate: 'USES_TECHNOLOGY' as const,
  objectId: 'skill-java',
  scope: 'professional_project' as const,
  sourceIds,
});

describe('F3.3: staged, deterministic LangGraph orchestration', () => {
  it('routes a complete public evidence chain through all six nodes without an LLM call', async () => {
    const reader: EvidenceGraphRepository = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          requirementId: 'java',
          claims: [claim('claim-java', ['source-sig-java'])],
          sources: [source],
        },
      ]),
      getSource: vi.fn(),
    };
    const result = await createGroundedRecruiterGraph({
      identifyRequirements: () => [req('java')],
      evidence: reader,
    }).invoke({ question: '  Java?  ' }, { recursionLimit: 12 });
    expect(result.decision).toBe('verified');
    expect(result.requirements).toHaveLength(1);
    expect(result.answer).toContain('Java documentado em projeto');
    expect(result.answer).toContain('professional_project');
    expect(result.answer).toContain('source-sig-java');
    expect(result.answer).not.toContain('anos');
  });

  it('abstains when a claim depends on a private source', async () => {
    const reader: EvidenceGraphRepository = {
      findEvidence: vi.fn().mockResolvedValue([
        {
          requirementId: 'java',
          claims: [claim('mixed', ['source-sig-java', 'source-private'])],
          sources: [source, privateSource],
        },
      ]),
      getSource: vi.fn(),
    };
    const result = await createGroundedRecruiterGraph({
      identifyRequirements: () => [req('java')],
      evidence: reader,
    }).invoke({ question: 'Java' }, { recursionLimit: 12 });
    expect(result.decision).toBe('abstain');
    expect(result.answer).toContain('Evidências públicas insuficientes');
    expect(JSON.stringify({ answer: result.answer, matches: result.matches })).not.toContain(
      'Private file',
    );
  });

  it('abstains on Neo4j failure, preserving the caller-owned canonical fallback', async () => {
    const reader: EvidenceGraphRepository = {
      findEvidence: vi.fn().mockRejectedValue(new Error('secret/internal detail')),
      getSource: vi.fn(),
    };
    const result = await createGroundedRecruiterGraph({
      identifyRequirements: () => [req('java')],
      evidence: reader,
    }).invoke({ question: 'Java' }, { recursionLimit: 12 });
    expect(result.decision).toBe('abstain');
    expect(result.answer).not.toContain('secret');
    expect(result.retrievalFailed).toBe(true);
  });

  it('preserves more than 29 requirements without silently dropping them', async () => {
    const requirements = Array.from({ length: 33 }, (_, index) => req('req-' + index));
    const reader: EvidenceGraphRepository = {
      findEvidence: vi
        .fn()
        .mockImplementation(async (items: VacancyRequirement[]) =>
          items.map((item) => ({ requirementId: item.id, claims: [], sources: [] })),
        ),
      getSource: vi.fn(),
    };
    const result = await createGroundedRecruiterGraph({
      identifyRequirements: () => requirements,
      evidence: reader,
    }).invoke({ question: 'Compare a lista de requisitos' }, { recursionLimit: 12 });
    expect(result.requirements).toHaveLength(33);
    expect(result.matches).toHaveLength(33);
    expect(result.decision).toBe('abstain');
  });
});
