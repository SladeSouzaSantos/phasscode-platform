import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { sourceSchema } from '../../../../packages/contracts/src/index.js';
import type { KnowledgeDocument, KnowledgeRepository } from '../domain/ports.js';
import { enrichProjectDocument, loadPpksCards, type TechnicalCard } from './ppks.js';
import {
  knowledgePhrase,
  knowledgeTerms,
  mentionedTechnologies,
  technologyMatches,
} from '../knowledge-matching.js';

const documentsSchema = z
  .array(
    sourceSchema.extend({
      content: z.string().min(1).max(6000),
      keywords: z.array(z.string().min(1).max(80)).max(40),
      technologies: z.array(z.string().min(1).max(80)).max(40).optional(),
      category: z.enum(['professional', 'personal', 'study', 'contribution']).optional(),
      role: z.string().min(1).max(1000).optional(),
      visibility: z.enum(['public', 'private', 'third-party']).optional(),
      relatedProjectIds: z.array(z.string().min(1).max(120)).max(20).optional(),
      repositoryUrl: z.httpUrl().optional(),
      demoUrl: z.httpUrl().optional(),
      experiencePeriod: z
        .strictObject({
          start: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
          end: z
            .string()
            .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
            .optional(),
          currentAsOf: z.iso.date().optional(),
          areas: z
            .array(z.enum(['software-development', 'engineering']))
            .min(1)
            .max(2),
        })
        .refine((period) => !period.end || period.end >= period.start)
        .optional(),
    }),
  )
  .min(1)
  .max(500);
const broadTerms = new Set(['portfolio', 'projeto', 'tecnologia', 'competencia', 'profissional']);

/** Broad recruiting questions need concrete evidence instead of falling through lexical search. */
function isCareerOverview(query: string): boolean {
  const text = knowledgePhrase(query);
  return /\b(?:qualificad\w*|qualificac\w*|habilidad\w*|diferencia\w*|pontos? fortes?|aptidao|recrutad\w*|recruiter\w*|contrat\w*|vaga\w*|candidat\w*|oportunidad\w*|programador\w*|desenvolvedor\w*|juniors?|juniores|plenos?|seniors?|seniores|senioridade|nivel\w*|compatib\w*)\b/.test(
    text,
  );
}

/** An explicit technology-project request must not turn job histories into public projects. */
function isTechnologyProjectQuestion(query: string): boolean {
  const phrase = knowledgePhrase(query);
  return (
    /\b(?:projetos?|repositorios?|exemplos?|codigo)\b/.test(phrase) &&
    !/\b(?:experienc\w*|empreg\w*|trabalh\w*|profission\w*)\b/.test(phrase) &&
    mentionedTechnologies(query).size > 0
  );
}

const recruiterOverviewIds = [
  'pedro-santos',
  'experiencia-sig',
  'webservice-springboot-jpa',
  'phasscode-platform',
  'competencias-publicas',
] as const;

