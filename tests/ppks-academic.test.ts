import { describe, expect, it } from 'vitest';
import {
  JsonKnowledgeRepository,
  competencyEvidenceIds,
} from '../apps/orbe-node/src/adapters/knowledge.js';
import {
  loadPpksExperienceCards,
  enrichExperienceDocument,
} from '../apps/orbe-node/src/adapters/ppks.js';
import {
  loadAcademicEvidence,
  enrichAcademicDocument,
} from '../apps/orbe-node/src/adapters/academic.js';
import {
  reconcileDocumentedClaims,
  selectSources,
} from '../apps/orbe-node/src/application/sources.js';
import { reconcileExperienceAttribution } from '../apps/orbe-node/src/application/experience-context.js';

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
  it('projects exact individually structured SQL Server courses, excluding generic SQL', async () => {
    const evidence = await loadAcademicEvidence();
    const docs = await JsonKnowledgeRepository.load();
    const source = docs.getDocument('cursos-bancos-dados')!;
    const projected = enrichAcademicDocument(
      source,
      'Quais são todos os cursos específicos de SQL Server?',
      evidence,
    );
    expect(projected.content).toContain('curso-sql-server-completo-formacao-dba');
    expect(projected.content).toContain('SQL Server Completo — Formação DBA — Udemy');
    expect(projected.content).toContain('Formação Power BI + SQL Server — Udemy');
    expect(projected.content).toContain('2 correspondência(s)');
    expect(projected.content).not.toContain('Formação SQL Database Specialist');
    expect(projected.content).toContain('comprovação owner_confirmed');
    expect(projected.content).toContain('não emprego');
    expect(projected.url).toBe('https://gbc.phasscode.com/#academico');
  });

  it('preserves distinct Angular and SQL Server course records under mixed queries', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const selected = knowledge.search(
      'Quais cursos de SQL Server e Angular Pedro concluiu? Informe cada título e instituição.',
    );
    const sql = selected.find((doc) => doc.id === 'cursos-bancos-dados')!;
    const angular = selected.find((doc) => doc.id === 'cursos-frontend-mobile')!;
    expect(sql.content).toContain('Formação Power BI + SQL Server');
    expect(sql.content).toContain('SQL Server Completo');
    expect(sql.content).not.toContain('Formação SQL Database Specialist');
    expect(angular.content).toContain('Desenvolvimento Frontend com Angular — DIO');
  });

  it('rejects a duplicated or invalid structured course before serving evidence', async () => {
    const { mkdtemp, readFile, writeFile, rm, copyFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const folder = await mkdtemp(join(tmpdir(), 'orbe-academic-'));
    try {
      for (const name of ['educations.json', 'tracks.json', 'skills.json'])
        await copyFile('knowledge/ppks/academic/' + name, join(folder, name));
      const original = JSON.parse(await readFile(join(folder, 'tracks.json'), 'utf8'));
      const duplicate = structuredClone(original);
      duplicate.tracks[1].courses[0].id = duplicate.tracks[0].courses[0].id;
      await writeFile(join(folder, 'tracks.json'), JSON.stringify(duplicate));
      await expect(loadAcademicEvidence(folder)).rejects.toThrow('PPKS_ACADEMIC_DUPLICATE_ID');
      const invalid = structuredClone(original);
      invalid.tracks[0].courses[0].provider = '';
      await writeFile(join(folder, 'tracks.json'), JSON.stringify(invalid));
      await expect(loadAcademicEvidence(folder)).rejects.toThrow();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
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

describe('PPKS v1.2: conexões de competências e experiência', () => {
  it('carrega as quatro fichas profissionais sem promover informações declaradas a código auditado', async () => {
    const cards = await loadPpksExperienceCards();
    expect(cards.size).toBe(4);
    const knowledge = await JsonKnowledgeRepository.load();
    const document = knowledge.experienceDocuments().find((d) => d.id === 'experiencia-sig')!;
    const enriched = enrichExperienceDocument(
      document,
      'Recrutador Java: experiência profissional',
      cards,
    );
    expect(enriched.content).toContain('PPKS experiência:');
    expect(enriched.content).toContain('Hibernate');
    expect(enriched.content).not.toContain('code_reviewed');
    expect(enriched.content.length).toBeLessThanOrEqual(6000);
  });
  it('pontua os vínculos entre competências, sem inferir AWS ou Terraform', async () => {
    const academic = await loadAcademicEvidence();
    expect(competencyEvidenceIds('Sou recrutador Java e React TypeScript', academic)).toContain(
      'experiencia-sig',
    );
    expect(competencyEvidenceIds('Vaga Angular SQL Server', academic)).toContain(
      'cursos-frontend-mobile',
    );
    expect(competencyEvidenceIds('Vaga AWS Terraform', academic)).toEqual([]);
  });
  it('recupera competências explicitamente sem substituir diploma nem idiomas', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = knowledge.search(
      'Sou recrutador para vaga de React TypeScript, qual projeto comprova?',
    );
    expect(docs.map((d) => d.id)).toContain('web-portfolio-v2');
    const java = knowledge.search('Sou recrutador Java com graduação e inglês para leitura');
    expect(java.map((d) => d.id)).toContain('formacao-gestao-ti');
    expect(java.map((d) => d.id)).toContain('idiomas-declarados');
  });
});

describe('PPKS v1.2 — matriz de vagas e contexto', () => {
  it('possui seis vagas e três cenários acadêmicos com sessões independentes', async () => {
    const { readFile } = await import('node:fs/promises');
    const matrix = JSON.parse(await readFile('evaluation/vacancies-ppks-v12.json', 'utf8'));
    expect(matrix.cases).toHaveLength(9);
    expect(
      matrix.cases.every((scenario: { turns: unknown[] }) => scenario.turns.length === 1),
    ).toBe(true);
  });
  it('preserva referências distintas sem estourar o contexto preliminar de entrevistas extensas', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const query =
      'Sou recrutador para vaga Java Node.js TypeScript React PostgreSQL Redis Python Docker CI/CD, formação em computação, SQL Server e Angular. Compare projetos profissionais e estudos.';
    const results = knowledge.search(query);
    // A recruiter may list many independent stacks. Preserve distinct
    // professional/project evidence instead of a historical five-source cap.
    expect(results.length).toBeGreaterThan(5);
    expect(results.map((doc) => doc.id)).toContain('experiencia-sig');
    expect(results.map((doc) => doc.id)).toContain('phasscode-platform');
    expect(results.map((doc) => doc.id)).toContain('web-portfolio-v2');
    expect(results.reduce((total, doc) => total + doc.content.length, 0)).toBeLessThanOrEqual(8000);
  });
});

// prettier-ignore
describe('PPKS v1.3: rastreabilidade nominal por contexto', () => {
  it('cita SIGAA, PHASSCODE Platform e Greencity OS quando usados juntos', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const ids = ['experiencia-sig', 'phasscode-platform', 'greencity-os'];
    const docs = ids.map((id) => knowledge.getDocument(id)!);
    const sources = selectSources({
      query: 'Vaga Java e IA: cite experiencia e projetos',
      answer:
        'No SIGAA houve Java corporativo; PHASSCODE Platform aplica LLMs e Greencity OS importa datasheets.',
      documents: docs,
    });
    for (const id of ids) expect(sources.map((item) => item.id)).toContain(id);
  });
  it('preserva empregadores com mesmo link publico em resposta comparativa', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const ids = ['experiencia-sig', 'experiencia-geowellex', 'experiencia-acrux'];
    const docs = ids.map((id) => knowledge.getDocument(id)!);
    const sources = selectSources({
      query: 'Compare Java SIGAA, MySQL na Geowellex e o estagio ACRUX',
      answer:
        'No SIGAA houve Java e PostgreSQL; na Geowellex PHP e MySQL; na ACRUX Java e H2.',
      documents: docs,
    });
    for (const id of ids) expect(sources.map((item) => item.id)).toContain(id);
  });
});

