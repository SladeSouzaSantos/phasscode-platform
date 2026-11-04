import { describe, expect, it } from 'vitest';
import { auditGeneratedRecruiterProse } from '../apps/orbe-node/src/application/graph-generated-prose-audit.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const snapshot: EvidenceGraphSnapshot = {
  schemaVersion: '1.0',
  nodes: [
    { kind: 'candidate', id: 'candidate', label: 'Pedro' },
    { kind: 'company', id: 'company-sig', label: 'SIG Software e Consultoria em TI' },
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
    { kind: 'skill', id: 'skill-java', label: 'Java' },
    { kind: 'skill', id: 'skill-spring', label: 'Spring Boot' },
    { kind: 'degree', id: 'degree-cs', label: 'Ciência da Computação', status: 'pending_completion' },
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
    const result = auditGeneratedRecruiterProse(
      'Pedro concluiu Ciência da Computação.',
      snapshot,
    );
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
    expect(result.corrected).toBe(0);
  });
});
