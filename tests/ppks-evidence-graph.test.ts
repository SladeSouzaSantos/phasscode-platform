import { describe, expect, it } from 'vitest';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { evidenceGraphSnapshotSchema } from '../apps/orbe-node/src/domain/evidence-graph.js';

describe('GraphRAG F3.1: projeção auditável do PPKS real', () => {
  it('mantém todos os 9 cursos Java concluídos, por ID canônico e fonte privada', async () => {
    const graph = await projectPpksEvidenceGraph();
    const javaCourses = graph.relations.filter(
      (relation) => relation.type === 'IN_TRACK' && relation.to === 'cursos-java-arquitetura',
    );
    expect(javaCourses).toHaveLength(9);
    const ids = new Set(javaCourses.map((relation) => relation.from));
    expect(ids.size).toBe(9);
    for (const id of ids) {
      expect(graph.nodes).toContainEqual(
        expect.objectContaining({ kind: 'course', id, status: 'completed' }),
      );
      const claim = graph.nodes.find(
        (node) => node.kind === 'claim' && node.predicate === 'COMPLETED_COURSE' && node.objectId === id,
      );
      expect(claim).toMatchObject({ scope: 'study', sourceIds: ['source-' + id] });
      expect(graph.nodes).toContainEqual(
        expect.objectContaining({
          kind: 'source',
          id: 'source-' + id,
          visibility: 'private',
          verificationStatus: 'owner_confirmed',
        }),
      );
    }
    expect(graph.nodes.filter((node) => node.kind === 'course')).toHaveLength(42);
  });

  it('não transforma UNISUL pendente em bacharelado concluído nem matrícula ativa', async () => {
    const graph = await projectPpksEvidenceGraph();
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'degree',
        id: 'formacao-computacao',
        status: 'pending_completion',
        label: 'Bacharelado em Ciência da Computação',
      }),
    );
    expect(graph.relations).toContainEqual({
      from: 'formacao-computacao',
      to: 'source-formacao-computacao',
      type: 'SUPPORTED_BY',
      sourceIds: ['source-formacao-computacao'],
    });
    expect(
      graph.relations.some((edge) => edge.from === 'candidate' && edge.to === 'formacao-computacao'),
    ).toBe(false);
  });

  it('separa emprego Java/Hibernate/JBoss/PostgreSQL do estágio ACRUX e projeto Spring Boot', async () => {
    const graph = await projectPpksEvidenceGraph();
    const tech = (subjectId: string, technology: string) =>
      graph.nodes.some(
        (node) =>
          node.kind === 'claim' &&
          node.predicate === 'USES_TECHNOLOGY' &&
          node.subjectId === subjectId &&
          graph.nodes.some(
            (target) =>
              target.id === node.objectId && target.kind === 'skill' && target.label === technology,
          ),
      );
    expect(tech('experiencia-sig', 'Java')).toBe(true);
    expect(tech('experiencia-sig', 'Hibernate')).toBe(true);
    expect(tech('experiencia-sig', 'JBoss')).toBe(true);
    expect(tech('experiencia-sig', 'PostgreSQL')).toBe(true);
    expect(tech('experiencia-acrux', 'Java')).toBe(true);
    expect(tech('experiencia-acrux', 'Hibernate')).toBe(false);
    expect(tech('experiencia-acrux', 'PostgreSQL')).toBe(false);
    expect(tech('experiencia-sig', 'Spring Boot')).toBe(false);
    expect(tech('webservice-springboot-jpa', 'Spring Boot')).toBe(true);
    const spring = graph.nodes.find(
      (node) => node.kind === 'claim' && node.id === 'claim-webservice-springboot-jpa-skill-spring-boot',
    );
    expect(spring).toMatchObject({ scope: 'study' });
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        kind: 'source',
        id: 'source-webservice-springboot-jpa-repo',
        origin: 'github',
        verificationStatus: 'code_reviewed',
        sourceCommit: 'bec22f975ca798d0472f539eea2193c3bdccb0ec',
        visibility: 'public',
      }),
    );
  });

  it('não confunde MySQL/Geowellex com PostgreSQL/SIGAA nem transforma trabalho misto em exclusivo', async () => {
    const graph = await projectPpksEvidenceGraph();
    const edge = (id: string, technology: string) =>
      graph.relations.some((relation) =>
        relation.type === 'USES_TECHNOLOGY' &&
        relation.from === id &&
        graph.nodes.some((node) => node.kind === 'skill' && node.id === relation.to && node.label === technology),
      );
    expect(edge('experiencia-geowellex', 'MySQL')).toBe(true);
    expect(edge('experiencia-geowellex', 'PostgreSQL')).toBe(false);
    expect(edge('experiencia-sig', 'PostgreSQL')).toBe(true);
    expect(edge('experiencia-sig', 'MySQL')).toBe(false);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: 'experiencia-geowellex',
        kind: 'engagement',
        softwareWorkScope: 'mixed',
        areas: ['software-development', 'engineering'],
      }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: 'experiencia-greencity', kind: 'engagement', softwareWorkScope: 'mixed' }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: 'experiencia-acrux', kind: 'engagement', type: 'intern' }),
    );
    const mixClaim = graph.nodes.find(
      (node) =>
        node.kind === 'claim' &&
        node.subjectId === 'experiencia-geowellex' &&
        node.predicate === 'USES_TECHNOLOGY',
    );
    expect(mixClaim).toMatchObject({ scope: 'mixed_role' });
  });

  it('não inventa experiência Go e preserva projetos de estudo fora de vínculo profissional', async () => {
    const graph = await projectPpksEvidenceGraph();
    const employments = new Set(
      graph.nodes.filter((node) => node.kind === 'engagement').map((node) => node.id),
    );
    expect(
      graph.nodes.some(
        (claim) =>
          claim.kind === 'claim' &&
          claim.predicate === 'USES_TECHNOLOGY' &&
          employments.has(claim.subjectId) &&
          graph.nodes.some(
            (node) => node.kind === 'skill' && node.id === claim.objectId && node.label === 'Go',
          ),
      ),
    ).toBe(false);
    const study = graph.nodes.find(
      (node) => node.kind === 'project' && node.id === 'webservice-springboot-jpa',
    );
    expect(study).toMatchObject({ category: 'study' });
    expect(graph.relations.some((rel) => rel.type === 'HAS_ENGAGEMENT' && rel.to === study?.id)).toBe(false);
  });

  it('todas as relações e claims têm fontes presentes; snapshot é determinístico e validado', async () => {
    const a = await projectPpksEvidenceGraph();
    const b = await projectPpksEvidenceGraph();
    expect(a).toEqual(b);
    expect(evidenceGraphSnapshotSchema.safeParse(a).success).toBe(true);
    const sources = new Set(a.nodes.filter((node) => node.kind === 'source').map((node) => node.id));
    for (const relation of a.relations) {
      expect(relation.sourceIds.length).toBeGreaterThan(0);
      for (const id of relation.sourceIds) expect(sources.has(id)).toBe(true);
    }
    for (const node of a.nodes)
      if (node.kind === 'claim') for (const id of node.sourceIds) expect(sources.has(id)).toBe(true);
  });
});
