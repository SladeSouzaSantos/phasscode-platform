import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { sourceSchema } from '../../../../packages/contracts/src/index.js';
import type { KnowledgeDocument, KnowledgeRepository } from '../domain/ports.js';
import { normalize } from '../domain/security.js';

const documentsSchema = z
  .array(
    sourceSchema.extend({
      content: z.string().min(1).max(6000),
      keywords: z.array(z.string().min(1).max(80)).max(40),
    }),
  )
  .min(1)
  .max(500);
const stopWords = new Set([
  'sobre',
  'quais',
  'qual',
  'como',
  'para',
  'com',
  'uma',
  'tem',
  'seus',
  'voce',
  'the',
  'what',
  'your',
  'seu',
  'que',
  'sao',
  'por',
  'dos',
  'das',
  'ele',
  'ela',
  'eles',
  'elas',
  'utiliza',
  'usa',
  'use',
  'utilizam',
  'gostaria',
  'saber',
  'explique',
  'fale',
  'responda',
  'brevemente',
  'pode',
  'possui',
  'se',
  'de',
  'do',
  'da',
  'no',
  'na',
  'em',
  'um',
  'ou',
  'os',
  'as',
  'ao',
  'is',
  'are',
]);
const aliases: Record<string, string> = {
  projetos: 'projeto',
  projects: 'projeto',
  project: 'projeto',
  tecnologias: 'tecnologia',
  technologies: 'tecnologia',
  technology: 'tecnologia',
  competencias: 'competencia',
  experiencias: 'experiencia',
  certificados: 'certificado',
  certificacoes: 'certificado',
  certification: 'certificado',
  certificacao: 'certificado',
  reunioes: 'reuniao',
  formacoes: 'formacao',
  skills: 'competencia',
  inteligencia: 'ia',
  artificial: 'ia',
  ai: 'ia',
  linguagens: 'tecnologia',
  linguagem: 'tecnologia',
  languages: 'tecnologia',
  language: 'tecnologia',
};
const broadTerms = new Set(['portfolio', 'projeto', 'tecnologia', 'competencia', 'profissional']);
function terms(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1 && !stopWords.has(term))
      .map((term) => aliases[term] ?? term),
  );
}

export class JsonKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly documents: KnowledgeDocument[]) {}
  static async load(path = 'knowledge/portfolio.json'): Promise<JsonKnowledgeRepository> {
    const documents = documentsSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
      throw new Error('IDs duplicados na base de conhecimento.');
    return new JsonKnowledgeRepository(documents);
  }
  search(query: string): KnowledgeDocument[] {
    const queryTerms = terms(query);
    const phrase = (value: string) =>
      normalize(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const queryPhrase = ` ${phrase(query)} `;
    // A marca aparece em quase todos os registros; não deve mascarar uma pergunta sem fatos.
    if (queryTerms.size > 1) queryTerms.delete('phasscode');
    const indexed = this.documents.map((doc) => {
      const title = terms(doc.title);
      const keywords = terms(doc.keywords.join(' '));
      const content = terms(doc.content);
      return { doc, title, keywords, content };
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
    const ranked = indexed.map(({ doc, title, keywords, content }) => {
      const exactPhrase = [doc.title, ...doc.keywords].some((value) => {
        const candidate = phrase(value);
        return candidate.includes(' ') && queryPhrase.includes(` ${candidate} `);
      });
      return {
        doc,
        score: [...queryTerms].reduce(
          (score, term) =>
            score +
            weights.get(term)! *
              ((title.has(term) ? 3 : 0) +
                (keywords.has(term) ? 2 : 0) +
                (content.has(term) ? 1 : 0)),
          exactPhrase ? 12 : 0,
        ),
      };
    });
    return ranked
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
      .slice(0, 5)
      .map(({ doc }) => doc);
  }
}
