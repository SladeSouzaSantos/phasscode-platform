import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { selectSources } from '../apps/orbe-node/src/application/sources.js';
import type { GenerationInput, GenerationResult } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { matrixSchema } from '../evaluation/schema.js';

const today = new Date('2026-10-31T10:00:00Z');
async function createService() {
  const knowledge = await JsonKnowledgeRepository.load();
  const generate = vi.fn<(input: GenerationInput) => Promise<GenerationResult>>(
    async ({ documents }) => ({
      // Provedor intencionalmente simulado: testa fonte/recuperação, não qualidade de LLM.
      answer: 'O Orbe pode apresentar as experiências e os projetos públicos de Pedro.',
      sources: documents.length ? [] : [],
    }),
  );
  return {
    knowledge,
    generate,
    service: new ChatService(
      new MemoryConversationStore(),
      { name: 'mock', generate },
      knowledge,
      loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      false,
      () => today,
    ),
  };
}
describe('Academia Arcana / base profissional do Orbe DEV', () => {
  it('preserva os 31 IDs anteriores e contém as 6 trilhas com 42 cursos concluídos', async () => {
    const docs = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8'));
    expect(docs).toHaveLength(48);
    const tr = docs.filter((d: { id: string }) =>
      /^cursos-(java-arquitetura|ia-dados|frontend-mobile|engenharia-software|bancos-dados|devops-qualidade)$/.test(
        d.id,
      ),
    );
    expect(tr).toHaveLength(6);
    const expected = [9, 5, 7, 6, 4, 11];
    for (const entry of tr) {
      expect(entry.content).toContain('concluído');
      expect(entry.url).toContain('#academico');
      expect(entry.content).not.toContain('em andamento por curso');
    }
    expect(expected.reduce((sum, n) => sum + n, 0)).toBe(42);
    expect(docs.find((d: { id: string }) => d.id === 'cursos-declarados').content).toContain(
      '42 cursos livres',
    );
  });

  it('comprova os quatro cursos Hackers do Bem com total de 320h sem confundir com CKA', async () => {
    const { knowledge } = await createService();
    const docs = knowledge.search(
      'Quais cursos Hackers do Bem ele concluiu? Quantas horas de DevSecOps?',
    );
    expect(docs.map((d) => d.id)).toContain('cursos-hackers-do-bem');
    const item = docs.find((d) => d.id === 'cursos-hackers-do-bem')!;
    for (const text of ['80 horas', '64 horas', '96 horas', '320 horas', 'DevOps', 'DevSecOps']) {
      expect(item.content).toContain(text);
    }
    expect(item.content).not.toContain('certificação Kubernetes comprovada');
  });

  it.each([
    ['Sou recrutadora, quais cursos ele concluiu?', ['cursos-declarados']],
    ['Quais cursos de Java e Clean Architecture ele concluiu?', ['cursos-java-arquitetura']],
    ['Qual curso Java e TDD com JUnit?', ['cursos-java-arquitetura']],
    ['Quais treinamentos Flutter e Dart ele concluiu?', ['cursos-frontend-mobile']],
    ['Quais cursos de bancos de dados e SQL ele fez?', ['cursos-bancos-dados']],
    ['Ele terminou o Hackers do Bem?', ['cursos-hackers-do-bem']],
    ['Ele está cursando a pós de Engenharia de IA Aplicada na UNIPDS?', ['formacao-unipds-ia']],
    ['Quais temas tem a pós Java Applied Engineering?', ['formacao-unipds-java']],
    ['Mostre o GreenCity OS e a análise de datasheets com Flutter.', ['greencity-os']],
    ['Existe projeto de guardrails contra prompt injection?', ['guardrails-prompt-injection']],
    ['Tem um projeto de Flask e observabilidade?', ['task-manager-flask']],
    ['Fez experiência com animações no projeto Stranger Things?', ['stranger-things-experience']],
    ['Qual projeto é o Shadow Sim Pro de simulação?', ['shadow-sim-pro']],
    ['Existe demonstração do Número Secreto no browser?', ['numero-secreto']],
  ])('recrutador recebe fontes pertinentes: %s', async (query, required) => {
    const { service, generate } = await createService();
    await service.execute({ message: query });
    expect(generate).toHaveBeenCalledOnce();
    const ids = generate.mock.calls[0]![0].documents.map((d) => d.id);
    for (const id of required) expect(ids).toContain(id);
  });

  it('não confunde curso livre concluído com pós em andamento ou certificação de fabricante', async () => {
    const { knowledge } = await createService();
    const courses = knowledge.search('Quais cursos Pedro concluiu?');
    expect(courses.map((x) => x.id)).toContain('cursos-declarados');
    const unipds = knowledge.search('Engenharia de IA Aplicada UNIPDS');
    expect(unipds.find((x) => x.id === 'formacao-unipds-ia')?.content).toContain('em andamento');
    const prisma = knowledge.search('FacPrisma Segurança da Informação');
    expect(prisma.find((x) => x.id === 'formacao-prisma')?.content).toContain('somente essa pós');
    expect(
      knowledge
        .search('Certificação oficial Kubernetes CKA')
        .every((x) => !x.content.includes('possui certificação oficial CKA')),
    ).toBe(true);
  });

  it('orienta recrutamento a evidência e URLs reais sem expor JSON interno', async () => {
    const { knowledge } = await createService();
    const docs = knowledge.search('Projetos de Flutter e IA');
    const os = docs.find((d) => d.id === 'greencity-os');
    expect(os).toBeDefined();
    const sources = selectSources({
      query: 'Projeto GreenCity OS Flutter com análise de datasheets',
      answer: 'O GreenCity OS é um projeto Flutter com IA que lê datasheets e valida inversores.',
      documents: [os!],
    });
    expect(sources.map((s) => s.url)).toContain('https://github.com/SladeSouzaSantos/greencity-os');
    expect(sources.every((s) => !s.url?.includes('.json'))).toBe(true);
  });

  it('conserva o projeto no contexto após continuação de recrutador', async () => {
    const { service, generate } = await createService();
    const first = await service.execute({ message: 'Quais projetos Java ele possui?' });
    await service.execute(
      { message: 'Tem o link?', conversationId: first.conversationId },
      first.conversationToken,
    );
    const docs = generate.mock.calls.at(-1)![0].documents;
    expect(docs.map((d) => d.id)).toContain('webservice-springboot-jpa');
  });

  it('entrega ACRUX, SIGAA, Geowellex e Greencity em ordem cronológica sem perder vínculos', async () => {
    const { service, generate } = await createService();
    await service.execute({
      message:
        'Quais experiências profissionais ele teve em ordem cronológica, com datas e responsabilidades?',
    });
    expect(generate).toHaveBeenCalledOnce();
    const docs = generate.mock.calls[0]![0].documents;
    expect(docs.filter((doc) => doc.experiencePeriod).map((doc) => doc.id)).toEqual([
      'experiencia-acrux',
      'experiencia-sig',
      'experiencia-geowellex',
      'experiencia-greencity',
    ]);
  });

  it('envia todas as seis trilhas e o resumo dos 42 cursos sem truncar registros', async () => {
    const { service, generate, knowledge } = await createService();
    const query = 'Liste todos os 42 cursos concluídos por trilha.';
    await service.execute({ message: query });
    const sent = generate.mock.calls[0]![0].documents;
    const catalog = knowledge.search(query);
    expect(sent.map((doc) => doc.id)).toEqual(catalog.map((doc) => doc.id));
    expect(sent).toHaveLength(7);
    for (const document of sent) {
      expect(document.content).toBe(catalog.find((doc) => doc.id === document.id)?.content);
    }
  });

  it('fundamenta JUnit básico e pipelines autorais sem garantir 404 nem módulos do SIGAA', async () => {
    const docs = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8'));
    const byId = (id: string) => docs.find((doc: { id: string }) => doc.id === id);
    expect(byId('webservice-springboot-jpa').content).toContain('JUnit 5');
    expect(byId('webservice-springboot-jpa').content).toContain('Optional.get()');
    expect(byId('webservice-springboot-jpa').content).toContain('NÃO afirmar');
    expect(byId('phasscode-platform').content).toContain('GitHub Actions');
    expect(byId('experiencia-sig').content).toContain('junho de 2016');
    expect(byId('experiencia-sig').content).toContain('não identifica versões');
    expect(byId('greencity-os').demoUrl).toBeUndefined();
  });

  it.each([
    [
      'vaga Java profissional com Hibernate, PostgreSQL e lacunas Spring Boot',
      'Sou recrutador Java. Qual sua experiência profissional Java, Hibernate e PostgreSQL e onde estudou Spring Boot?',
      ['experiencia-sig', 'experiencia-acrux', 'webservice-springboot-jpa'],
    ],
    [
      'entrevista IA e LangChain com laboratório RAG',
      'Para vaga IA com LangChain e RAG, quais implementações reais e laboratórios existem?',
      ['phasscode-platform', 'embeddings-neo4j-rag'],
    ],
    [
      'React TypeScript com testes e acessibilidade',
      'Vaga React TypeScript com testes Playwright, WCAG e acessibilidade. O que comprovou?',
      ['web-portfolio-v2'],
    ],
    [
      'Flutter com base profissional em energia',
      'Vaga Flutter e Firebase: quais projetos e experiências profissionais comprováveis?',
      ['greencity-os', 'experiencia-greencity'],
    ],
    [
      'qualidade e QA',
      'Sou recrutador QA e automação de testes. O que ele entregou com acessibilidade?',
      ['web-portfolio-v2', 'phasscode-platform'],
    ],
    [
      'DevOps e pipelines',
      'Vaga DevOps/SRE: quais pipelines GitHub Actions e deploy Docker ele implementou?',
      ['phasscode-platform'],
    ],
    [
      'engenharia de dados Python',
      'Vaga de engenharia de dados com Python, NASA POWER, pvlib e FastAPI',
      ['hsp-simulator'],
    ],
    [
      'software e energia',
      'Vaga para utilities e energia fotovoltaica: projetos e experiência na Greencity?',
      ['experiencia-greencity', 'hsp-simulator'],
    ],
  ])(
    'prioriza evidências em %s sem carregar código integral',
    async (_title, query, requiredIds) => {
      const { knowledge } = await createService();
      const results = knowledge.search(query as string);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      for (const id of requiredIds as string[]) {
        expect(results.map((doc) => doc.id)).toContain(id);
      }
      expect(results.every((doc) => doc.content.length <= 6000)).toBe(true);
    },
  );

  it('a base não troca stacks entre empregadores, ignora falsos negativos em testes e distingue RAG', async () => {
    const docs = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8'));
    const byId = (id: string) => docs.find((doc: { id: string }) => doc.id === id);
    const acrux = byId('experiencia-acrux').content as string;
    const sig = byId('experiencia-sig').content as string;
    const frontend = byId('web-portfolio-v2').content as string;
    const backend = byId('phasscode-platform').content as string;
    const hsp = byId('hsp-simulator').content as string;
    expect(acrux).toContain('H2');
    expect(acrux).toContain('NetBeans');
    expect(acrux).toContain('NÃO transferir');
    expect(sig).toContain('Hibernate');
    expect(sig).toContain('JBoss');
    expect(sig).toContain('PostgreSQL');
    expect(frontend).toContain('Playwright');
    expect(frontend).toContain('axe-core');
    expect(frontend).toContain('WCAG');
    expect(backend).toContain('LangChain');
    expect(backend).toContain('NÃO é um RAG vetorial');
    expect(hsp).toContain('NÃO comprova');
    expect(hsp).toContain('PVsyst');
  });

  it('mantém matriz opt-in de entrevistas com 12 casos verificáveis', async () => {
    const data = JSON.parse(await readFile('evaluation/recruiter-cases.json', 'utf8'));
    const matrix = matrixSchema.parse(data);
    expect(matrix.cases).toHaveLength(12);
    expect(matrix.cases.flatMap((c) => c.turns).length).toBe(13);
    const docs = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8'));
    const ids = new Set(docs.map((d: { id: string }) => d.id));
    for (const scenario of matrix.cases) {
      for (const turn of scenario.turns) {
        for (const id of turn.expect.requiredSourceIds) expect(ids.has(id)).toBe(true);
      }
    }
  });
});
