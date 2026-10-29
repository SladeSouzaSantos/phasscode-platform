import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { documentSource, selectSources } from '../apps/orbe-node/src/application/sources.js';
import type { KnowledgeDocument } from '../apps/orbe-node/src/domain/ports.js';
import { sourceSchema } from '../packages/contracts/src/index.js';

const documents: KnowledgeDocument[] = [
  {
    type: 'profile',
    id: 'experience-sigaa',
    title: 'Experiência profissional no SIGAA',
    content:
      'Pedro trabalhou no desenvolvimento e manutenção do sistema acadêmico SIGAA com Java, Hibernate, JBoss e PostgreSQL. O sistema pertence a terceiros e não há repositório público da participação profissional.',
    keywords: ['java', 'experiência', 'sigaa'],
    technologies: ['Java', 'Hibernate', 'JBoss', 'PostgreSQL'],
    category: 'professional',
    visibility: 'third-party',
    relatedProjectIds: ['study-spring-jpa'],
  },
  {
    type: 'project',
    id: 'study-spring-jpa',
    title: 'Webservice Spring Boot com JPA',
    content:
      'Projeto de estudo em Java com Spring Boot, Spring Data JPA e H2. Implementa consultas HTTP de usuários e separa entidades, repositórios e serviços.',
    keywords: ['java', 'spring boot', 'jpa', 'projeto'],
    technologies: ['Java', 'Spring Boot', 'Spring Data', 'JPA', 'H2'],
    category: 'study',
    visibility: 'public',
    url: 'https://example.com/catalog.json',
    repositoryUrl: 'https://github.com/example/spring-jpa',
    demoUrl: 'https://example.com/demo',
  },
  {
    type: 'profile',
    id: 'skills',
    title: 'Conhecimentos técnicos',
    content: 'Conhecimentos em Java, Spring Boot, React, Python, Flutter, Docker e PostgreSQL.',
    keywords: ['competências', 'java', 'spring boot', 'python', 'react', 'flutter'],
    technologies: ['Java', 'Spring Boot', 'React', 'Python', 'Flutter', 'Docker', 'PostgreSQL'],
    url: 'https://example.com/profile',
  },
  {
    type: 'profile',
    id: 'courses',
    title: 'Cursos e estudos complementares',
    content: 'Cursos de Java, Spring Boot, React, Python, Docker, testes, Git e ferramentas.',
    keywords: ['java', 'spring boot', 'react', 'python', 'cursos'],
    technologies: ['Java', 'Spring Boot', 'React', 'Python', 'Docker'],
    category: 'study',
  },
  {
    type: 'project',
    id: 'portfolio-react',
    title: 'Portfólio React e TypeScript',
    content: 'Portfólio pessoal implementado com React, TypeScript, Vite e animações GSAP.',
    keywords: ['react', 'typescript', 'javascript', 'java', 'projeto'],
    technologies: ['React', 'TypeScript', 'JavaScript', 'Vite'],
    category: 'personal',
    visibility: 'public',
    repositoryUrl: 'https://github.com/example/portfolio',
  },
  {
    type: 'platform',
    id: 'platform',
    title: 'Plataforma de IA',
    content:
      'A plataforma usa Node.js, TypeScript, LangChain, Docker e Redis. Java e Spring Boot estão previstos para uma fase futura.',
    keywords: ['ia', 'langchain', 'java', 'spring boot', 'projeto'],
    technologies: ['Node.js', 'TypeScript', 'LangChain', 'Docker', 'Redis', 'IA'],
    category: 'personal',
    visibility: 'public',
    repositoryUrl: 'https://github.com/example/platform',
  },
];