export class JsonKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly documents: KnowledgeDocument[],
    private readonly projectCards = new Map<string, TechnicalCard>(),
  ) {}
  private select(documents: KnowledgeDocument[], query: string): KnowledgeDocument[] {
    return documents.map((document) => enrichProjectDocument(document, query, this.projectCards));
  }
  static async load(path = 'knowledge/portfolio.json'): Promise<JsonKnowledgeRepository> {
    const documents = documentsSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
      throw new Error('IDs duplicados na base de conhecimento.');
    const projects = new Set(
      documents
        .filter((document) => document.type === 'project' || document.type === 'platform')
        .map((document) => document.id),
    );
    if (documents.some((document) => document.relatedProjectIds?.some((id) => !projects.has(id))))
      throw new Error('Relacionamento desconhecido na base de conhecimento.');
    const cards = path === 'knowledge/portfolio.json'
      ? await loadPpksCards()
      : new Map<string, TechnicalCard>();
    return new JsonKnowledgeRepository(documents, cards);
  }
  experienceDocuments(): KnowledgeDocument[] {
    return this.documents.filter((document) => document.experiencePeriod !== undefined);
  }
  search(query: string): KnowledgeDocument[] {
    const queryTerms = knowledgeTerms(query);
    const queryPhrase = ` ${knowledgePhrase(query)} `;
    const queryTechnologies = mentionedTechnologies(query);
    const educationIntent =
      /\b(?:cursos?|certificados?|certificacoes?|capacitac\w*|treinament\w*|formacao|graduacao|pos graduacao)\b/.test(
        knowledgePhrase(query),
      );
    const courseIntent = /\b(?:cursos?|capacitac\w*|treinament\w*)\b/.test(queryPhrase);
    // An explicit request for the complete catalog needs the six study tracks,
    // not five ranked snippets that silently omit a track.
    const completeCourseCatalog =
      /\b(?:todos os cursos|todos os 42 cursos|42 cursos|lista completa de cursos|cursos por trilha|liste todos os cursos)\b/.test(
        knowledgePhrase(query),
      );
    if (completeCourseCatalog) {
      const ids = [
        'cursos-declarados',
        'cursos-java-arquitetura',
        'cursos-ia-dados',
        'cursos-frontend-mobile',
        'cursos-engenharia-software',
        'cursos-bancos-dados',
        'cursos-devops-qualidade',
      ];
      return this.select(ids.flatMap((id) => this.documents.filter((doc) => doc.id === id)), query);
    }
    const vendorCertificate =
      /\b(?:certificad\w*|certificac\w*)\b/.test(queryPhrase) &&
      queryTechnologies.size > 0 &&
      !courseIntent;
    if (!educationIntent && isTechnologyProjectQuestion(query)) {
      const projects = this.documents.filter(
        (document) =>
          (document.type === 'project' || document.type === 'platform') &&
          document.visibility !== 'private' &&
          document.visibility !== 'third-party' &&
          technologyMatches(
            queryTechnologies,
            mentionedTechnologies(document.technologies?.join(' ') ?? ''),
          ),
      );
      if (projects.length > 0) return this.select(projects.slice(0, 5), query);
    }
    const specialistIntent =
      /\b(?:qa|testes?|acessibilidade|devops|sre|energia|fotovoltaic\w*|solar|utilities|petroleo|dados)\b/.test(
        knowledgePhrase(query),
      );
    if (
      queryTechnologies.size === 0 &&
      !educationIntent &&
      !specialistIntent &&
      isCareerOverview(query)
    ) {
      const selected = recruiterOverviewIds.flatMap((id) => {
        const document = this.documents.find((item) => item.id === id);
        return document ? [document] : [];
      });
      // Custom repositories in tests may not contain the curated records.
      if (selected.length >= 3) return this.select(selected.slice(0, 5), query);
    }
    const credentialQuestion =
      educationIntent ||
      /\b(?:certificad\w*|certificac\w*|diploma\w*|curso\w*|formac\w*|graduac\w*)\b/.test(
        knowledgePhrase(query),
      );
    const indexed = this.documents.map((doc) => {
      const title = knowledgeTerms(doc.title);
      const keywords = knowledgeTerms(doc.keywords.join(' '));
      const content = knowledgeTerms(doc.content);
      // Optional metadata describes actual technologies. A roadmap mention is not an implementation.
      const technologies = mentionedTechnologies(
        doc.technologies?.join(' ') ?? `${doc.title} ${doc.keywords.join(' ')} ${doc.content}`,
      );
      return { doc, title, keywords, content, technologies };
    });
    const weights = new Map(
      [...queryTerms].map((term) => {
        const frequency = indexed.filter(
          (doc) => doc.title.has(term) || doc.keywords.has(term) || doc.content.has(term),
        ).length;
        const specificity = broadTerms.has(term) ? 0.25 : 1;
        return [term, specificity * (1 + Math.log((indexed.length + 1) / (frequency + 1)))];
      }),
    );
    const ranked = indexed.map(({ doc, title, keywords, content, technologies }) => {
      const exactPhrase = [doc.title, ...doc.keywords].some((value) => {
        const candidate = knowledgePhrase(value);
        return candidate.includes(' ') && queryPhrase.includes(` ${candidate} `);
      });
      const explicitSubject =
        [doc.title, doc.id.replaceAll('-', ' ')].some((value) => {
          const candidate = knowledgePhrase(value);
          return candidate.includes(' ') && queryPhrase.includes(` ${candidate} `);
        }) ||
        (() => {
          const identifier = knowledgePhrase(doc.id).split(' ');
          const queryWords = new Set(queryPhrase.trim().split(' '));
          return (
            identifier.length >= 2 &&
            identifier.every(
              (part) =>
                queryWords.has(part) || (part === 'platform' && queryWords.has('plataforma')),
            )
          );
        })();
      const technologyMatch = technologyMatches(queryTechnologies, technologies);
      const requestedProject = /\b(?:projeto\w*|repositorio\w*|demonstr\w*|link\w*)\b/.test(
        queryPhrase,
      );
      const requestedExperience = /\b(?:experienc\w*|vaga\w*|qualificac\w*|trabalh\w*)\b/.test(
        queryPhrase,
      );
      const project = doc.type === 'project' || doc.type === 'platform';
      let relevance = explicitSubject ? 16 : 0;
      if (technologyMatch) {
        relevance += project ? 9 : doc.category === 'professional' ? 10 : 2;
        if (requestedProject && project) relevance += 12;
        if (requestedExperience && doc.category === 'professional') relevance += 10;
        if (doc.category === 'study' && !project) relevance -= 5;
      }
      // Trilhas de cursos não podem substituir experiência e projetos em buscas Java/IA.
      // Certificações de fornecedores exigem evidência própria; cursos não a comprovam.
      const courseRecord = doc.id.startsWith('cursos-');
      const namedCourse = explicitSubject && courseRecord;
      const genericCertificates =
        /\b(?:certificad\w*|certificac\w*)\b/.test(queryPhrase) && queryTechnologies.size === 0;
      const namedHackers =
        queryPhrase.includes(' hackers do bem ') && doc.id === 'cursos-hackers-do-bem';
      const eligibleCourse =
        courseIntent ||
        namedCourse ||
        namedHackers ||
        (genericCertificates && doc.id === 'cursos-declarados');
      if (courseRecord && eligibleCourse) relevance += courseIntent ? 16 : 6;
      if (namedHackers) relevance += 30;
      if (vendorCertificate && doc.id === 'trajetoria-a-confirmar') relevance += 35;
      if (
        /\b(?:competenc\w*|habilidad\w*)\b/.test(queryPhrase) &&
        doc.id === 'competencias-publicas'
      )
        relevance += 35;
      // For vacancies Java, the SIGAA work and public Spring/JPA study are
      // complementary evidence; unrelated course tracks are not substitutes.
      if (isCareerOverview(query) && queryTechnologies.has('java') && !educationIntent) {
        if (doc.id === 'experiencia-sig') relevance += 30;
        if (doc.id === 'webservice-springboot-jpa') relevance += 30;
      }
      return {
        doc,
        eligible:
          (!courseRecord || eligibleCourse) &&
          (queryTechnologies.size === 0 ||
            credentialQuestion ||
            technologyMatch ||
            explicitSubject),
        score: [...queryTerms].reduce(
          (score, term) =>
            score +
            weights.get(term)! *
              ((title.has(term) ? 3 : 0) +
                (keywords.has(term) ? 2 : 0) +
                (content.has(term) ? 1 : 0)),
          (exactPhrase ? 12 : 0) + relevance,
        ),
      };
    });
    const matches = ranked
      .filter(({ score, eligible }) => eligible && score > 0)
      .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
      .map(({ doc }) => doc);

    // Pre-curated evidence anchors keep the right employer/project in a recruiter's
    // bounded context. No live GitHub/MCP request, no additional LLM tokens beyond
    // the existing five-document ceiling. Missing IDs are ignored for test fixtures.
    const anchors: string[] = [];
    const add = (...ids: string[]) => anchors.push(...ids);
    const phrase = knowledgePhrase(query);
    const vacancy =
      /\b(?:vaga|recrutad\w*|experienc\w*|profission\w*|trabalh\w*|candidat\w*|qualific\w*)\b/.test(
        phrase,
      );
    if (queryTechnologies.has('java') && vacancy) {
      add('experiencia-sig', 'webservice-springboot-jpa', 'experiencia-acrux');
    }
    // Cross-project questions must distinguish banks used at work from study databases.
    if (/\b(?:banco|bancos|persistencia|relacional|relacionais|sql|mysql|postgresql|postgres|h2|indice|indices|migrac\w*)\b/.test(phrase)) {
      add('experiencia-sig', 'experiencia-geowellex', 'experiencia-acrux',
        'webservice-springboot-jpa', 'phasscode-platform');
    }
    if (/\b(?:git|pull request|pull requests|prs|branches|merge|colaborac\w*|revisao de codigo)\b/.test(phrase)) {
      add('phasscode-platform', 'web-portfolio-v2', 'experiencia-sig');
    }
    if (queryTechnologies.has('react') || queryTechnologies.has('typescript')) {
      add('web-portfolio-v2');
    }
    if (queryTechnologies.has('langchain') || /\b(?:rag|llms?|agentes|guardrails)\b/.test(phrase)) {
      add('phasscode-platform', 'embeddings-neo4j-rag', 'langchain-intro');
    }
    if (
      queryTechnologies.has('python') ||
      /\b(?:engenharia de dados|analista de dados|etl|nasa power|pvlib)\b/.test(phrase)
    ) {
      add('hsp-simulator');
    }
    if (queryTechnologies.has('flutter') || queryTechnologies.has('firebase')) {
      add('greencity-os', 'experiencia-greencity');
    }
    if (
      /\b(?:qa|testes? automatizad\w*|qualidade de software|acessibilidade|playwright|wcag)\b/.test(
        phrase,
      )
    ) {
      add('web-portfolio-v2', 'phasscode-platform');
    }
    if (/\b(?:devops|sre|ci cd|github actions|pipeline|deploy)\b/.test(phrase)) {
      add('phasscode-platform', 'task-manager-flask');
    }
    if (/\b(?:energia|fotovoltaic\w*|solar|utilities|petroleo)\b/.test(phrase)) {
      add('experiencia-greencity', 'hsp-simulator');
    }

    const indexedById = new Map(this.documents.map((doc) => [doc.id, doc]));
    const priority = [...new Set(anchors)].flatMap((id) => {
      const doc = indexedById.get(id);
      return doc ? [doc] : [];
    });
    return this.select(
      [...new Map([...priority, ...matches].map((doc) => [doc.id, doc])).values()].slice(0, 5),
      query,
    );
  }
}
