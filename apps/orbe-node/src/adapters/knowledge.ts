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
]);

export class JsonKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly documents: KnowledgeDocument[]) {}
  static async load(path = 'knowledge/portfolio.json'): Promise<JsonKnowledgeRepository> {
    const documents = documentsSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
      throw new Error('IDs duplicados na base de conhecimento.');
    return new JsonKnowledgeRepository(documents);
  }
  search(query: string): KnowledgeDocument[] {
    const terms = [
      ...new Set(
        normalize(query)
          .split(/[^a-z0-9]+/)
          .filter((term) => term.length > 2 && !stopWords.has(term)),
      ),
    ];
    const ranked = this.documents.map((doc) => {
      const text = normalize(`${doc.title} ${doc.content} ${doc.keywords.join(' ')}`);
      return {
        doc,
        score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0),
      };
    });
    return ranked
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ doc }) => doc);
  }
}
