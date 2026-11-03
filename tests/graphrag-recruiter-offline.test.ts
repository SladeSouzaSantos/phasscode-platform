import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { createCoverageAwareVacancyPlanner } from '../apps/orbe-node/src/application/graph-vacancy-coverage.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import {
  evaluateOfflineRecruiterMatrix,
  evaluateStoredOfflineRecruiterMatrix,
} from '../evaluation/graphrag-recruiter-offline.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

describe('F3.4 initial offline recruiter corpus (not a live baseline comparison)', () => {
  it('replays all nine existing recruiter/academic cases with no LLM or DB requests', async () => {
    const report = await evaluateStoredOfflineRecruiterMatrix();
    const expectedCases = [
      'jobgether-pd',
      'evoluservices-java',
      'yandeh-fullstack',
      'tsystems-devops',
      'viceri-fullstack',
      'foursys-java-ia',
      'academico-unisul',
      'academico-etep',
      'academico-cursos',
    ];
    expect(report.reportVersion).toBe('orbe-graphrag-offline-matrix-v1');
    expect(report.mode).toBe('offline_ppks_projection');
    expect(report.baselineComparison).toBe('not_run');
    expect(report.liveLlmCalls).toBe(0);
    expect(report.graphDatabaseQueries).toBe(0);
    expect(report.totals).toMatchObject({ cases: 9, turns: 9 });
    expect(report.cases.map((item) => item.id)).toEqual(expectedCases);
    expect(
      report.totals.verified + report.totals.transferable + report.totals.canonicalFallback,
    ).toBe(9);
    expect(report.cases.every((item) => item.turns[0]?.index === 0)).toBe(true);
    expect(report.cases.every((item) => item.turns[0]?.mode)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('Sou recrutador');
    expect(JSON.stringify(report)).not.toContain('private-db-password');
  });

  it('replays the same immutable corpus deterministically', async () => {
    const first = await evaluateStoredOfflineRecruiterMatrix();
    const second = await evaluateStoredOfflineRecruiterMatrix();
    expect(second).toEqual(first);
  });

  it('tracks 2- and 3-turn fixtures individually, without claiming conversation memory coverage', async () => {
    const fixture = JSON.stringify({
      version: 'multi-turn-offline-smoke',
      cases: [
        {
          id: 'java-then-go',
          category: 'smoke',
          turns: [
            { message: 'Java no SIGAA?' },
            { message: 'E quanto a Go?' },
          ],
        },
        {
          id: 'academic-followup',
          category: 'smoke',
          turns: [
            { message: 'Graduação de TI?' },
            { message: 'E Ciência da Computação?' },
            { message: 'Concluiu a UNISUL?' },
          ],
        },
      ],
    });
    const report = await evaluateOfflineRecruiterMatrix(
      fixture,
      await projectPpksEvidenceGraph(),
    );
    expect(report.totals).toMatchObject({ cases: 2, turns: 5 });
    expect(report.cases[0]?.turns.map((turn) => turn.index)).toEqual([0, 1]);
    expect(report.cases[1]?.turns.map((turn) => turn.index)).toEqual([0, 1, 2]);
    expect(report.baselineComparison).toBe('not_run');
  });

  it('rejects duplicate IDs rather than overwriting recruiter scenarios', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    const fixture = JSON.stringify({
      version: 'duplicates',
      cases: [
        { id: 'same', category: 'smoke', turns: [{ message: 'Java?' }] },
        { id: 'same', category: 'smoke', turns: [{ message: 'Go?' }] },
      ],
    });
    await expect(evaluateOfflineRecruiterMatrix(fixture, snapshot)).rejects.toThrow(
      'GRAPH_MATRIX_DUPLICATE_CASE_ID',
    );
  });

  it('uses canonical PPKS status for academic and employment facts, not inferred degrees or years', async () => {
    const snapshot = await projectPpksEvidenceGraph();
    expect(snapshot.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'degree',
        id: 'formacao-computacao',
        status: 'pending_completion',
      }),
    );
    const courseIds = snapshot.relations
      .filter((edge) => edge.type === 'IN_TRACK' && edge.to === 'cursos-java-arquitetura')
      .map((edge) => edge.from);
    expect(courseIds).toHaveLength(9);
    expect(new Set(courseIds).size).toBe(9);
    expect(snapshot.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'engagement',
        id: 'experiencia-geowellex',
        softwareWorkScope: 'mixed',
      }),
    );
    expect(snapshot.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'engagement',
        id: 'experiencia-greencity',
        softwareWorkScope: 'mixed',
      }),
    );
  });

  it('preserves 33 named technologies and one unknown Go without falsely completing a vacancy', async () => {
    const named = [
      'Java', 'Hibernate', 'JBoss', 'Spring Boot', 'JPA', 'PostgreSQL', 'MySQL',
      'SQL', 'SQL Server', 'Angular', 'React', 'TypeScript', 'Node.js', 'Python',
      'FastAPI', 'Flutter', 'Firebase', 'Redis', 'Docker', 'Docker Swarm', 'Git',
      'GitHub Actions', 'CI/CD', 'Vitest', 'Playwright', 'CodeQL', 'OWASP ZAP',
      'Nginx', 'Dart', 'PHP', 'Linux', 'REST', 'GraphQL',
    ];
    const skills = named.map((label, index) => ({ id: 'skill-' + index, label }));
    const planner = createCoverageAwareVacancyPlanner(skills);
    const text = 'Requisitos: ' + [...named, 'Go'].join(', ');
    const audit = planner.inspect(text);
    const plan = await planner.plan(text);
    expect(audit.fragments).toHaveLength(34);
    expect(plan.requirements).toHaveLength(33);
    expect(plan.unknown).toEqual([{ label: 'Go', mandatory: true }]);

    const findEvidence = vi.fn(async () => []);
    const canonical = vi.fn(() => 'Resposta profissional baseada no PPKS');
    const evidence: EvidenceGraphRepository = {
      findEvidence,
      getSource: vi.fn(),
    };
    const result = await evaluateGraphRecruiterPreview(text, {
      evidence,
      identifyRequirements: () => [],
      requirementPlan: () => planner.plan(text),
      canonicalPpks: canonical,
    });
    expect(result.mode).toBe('canonical_ppks');
    expect(result.unrecognizedRequirements).toEqual(['Go']);
    expect(findEvidence).not.toHaveBeenCalled();
    expect(canonical).toHaveBeenCalledOnce();
  });

  it('keeps synthetic Java employment and Spring study scopes separate in positive narratives', async () => {
    const source: EvidenceSource = {
      kind: 'source',
      id: 'source-synthetic-public',
      label: 'Synthetic public regression source',
      origin: 'github',
      visibility: 'public',
      verificationStatus: 'code_reviewed',
    };
    const requirements: VacancyRequirement[] = [
      { kind: 'vacancy_requirement', id: 'skill-java', label: 'Java', mandatory: true },
      {
        kind: 'vacancy_requirement',
        id: 'skill-spring',
        label: 'Spring Boot',
        mandatory: true,
      },
    ];
    const evidence: EvidenceGraphRepository = {
      findEvidence: vi.fn(async (requested: readonly VacancyRequirement[]) =>
        requested.map((req) => ({
          requirementId: req.id,
          claims: [
            {
              kind: 'claim' as const,
              id: 'claim-' + req.id,
              label:
                req.id === 'skill-java'
                  ? 'Atuação Java no SIGAA'
                  : 'Projeto didático Spring Boot',
              subjectId: req.id === 'skill-java' ? 'engagement-sig' : 'project-study',
              predicate: 'USES_TECHNOLOGY' as const,
              objectId: req.id,
              scope: req.id === 'skill-java' ? ('professional' as const) : ('study' as const),
              sourceIds: [source.id],
            },
          ],
          sources: [source],
        })),
      ),
      getSource: vi.fn(async () => source),
    };
    const output = await evaluateGraphRecruiterPreview('Java e Spring Boot', {
      evidence,
      identifyRequirements: () => requirements,
      canonicalPpks: () => 'Should not use fallback',
    });
    expect(output.mode).toBe('verified_graph');
    expect(output.answer).toContain('Atuação Java no SIGAA (experiência profissional');
    expect(output.answer).toContain('Projeto didático Spring Boot (projeto ou atividade de estudo');
    expect(output.answer).not.toMatch(/\b\d+\s+anos\b/i);
    expect(output.answer).not.toContain('experiência profissional com Spring Boot');
  });

  it('never promotes private-only evidence to public recruiter claims', async () => {
    const privateSource: EvidenceSource = {
      kind: 'source',
      id: 'source-private',
      label: 'Private reference',
      origin: 'owner_declaration',
      visibility: 'private',
      verificationStatus: 'owner_confirmed',
    };
    const query: VacancyRequirement = {
      kind: 'vacancy_requirement',
      id: 'skill-java',
      label: 'Java',
      mandatory: true,
    };
    const findEvidence = vi.fn(async () => [
      {
        requirementId: query.id,
        claims: [
          {
            kind: 'claim' as const,
            id: 'claim-private',
            label: 'PRIVATE_CANARY_CODE',
            subjectId: 'private-engagement',
            predicate: 'USES_TECHNOLOGY' as const,
            objectId: query.id,
            scope: 'professional' as const,
            sourceIds: [privateSource.id],
          },
        ],
        sources: [privateSource],
      },
    ]);
    const fallback = vi.fn(() => 'PPKS: Java profissional, informação aprovada para exposição');
    const result = await evaluateGraphRecruiterPreview('Java', {
      identifyRequirements: () => [query],
      evidence: { findEvidence, getSource: vi.fn(async () => privateSource) },
      canonicalPpks: fallback,
    });
    expect(result.mode).toBe('canonical_ppks');
    expect(result.answer).not.toContain('PRIVATE_CANARY');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('keeps original recruiter fixture data unchanged and present', async () => {
    const raw = JSON.parse(
      await readFile('evaluation/vacancies-ppks-v12.json', 'utf8'),
    ) as { cases: Array<{ id: string; turns: Array<{ message: string }> }> };
    expect(raw.cases).toHaveLength(9);
    expect(raw.cases.some((item) => item.id === 'foursys-java-ia')).toBe(true);
    expect(raw.cases.every((item) => item.turns[0]?.message)).toBe(true);
  });
});
