import { describe, expect, it, vi } from 'vitest';
import { renderProfessionalAdvocacy } from '../apps/orbe-node/src/application/graph-professional-advocacy.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import type {
  EvidenceClaim,
  EvidenceGraphMatch,
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const req = (id: string, label: string): VacancyRequirement => ({
  kind: 'vacancy_requirement',
  id,
  label,
  mandatory: true,
});
const java = req('skill-java', 'Java');
const go = req('skill-go', 'Go');
const python = req('skill-python', 'Python');
const src: EvidenceSource = {
  kind: 'source',
  id: 'source-public',
  label: 'Repositório público',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const secret: EvidenceSource = {
  ...src,
  id: 'source-secret',
  label: 'Registro privado',
  visibility: 'private',
};
const claim = (
  id: string,
  label: string,
  scope: EvidenceClaim['scope'],
  sourceIds: string[] = [src.id],
): EvidenceClaim => ({
  kind: 'claim',
  id,
  label,
  subjectId: 'project-one',
  predicate: 'USES_TECHNOLOGY',
  objectId: 'skill-java',
  scope,
  sourceIds,
});
const match = (requirement: VacancyRequirement, claims: EvidenceClaim[]): EvidenceGraphMatch => ({
  requirementId: requirement.id,
  claims,
  sources: [src],
});
const javaProfessional = match(java, [
  claim('claim-java-professional', 'Java no desenvolvimento do SIGAA', 'professional'),
]);
const pythonProject = match(python, [
  claim('claim-python-project', 'Python no HSP Simulator', 'personal_project'),
]);
const goMissing = match(go, []);

const repository = (
  findEvidence: EvidenceGraphRepository['findEvidence'],
): EvidenceGraphRepository => ({ findEvidence, getSource: vi.fn(async () => src) });

describe('F3.3 professional advocacy with verified evidence', () => {
  it('leads with direct experience and projects, without an absence audit', () => {
    const answer = renderProfessionalAdvocacy([java, python], [javaProfessional, pythonProject]);
    expect(answer).toContain('Java no desenvolvimento do SIGAA');
    expect(answer).toContain('experiência profissional');
    expect(answer).toContain('Python no HSP Simulator');
    expect(answer).toContain('projeto autoral');
    expect(answer).not.toContain('Não consta atuação');
    expect(answer).not.toContain('não possui projetos');
  });

  it('presents Go as an explicit gap plus substantiated transferable foundations', () => {
    const answer = renderProfessionalAdvocacy(
      [go],
      [goMissing],
      new Map([[go.id, [javaProfessional, pythonProject]]]),
    );
    expect(answer).toContain('Go:');
    expect(answer).toContain('Não consta atuação direta');
    expect(answer).toContain('Java no desenvolvimento do SIGAA');
    expect(answer).toContain('Python no HSP Simulator');
    expect(answer).toContain('não comprovação de domínio');
    expect(answer).not.toContain('nunca estudou Go');
    expect(answer).not.toContain('experiência profissional com Go');
  });

  it('orders positive evidence before discussing uncovered technologies', () => {
    const answer = renderProfessionalAdvocacy(
      [go, java],
      [goMissing, javaProfessional],
      new Map([[go.id, [pythonProject]]]),
    );
    expect(answer!.indexOf('**Java:**')).toBeLessThan(answer!.indexOf('**Go:**'));
  });

  it('rejects unsupported transferable evidence and never exposes a private claim', () => {
    const mixed: EvidenceGraphMatch = {
      requirementId: java.id,
      claims: [claim('claim-mixed', 'Informação privada', 'professional', [src.id, secret.id])],
      sources: [src, secret],
    };
    expect(renderProfessionalAdvocacy([go], [goMissing], new Map([[go.id, [mixed]]]))).toBeUndefined();
    expect(renderProfessionalAdvocacy([java], [mixed])).toBeUndefined();
  });

  it('returns a transferable GraphRAG preview only when the curated anchors have evidence', async () => {
    const findEvidence = vi.fn(async (requirements: readonly VacancyRequirement[]) =>
      requirements.map((r) => (r.id === java.id ? javaProfessional : goMissing)),
    );
    const canonical = vi.fn(async () => 'Resposta PPKS');
    const result = await evaluateGraphRecruiterPreview('Pedro atuou com Go?', {
      identifyRequirements: () => [go],
      evidence: repository(findEvidence),
      canonicalPpks: canonical,
      transferableSkills: { [go.id]: [java] },
    });
    expect(result.mode).toBe('transferable_graph');
    expect(result.reason).toBe('transferable');
    expect(result.answer).toContain('Java no desenvolvimento do SIGAA');
    expect(result.answer).toContain('Não consta atuação direta');
    expect(findEvidence).toHaveBeenCalledTimes(2);
    expect(canonical).not.toHaveBeenCalled();
  });

  it('falls back to PPKS when anchors are absent or the graph is unavailable', async () => {
    const canonical = vi.fn(async () => 'O PPKS apresenta as experiências relevantes.');
    const result = await evaluateGraphRecruiterPreview('Go?', {
      identifyRequirements: () => [go],
      evidence: repository(async (requirements) => requirements.map((r) => match(r, []))),
      canonicalPpks: canonical,
      transferableSkills: { [go.id]: [java] },
    });
    expect(result.mode).toBe('canonical_ppks');
    expect(canonical).toHaveBeenCalledTimes(1);
  });

  it('never confuses study evidence with professional experience', () => {
    const onlyStudy = match(java, [
      claim('claim-study', 'Exercício em Java', 'study'),
    ]);
    const answer = renderProfessionalAdvocacy([java], [onlyStudy]);
    expect(answer).toContain('projeto ou atividade de estudo');
    expect(answer).not.toContain('Java no desenvolvimento do SIGAA');
  });
});
