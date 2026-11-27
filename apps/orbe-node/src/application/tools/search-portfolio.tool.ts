import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AppError } from '../../domain/errors.js';
import type { GenerationInput, KnowledgeRepository } from '../../domain/ports.js';

export const searchPortfolioArgs = z.strictObject({ query: z.string().min(1).max(300) });

interface SearchPortfolioOptions {
  knowledge: KnowledgeRepository;
  serialize(docs: GenerationInput['documents']): string;
  record(docs: GenerationInput['documents']): string;
  fits(content: string): boolean;
}

export function createSearchPortfolioTool(options: SearchPortfolioOptions) {
  return tool(
    ({ query }) => {
      const docs = options.knowledge
        .search(query)
        .map((doc) => ({ ...doc, content: doc.content.slice(0, 2000) }));
      const selected: GenerationInput['documents'] = [];
      if (!options.fits('[]'))
        throw new AppError(
          'LLM_CONTEXT_LIMIT',
          502,
          'Limite de contexto do assistente atingido. Envie uma mensagem mais curta.',
        );
      for (const doc of docs) {
        const candidate = [...selected, doc];
        if (options.fits(options.serialize(candidate))) selected.push(doc);
      }
      return options.record(selected);
    },
    {
      name: 'search_portfolio',
      description: 'Busca fatos públicos do portfólio PHASSCODE. Apenas leitura.',
      schema: searchPortfolioArgs,
    },
  );
}
