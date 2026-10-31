import { describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { loadAcademicEvidence } from '../apps/orbe-node/src/adapters/academic.js';

describe('PPKS acadêmico v1.1 e avaliação por vagas', () => {
  it('carrega formação e cursos sem divulgar PDFs ou presumir graduação UNISUL', async () => {
    const evidence = await loadAcademicEvidence();
    expect(evidence.educations.size).toBe(9);
    expect(evidence.tracks.size).toBe(6);
    expect([...evidence.tracks.values()].reduce((n, t) => n + t.courses.length, 0)).toBe(42);
    const cs = evidence.educations.get('formacao-computacao');
    expect(cs?.status).toBe('pending_completion');
    expect(cs?.expectedWindow).toContain('2028');
    expect(evidence.educations.get('formacao-gestao-ti')?.issuer).toContain('ETEP');
    const angular = evidence.tracks
      .get('cursos-frontend-mobile')!
      .courses.find((c) => c.title.includes('Angular'));
    expect(angular?.verification).toBe('owner_confirmed');
    expect(angular?.status).toBe('completed');
  });
  it('recupera diploma superior completo e inglês básico numa vaga Java', async () => {
    const k = await JsonKnowledgeRepository.load();
    const docs = k.search(
      'Sou recrutador para uma vaga Backend Java Júnior com Spring Boot, MySQL, formação superior em computação e inglês para leitura. Indique evidências.',
    );
    expect(docs.map((x) => x.id)).toContain('experiencia-sig');
    expect(docs.map((x) => x.id)).toContain('formacao-gestao-ti');
    expect(docs.map((x) => x.id)).toContain('idiomas-declarados');
    expect(docs.find((x) => x.id === 'formacao-gestao-ti')?.content).toContain('ETEP');
  });
  it('distingue formação em Angular e SQL Server de experiência em projetos', async () => {
    const k = await JsonKnowledgeRepository.load();
    const docs = k.search(
      'Sou recrutador da Viceri para vaga FullStack Java ou Node.js com Angular, TypeScript, SQL Server, APIs e Git. Quais competências demonstradas?',
    );
    for (const id of [
      'experiencia-sig',
      'phasscode-platform',
      'cursos-frontend-mobile',
      'cursos-bancos-dados',
    ])
      expect(docs.map((d) => d.id)).toContain(id);
    expect(docs.find((d) => d.id === 'cursos-frontend-mobile')?.content).toContain('Angular');
  });
  it.each([
    [
      'P&D',
      'Sou recrutador Jobgether: Backend pesquisa e desenvolvimento, POO, SQL/NoSQL, PoCs, métricas e APIs REST.',
      ['hsp-simulator', 'phasscode-platform'],
    ],
    [
      'Yandeh',
      'Sou recrutador Yandeh vaga Full Stack Jr Node.js TypeScript React PostgreSQL Redis Docker CI/CD.',
      ['phasscode-platform', 'web-portfolio-v2'],
    ],
    [
      'T-Systems',
      'Sou recrutador T-Systems DevOps Júnior Java/Python, Linux, Docker, Terraform, Camunda 8, inglês avançado.',
      ['phasscode-platform', 'task-manager-flask', 'idiomas-declarados'],
    ],
    [
      'Foursys',
      'Sou recrutador Foursys Java Pleno AWS e IA: microsserviços, RAG, agentes LLMs e mercado financeiro.',
      ['experiencia-sig', 'phasscode-platform', 'greencity-os'],
    ],
  ])('não omite fontes principais para %s', async (_, question, required) => {
    const k = await JsonKnowledgeRepository.load();
    const ids = k.search(question).map((x) => x.id);
    for (const id of required) expect(ids).toContain(id);
  });
});