describe('recuperação de experiência e projetos por tecnologias reais', () => {
  const knowledge = new JsonKnowledgeRepository(documents);

  it('prioriza experiência Java e projeto de estudo relevante para uma vaga', () => {
    const results = knowledge.search(
      'Boa tarde! Meu nome é Izabel, gostaria de saber as qualificações de Pedro para uma vaga de Java!',
    );
    expect(results.slice(0, 2).map((document) => document.id)).toEqual([
      'experience-sigaa',
      'study-spring-jpa',
    ]);
    expect(results.map((document) => document.id)).not.toContain('portfolio-react');
    expect(results.map((document) => document.id)).not.toContain('platform');
    expect(results.slice(0, 2).map((document) => document.id)).not.toContain('courses');
  });

  it('não transforma Java do roadmap em implementação nem JavaScript em Java', () => {
    expect(knowledge.search('Spring Boot').map((document) => document.id)).not.toContain(
      'platform',
    );
    expect(knowledge.search('JavaScript').map((document) => document.id)).toEqual([
      'portfolio-react',
    ]);
  });

  it('recupera SIGAA para experiência e diferencia tecnologias apenas relacionadas', () => {
    expect(knowledge.search('Experiência profissional no SIGAA')[0]!.id).toBe('experience-sigaa');
    expect(knowledge.search('Projetos Spring Boot')[0]!.id).toBe('study-spring-jpa');
    expect(knowledge.search('LangChain e inteligência artificial')[0]!.id).toBe('platform');
    expect(knowledge.search('projeto react/typescript')[0]!.id).toBe('portfolio-react');
    expect(knowledge.search('xilofone interplanetário')).toEqual([]);
  });

  it('preserva limite de cinco documentos e campos antigos sem metadata', () => {
    const legacy = new JsonKnowledgeRepository(
      Array.from({ length: 8 }, (_, index) => ({
        type: 'project' as const,
        id: `java-${index}`,
        title: `Aplicação Java ${index}`,
        content: 'Aplicação Java de estudo.',
        keywords: ['java'],
      })),
    );
    expect(legacy.search('Java')).toHaveLength(5);
    expect(legacy.search('JavaScript')).toEqual([]);
    const contentOnly = new JsonKnowledgeRepository([
      {
        type: 'project',
        id: 'legacy-react',
        title: 'Interface de estudo',
        content: 'Interface implementada com React.',
        keywords: [],
      },
    ]);
    expect(contentOnly.search('React').map((document) => document.id)).toEqual(['legacy-react']);
  });

  it('recupera evidências Java e projeto Spring/JPA da base publicada sem misturar roadmap', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const results = knowledge.search('Quais as qualificações de Pedro para uma vaga Java?');
    expect(results.map((document) => document.id)).toContain('experiencia-sig');
    expect(results.map((document) => document.id)).toContain('webservice-springboot-jpa');
    expect(results.map((document) => document.id)).not.toContain('phasscode-platform');
    const sources = selectSources({
      query: 'Quais as qualificações de Pedro para uma vaga Java?',
      answer:
        'Pedro tem experiência com Java no desenvolvimento e manutenção do SIGAA, usando Hibernate, JBoss e PostgreSQL. O Webservice Spring Boot com JPA é um projeto de estudo em Java 17, com Spring Data JPA e H2.',
      documents: results,
    });
    expect(sources.map((source) => source.id).sort()).toEqual([
      'experiencia-sig',
      'webservice-springboot-jpa',
    ]);
    expect(sources.find((source) => source.id === 'webservice-springboot-jpa')!.url).toBe(
      'https://github.com/SladeSouzaSantos/webservice-springboot3-jpa',
    );
  });
});

