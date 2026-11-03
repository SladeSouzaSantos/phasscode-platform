import { describe, expect, it } from 'vitest';
import { verifyAndRenderNarrativeSelection } from '../apps/orbe-node/src/application/graph-narrative-verifier.js';
import type {
  EvidenceGraphMatch,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const java: VacancyRequirement = {
  kind: 'vacancy_requirement',
  id: 'skill-java',
  label: 'Java',
  mandatory: true,
};
const source: EvidenceSource = {
  kind: 'source',
  id: 'source-java',
  label: 'Experiência SIGAA',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const match: EvidenceGraphMatch = {
  requirementId: java.id,
  claims: [{
    kind: 'claim',
    id: 'claim-java',
    label: 'Desenvolvimento Java no SIGAA',
    subjectId: 'project-sig',
    objectId: 'skill-java',
    predicate: 'USES_TECHNOLOGY',
    scope: 'professional',
    sourceIds: [source.id],
  }],
  sources: [source],
};
const choice = {
  statements: [{ requirementId: java.id, claimIds: ['claim-java'] }],
};

describe('F3.3 claim-identifier verification before recruiter prose', () => {
  it('renders a positive answer from verified public statements and source IDs', () => {
    const answer = verifyAndRenderNarrativeSelection([java], [match], choice);
    expect(answer).toContain('Desenvolvimento Java no SIGAA');
    expect(answer).toContain('experiência profissional');
    expect(answer).toContain('source-java');
    expect(answer).not.toMatch(/\b\d+ anos\b/);
  });

  it('rejects invented claim IDs and unsupported prose fields', () => {
    expect(
      verifyAndRenderNarrativeSelection([java], [match], {
        statements: [{ requirementId: java.id, claimIds: ['claim-invented'] }],
      }),
    ).toBeUndefined();
    expect(
      verifyAndRenderNarrativeSelection([java], [match], {
        statements: [{
          requirementId: java.id,
          claimIds: ['claim-java'],
          text: 'Pedro trabalhou com Go durante 10 anos',
        }],
      }),
    ).toBeUndefined();
  });

  it('rejects private or incomplete source chains', () => {
    const privateSource: EvidenceSource = {
      ...source, id: 'source-private', visibility: 'private',
    };
    expect(
      verifyAndRenderNarrativeSelection(
        [java],
        [{ ...match, sources: [source, privateSource], claims: [
          { ...match.claims[0]!, sourceIds: [source.id, privateSource.id] },
        ] }],
        choice,
      ),
    ).toBeUndefined();
    expect(
      verifyAndRenderNarrativeSelection(
        [java],
        [{ ...match, sources: [] }],
        choice,
      ),
    ).toBeUndefined();
  });

  it('refuses unknown scope, duplicate or partial requirement plans', () => {
    expect(
      verifyAndRenderNarrativeSelection(
        [java],
        [{ ...match, claims: [{ ...match.claims[0]!, scope: 'unknown' }] }],
        choice,
      ),
    ).toBeUndefined();
    expect(
      verifyAndRenderNarrativeSelection([java], [match], {
        statements: [
          { requirementId: java.id, claimIds: ['claim-java'] },
          { requirementId: java.id, claimIds: ['claim-java'] },
        ],
      }),
    ).toBeUndefined();
    expect(
      verifyAndRenderNarrativeSelection(
        [java, { ...java, id: 'skill-react', label: 'React' }],
        [match],
        choice,
      ),
    ).toBeUndefined();
  });
});
