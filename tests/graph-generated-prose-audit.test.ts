import { describe, expect, it } from 'vitest';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { auditGeneratedRecruiterProse } from '../apps/orbe-node/src/application/graph-generated-prose-audit.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const snapshot: EvidenceGraphSnapshot = {
  schemaVersion: '1.0',
  nodes: [
    { kind: 'candidate', id: 'candidate', label: 'Pedro' },
    { kind: 'company', id: 'company-sig', label: 'SIG Software e Consultoria em TI' },
    { kind: 'company', id: 'company-geowellex', label: 'Geowellex' },
    {
      kind: 'engagement',
      id: 'experiencia-sig',
      label: 'Desenvolvimento de funcionalidades SIGAA',
      candidateId: 'candidate',
      companyId: 'company-sig',
      type: 'employee',
      softwareWorkScope: 'exclusive',
      areas: ['software-development'],
      startedAt: '2016-06',
      endedAt: '2017-02',
    },
    {
      kind: 'engagement',
      id: 'experiencia-geowellex',
      label: 'Atuação em engenharia e software',
      candidateId: 'candidate',
      companyId: 'company-geowellex',
      type: 'employee',
      softwareWorkScope: 'mixed',
      areas: ['engineering', 'software-development'],
      startedAt: '2017-03',
      endedAt: '2018-10',
    },
    {
      kind: 'project',
      id: 'project-phasscode',
      label: 'PHASSCODE Platform — backend do Orbe Mágico',
      category: 'professional',
    },
    {
      kind: 'project',
      id: 'project-greencity',
      label: 'GREENCITY OS — projeto do portfólio',
      category: 'personal',
    },
    { kind: 'skill', id: 'skill-typescript', label: 'TypeScript' },
    { kind: 'skill', id: 'skill-gemini', label: 'Gemini' },
    { kind: 'skill', id: 'skill-groq', label: 'Groq' },
    { kind: 'skill', id: 'skill-java', label: 'Java' },
    { kind: 'skill', id: 'skill-spring', label: 'Spring Boot' },
    {
      kind: 'degree',
      id: 'degree-cs',
      label: 'Ciência da Computação',
      status: 'pending_completion',
    },
    {
      kind: 'source',
      id: 'source-public',
      label: 'Registro PPKS público',
      origin: 'ppks_catalog',
      visibility: 'public',
      verificationStatus: 'owner_confirmed',
      sourceUrl: 'https://gbc.phasscode.com/#experiencia',
    },
    {
      kind: 'source',
      id: 'source-private',
      label: 'Registro privado',
      origin: 'academic_record',
      visibility: 'private',
      verificationStatus: 'document_verified',
    },
    {
      kind: 'claim',
      id: 'claim-phasscode-typescript',
      label: 'PHASSCODE Platform utiliza TypeScript',
      subjectId: 'project-phasscode',
      objectId: 'skill-typescript',
      predicate: 'USES_TECHNOLOGY',
      scope: 'personal_project',
      sourceIds: ['source-public'],
    },
    {
      kind: 'claim',
      id: 'claim-greencity-gemini',
      label: 'Greencity OS utiliza Gemini',
      subjectId: 'project-greencity',
      objectId: 'skill-gemini',
      predicate: 'USES_TECHNOLOGY',
      scope: 'professional_project',
      sourceIds: ['source-public'],
    },
    {
      kind: 'claim',
      id: 'claim-sig-java',
      label: 'SIGAA: Java',
      subjectId: 'experiencia-sig',
      objectId: 'skill-java',
      predicate: 'USES_TECHNOLOGY',
      scope: 'professional',
      sourceIds: ['source-public'],
    },
    {
      kind: 'claim',
      id: 'claim-spring-study',
      label: 'Spring Boot em estudo',
      subjectId: 'candidate',
      objectId: 'skill-spring',
      predicate: 'USES_TECHNOLOGY',
      scope: 'study',
      sourceIds: ['source-public'],
    },
    {
      kind: 'claim',
      id: 'claim-cs-enrollment',
      label: 'Graduação ainda pendente',
      subjectId: 'candidate',
      objectId: 'degree-cs',
      predicate: 'ENROLLED_IN',
      scope: 'study',
      sourceIds: ['source-public'],
    },
  ],
  relations: [],
};