describe('seleção determinística de fontes usadas na resposta', () => {
  it('cita experiência SIGAA e repositório Spring/JPA, excluindo perfil e cursos recuperados', () => {
    const sources = selectSources({
      query: 'Quais são as qualificações de Pedro para uma vaga Java?',
      answer:
        'Pedro tem experiência profissional com Java no desenvolvimento e manutenção do SIGAA, usando Hibernate, JBoss e PostgreSQL. O Webservice Spring Boot com JPA é um projeto de estudo em Java, com consultas HTTP de usuários e H2.',
      documents,
    });
    expect(sources.map((source) => source.id).sort()).toEqual([
      'experience-sigaa',
      'study-spring-jpa',
    ]);
    expect(sources.find((source) => source.id === 'study-spring-jpa')!.url).toBe(
      'https://github.com/example/spring-jpa',
    );
    expect(sources.find((source) => source.id === 'experience-sigaa')).not.toHaveProperty('url');
    for (const source of sources) expect(sourceSchema.safeParse(source).success).toBe(true);
  });

  it('não cita documentos buscados quando o texto final não os usa', () => {
    const sources = selectSources({
      query: 'Java, Python ou React?',
      answer: 'O portfólio pessoal usa React, TypeScript, Vite e animações GSAP.',
      documents,
    });
    expect(sources.map((source) => source.id)).toEqual(['portfolio-react']);
  });

  it('usa apenas os candidatos efetivamente fornecidos, inclusive conteúdo truncado', () => {
    expect(
      selectSources({
        query: 'Spring Boot?',
        answer: 'O Webservice Spring Boot com JPA é um projeto Java com consultas HTTP.',
        documents: [documents[0]!],
      }).map((source) => source.id),
    ).toEqual([]);
    expect(
      selectSources({
        query: 'Como são as consultas HTTP de usuários?',
        answer:
          'O projeto possui consultas HTTP de usuários e organiza entidades, repositórios e serviços.',
        documents: [{ ...documents[1]!, content: 'Projeto de estudo em Java.' }],
      }),
    ).toEqual([]);
  });

  it('não força fontes para respostas desconhecidas, pessoais ou saudações', () => {
    for (const answer of [
      'Não tenho informações sobre a experiência de Pedro com Spring Boot.',
      'Não posso confirmar informações sobre Spring Boot ou SIGAA.',
      'Não tenho informações públicas sobre a vida afetiva de Pedro.',
      'Olá! O Orbe está pronto para ajudar.',
    ]) {
      expect(selectSources({ query: 'Spring Boot', answer, documents })).toEqual([]);
    }
  });

  it('preserva evidência profissional sem link público e não expõe metadata interna', () => {
    const source = documentSource({
      ...documents[0]!,
      repositoryUrl: 'https://github.com/example/private',
      role: 'Desenvolvimento e manutenção, sem autoria exclusiva.',
    });
    expect(source).toEqual({
      type: 'profile',
      id: 'experience-sigaa',
      title: 'Experiência profissional no SIGAA',
    });
  });

  it('nunca entrega links diretos para JSON ou arquivos-fonte como referência profissional', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const sigaa = knowledge
      .search('experiência Java no SIGAA')
      .find((doc) => doc.id === 'experiencia-sig');
    expect(sigaa).toBeDefined();
    expect(documentSource(sigaa!).url).toBe('https://gbc.phasscode.com/#experiencia');
    const skills = knowledge
      .search('competências técnicas Java')
      .find((doc) => doc.id === 'competencias-publicas');
    expect(skills).toBeDefined();
    expect(documentSource(skills!).url).toBe('https://gbc.phasscode.com/#sobre');
    for (const url of [
      'https://phasscode.com/assets/json/experiencia.json',
      'https://github.com/example/repo/blob/main/src/data/perfil.ts',
    ]) {
      expect(documentSource({ ...documents[2]!, url })).not.toHaveProperty('url');
    }
  });

  it('prefere demo existente quando falta repositório e descarta esquemas não HTTP', () => {
    expect(documentSource({ ...documents[1]!, repositoryUrl: undefined }).url).toBe(
      'https://example.com/demo',
    );
    expect(
      documentSource({
        ...documents[1]!,
        repositoryUrl: 'javascript:alert(1)',
        demoUrl: undefined,
        url: 'file:///private',
      }),
    ).not.toHaveProperty('url');
  });

  it('permite mais de três fontes se a resposta apresentar projetos distintos', () => {
    const projects = ['Aurora', 'Nebulosa', 'Cometa', 'Pulsar'].map((name, index) => ({
      type: 'project' as const,
      id: `project-${index}`,
      title: `${name} Solar`,
      content: `${name} Solar estuda irradiância e simulação fotovoltaica.`,
      keywords: [name],
      repositoryUrl: `https://github.com/example/project-${index}`,
    }));
    const sources = selectSources({
      query: 'Quais projetos de simulação solar?',
      answer:
        'Aurora Solar, Nebulosa Solar, Cometa Solar e Pulsar Solar estudam irradiância e simulação fotovoltaica.',
      documents: projects,
    });
    expect(sources).toHaveLength(4);
  });
});

describe('validação dos metadados opcionais sem alterar o DTO público', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });
  async function load(entries: unknown[]) {
    const directory = await mkdtemp(join(tmpdir(), 'orbe-knowledge-'));
    directories.push(directory);
    const path = join(directory, 'knowledge.json');
    await writeFile(path, JSON.stringify(entries));
    return JsonKnowledgeRepository.load(path);
  }

  it('preserva registros legados e metadata de experiência e links verificados', async () => {
    const knowledge = await load([
      ...documents,
      {
        type: 'profile',
        id: 'legacy',
        title: 'Perfil sem metadata',
        content: 'Perfil profissional.',
        keywords: ['perfil'],
      },
    ]);
    expect(knowledge.search('SIGAA')[0]!.role).toBeUndefined();
    expect(knowledge.search('Spring Boot')[0]!.repositoryUrl).toBe(
      'https://github.com/example/spring-jpa',
    );
  });

  it('recusa metadata inconsistente, datas inválidas e relacionamentos desconhecidos', async () => {
    await expect(load([{ ...documents[1]!, category: 'enterprise' }])).rejects.toThrow();
    await expect(
      load([{ ...documents[1]!, repositoryUrl: 'javascript:alert(1)' }]),
    ).rejects.toThrow();
    await expect(load([{ ...documents[0]!, relatedProjectIds: ['unknown'] }])).rejects.toThrow(
      'Relacionamento desconhecido',
    );
    await expect(
      load([
        {
          ...documents[0]!,
          relatedProjectIds: [],
          experiencePeriod: { start: '2014-01', end: '2013-01', areas: ['software-development'] },
        },
      ]),
    ).rejects.toThrow();
  });
});
