import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { sourceSchema } from '../../../../packages/contracts/src/index.js';
import type { KnowledgeDocument, KnowledgeRepository } from '../domain/ports.js';
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
  constructor(private readonly documents: KnowledgeDocument[]) {}
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
    return new JsonKnowledgeRepository(documents);
  }
  experienceDocuments(): KnowledgeDocument[] {
    return this.documents.filter((document) => document.experiencePeriod !== undefined);
  }
  search(query: string): KnowledgeDocument[] {
    const queryTerms = knowledgeTerms(query);
    const queryPhrase = ` ${knowledgePhrase(query)} `;
    const queryTechnologies = mentionedTechnologies(query);
    if (isTechnologyProjectQuestion(query)) {
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
      if (projects.length > 0) return projects.slice(0, 5);
    }
    if (queryTechnologies.size === 0 && isCareerOverview(query)) {
      const selected = recruiterOverviewIds.flatMap((id) => {
        const document = this.documents.find((item) => item.id === id);
        return document ? [document] : [];
      });
      // Custom repositories in tests may not contain the curated records.
      if (selected.length >= 3) return selected.slice(0, 5);
    }
    const credentialQuestion =
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
      // Perguntas sobre cursos devem privilegiar trilhas de cursos concluídos;
      // vagas, projetos e experiência continuam usando suas evidências próprias.
      const seekingCourses = /\\b(?:cursos?|certificados?|capacitac\\w*|treinament\\w*)\\b/.test(queryPhrase);
      if (seekingCourses && doc.id.startsWith('cursos-')) relevance += 16;
      return {
        doc,
        eligible:
          queryTechnologies.size === 0 || credentialQuestion || technologyMatch || explicitSubject,
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
    return ranked
      .filter(({ score, eligible }) => eligible && score > 0)
      .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
      .slice(0, 5)
      .map(({ doc }) => doc);
  }
}