describe('F3.3 bounded factual guard for unconstrained model prose', () => {
  it('corrects SIGAA-only 19 months against the exact employer chronology', () => {
    const result = auditGeneratedRecruiterProse(
      'Pedro trabalhou no SIGAA durante 19 meses.',
      snapshot,
    );
    expect(result.corrected).toBe(1);
    expect(result.rules).toEqual(['duration']);
    expect(result.answer).toContain('junho/2016 a fevereiro/2017');
    expect(result.answer).not.toContain('19 meses');
    expect(result.sources.map((s) => s.id)).toEqual(['source-public']);
  });

  it('corrects the same SIGAA duration when expressed in years and months', () => {
    const result = auditGeneratedRecruiterProse(
      'No SIGAA, Pedro trabalhou por 1 ano e 7 meses.',
      snapshot,
    );
    expect(result.rules).toContain('duration');
    expect(result.answer).toContain('junho/2016 a fevereiro/2017');
    expect(result.answer).not.toContain('1 ano e 7 meses');
    expect(result.sources.map((source) => source.id)).toEqual(['source-public']);
  });

  it('keeps independent factual statements while correcting an employer-specific duration', () => {
    const result = auditGeneratedRecruiterProse(
      'Pedro trabalhou no SIGAA durante 19 meses. Também desenvolveu com Java.',
      snapshot,
    );
    expect(result.corrected).toBe(1);
    expect(result.answer).toContain('junho/2016 a fevereiro/2017');
    expect(result.answer).toContain('Também desenvolveu com Java.');
    expect(result.answer).not.toContain('19 meses');
  });

  it('does not alter duration assertions about combined employers without attribution', () => {
    const result = auditGeneratedRecruiterProse(
      'O conjunto dos vínculos de programação soma 19 meses.',
      snapshot,
    );
    // This guard is limited to identifiable employer-specific statements,
    // not a claim that every combined total has been verified.
    expect(result.corrected).toBe(0);
  });

  it('rejects promotion of study into professional Spring Boot experience', () => {
    const result = auditGeneratedRecruiterProse(
      'Pedro possui experiência profissional com Spring Boot.',
      snapshot,
    );
    expect(result.corrected).toBe(1);
    expect(result.rules).toContain('professional_scope');
    expect(result.answer).toContain('escopo de projeto ou estudo');
    expect(result.sources).toHaveLength(1);
    expect(result.answer).not.toContain('experiência profissional com Spring Boot');
  });

  it('preserves professional Java experience when public provenance is complete', () => {
    const text = 'Pedro possui experiência profissional com Java.';
    const result = auditGeneratedRecruiterProse(text, snapshot);
    expect(result.answer).toBe(text);
    expect(result.corrected).toBe(0);
    expect(result.sources).toEqual([]);
  });

  it('does not promote a pending degree into completed education', () => {
    const result = auditGeneratedRecruiterProse('Pedro concluiu Ciência da Computação.', snapshot);
    expect(result.corrected).toBe(1);
    expect(result.rules).toContain('degree_status');
    expect(result.answer).toContain('com conclusão pendente');
  });

  it('never uses private evidence to justify a rewrite', () => {
    const privateOnly: EvidenceGraphSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.kind === 'claim' ? { ...node, sourceIds: ['source-private'] } : node,
      ),
    };
    const result = auditGeneratedRecruiterProse(
      'Pedro trabalhou no SIGAA durante 19 meses.',
      privateOnly,
    );
    expect(result.sources).toEqual([]);
    expect(result.corrected).toBe(1);
    expect(result.answer).toContain('não pôde ser validada em fontes públicas');
  });

  it('does not transfer a provider from Greencity OS to PHASSCODE Platform', () => {
    const result = auditGeneratedRecruiterProse('PHASSCODE Platform utiliza Gemini.', snapshot);
    expect(result.rules).toContain('project_scope');
    expect(result.answer).not.toContain('PHASSCODE Platform utiliza Gemini');
    expect(result.sources).toEqual([]);
  });

  it('preserves a publicly supported provider attribution to the correct project', () => {
    const text = 'Greencity OS utiliza Gemini.';
    const result = auditGeneratedRecruiterProse(text, snapshot);
    expect(result.answer).toBe(text);
    expect(result.corrected).toBe(0);
  });

  it('does not infer an undocumented second provider from a supported first provider', () => {
    const result = auditGeneratedRecruiterProse('Greencity OS utiliza Gemini e Groq.', snapshot);
    expect(result.rules).toContain('project_scope');
    expect(result.answer).toContain('Groq');
    expect(result.answer).not.toContain('utiliza Gemini e Groq');
  });

  it('rejects the attribution of verified Java work to the wrong employer', () => {
    const result = auditGeneratedRecruiterProse(
      'Pedro tem experiência profissional com Java na Geowellex.',
      snapshot,
    );
    expect(result.corrected).toBe(1);
    expect(result.rules).toContain('professional_scope');
    expect(result.answer).not.toContain('com Java na Geowellex');
    expect(result.answer).toContain('não a atribui a esse vínculo');
    expect(result.sources).toHaveLength(1);
  });
  it('audits actual PPKS project labels, not only synthetic short labels', async () => {
    const real = await projectPpksEvidenceGraph();
    const mismatch = auditGeneratedRecruiterProse('PHASSCODE Platform utiliza Flutter.', real);
    expect(mismatch.rules).toContain('project_scope');
    expect(mismatch.answer).not.toContain('PHASSCODE Platform utiliza Flutter');
    expect(mismatch.sources).toEqual([]);

    const verified = 'PHASSCODE Platform utiliza Docker.';
    const supported = auditGeneratedRecruiterProse(verified, real);
    expect(supported.answer).toBe(verified);
    expect(supported.corrected).toBe(0);
  });

  it('does not mistake catalogue-only Greencity evidence for proof of absence', async () => {
    const real = await projectPpksEvidenceGraph();
    const claimed = 'Greencity OS utiliza Flutter.';
    const result = auditGeneratedRecruiterProse(claimed, real);
    expect(result.answer).toBe(claimed);
    expect(result.corrected).toBe(0);
  });

});