describe('PPKS v1.3: pós-validação factual e rastreabilidade por afirmação', () => {
  it('corrige falsos negativos amplos usando apenas documentos entregues ao modelo', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const records = [
      'experiencia-sig',
      'experiencia-geowellex',
      'phasscode-platform',
      'web-portfolio-v2',
    ].map((id) => knowledge.getDocument(id)!);
    const original =
      'Não verifiquei MySQL, nem REST APIs comerciais. Não verifiquei Java em produção nem experiência profissional como Desenvolvedor ou DevOps Júnior. Git, versionamento específico e contribuições públicas de código (não atribuir autoria exclusiva nem código público pessoal).';
    const repaired = reconcileDocumentedClaims(original, records);
    expect(repaired).toContain('Geowellex');
    expect(repaired).toContain('SIG Software/SIGAA');
    expect(repaired).toContain('Git e versionamento');
    expect(repaired).not.toContain('Não verifiquei MySQL');
    expect(repaired).not.toContain('Não verifiquei Java em produção');
  });

  it('preserva lacunas com escopo específico e não inventa evidência ausente', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const sig = knowledge.getDocument('experiencia-sig')!;
    const scope =
      'Não verifiquei MySQL no SIGAA; não verifiquei Java com Spring em produção; não verifiquei Git na SIG Software.';
    expect(reconcileDocumentedClaims(scope, [sig])).toBe(scope);
    expect(reconcileDocumentedClaims('Não verifiquei MySQL.', [sig])).toBe('Não verifiquei MySQL.');
  });

  it('reconcilia MySQL e diploma com fontes correspondentes, sem citar projetos não mencionados', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = [
      'experiencia-sig',
      'experiencia-geowellex',
      'formacao-gestao-ti',
      'phasscode-platform',
    ].map((id) => knowledge.getDocument(id)!);
    const answer = reconcileDocumentedClaims(
      'No SIGAA houve Java. Na Geowellex houve PHP/MySQL. Tecnólogo em Gestão da TI concluído (ETEP/UNIBF).',
      docs,
    );
    const ids = selectSources({
      query: 'Compare Java e MySQL profissional e graduação em TI.',
      answer,
      documents: docs,
    }).map((source) => source.id);
    expect(ids).toContain('experiencia-sig');
    expect(ids).toContain('experiencia-geowellex');
    expect(ids).toContain('formacao-gestao-ti');
    expect(ids).not.toContain('phasscode-platform');
  });

  it('corrige subtotal de 19 meses indevidamente atribuído a SIGAA, preservando data factual', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = [
      knowledge.getDocument('experiencia-acrux')!,
      knowledge.getDocument('experiencia-sig')!,
    ];
    const asOf = new Date('2026-10-31T10:00:00Z');
    const mistaken =
      'Pedro possui 19 meses de vínculo exclusivamente no desenvolvimento de software, entre junho de 2016 e fevereiro de 2017 na SIG Software, atuando com Java.';
    const repaired = reconcileExperienceAttribution(mistaken, docs, asOf);
    expect(repaired).not.toContain('19 meses');
    expect(repaired).toContain('junho de 2016 e fevereiro de 2017');
    expect(repaired).toContain('SIG Software');
    const valid =
      'Pedro possui 8 meses de vínculo exclusivamente no desenvolvimento de software, entre junho de 2016 e fevereiro de 2017 na SIG Software.';
    expect(reconcileExperienceAttribution(valid, docs, asOf)).toBe(valid);
    expect(reconcileExperienceAttribution(mistaken, [], asOf)).toBe(mistaken);
  });

  it('não atribui como fontes os projetos que só compartilham tecnologias gerais', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const docs = ['phasscode-platform', 'web-portfolio-v2', 'task-manager-flask'].map((id) =>
      knowledge.getDocument(id)!,
    );
    const ids = selectSources({
      query: 'Quais projetos demonstram Node React Redis Docker?',
      answer: 'PHASSCODE Platform usa Node, Redis e Docker; o portfólio PHASSCODE usa React.',
      documents: docs,
    }).map(({ id }) => id);
    expect(ids).toContain('phasscode-platform');
    expect(ids).toContain('web-portfolio-v2');
    expect(ids).not.toContain('task-manager-flask');
  });
});
