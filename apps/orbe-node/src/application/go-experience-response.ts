import type { GenerationResult, KnowledgeRepository } from '../domain/ports.js';
import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';
import { documentSource } from './sources.js';

/**
 * Narrow factual answer for direct questions about Go experience. It never
 * extrapolates Go proficiency from another language, company or study project.
 * Multi-skill comparisons and vacancy analysis remain with the model.
 */
export function buildDirectGoExperienceResponse(
  question: string,
  knowledge: KnowledgeRepository,
): GenerationResult | undefined {
  const phrase = knowledgePhrase(question);
  if (!/\b(?:go|golang)\b/.test(phrase)) return undefined;
  if (
    !/\b(?:experiencia|experiencias|profissional|trabalhou|trabalha|trabalhar|atuou|atua|atuar|atuacao|conhece|conhecimento|domina|dominio|sabe|pratica|pratico|usou|utilizou|producao)\b/.test(
      phrase,
    )
  )
    return undefined;
  if (
    /\b(?:vaga|requisito|requisitos|exige|exigencia|obrigatorio|obrigatoria|contratar|contratacao|candidatura|aderencia|compatibilidade|comparar|compare|comparacao|matriz|tabela|planilha)\b/.test(
      phrase,
    ) ||
    mentionedTechnologies(question).size > 0
  )
    return undefined;

  // Fail open to normal evidence-based generation if Go appears in the
  // catalog: a future Go project or employment record must not be denied.
  if (
    knowledge
      .search('Go Golang')
      .some((document) =>
        /\b(?:go|golang)\b/i.test(
          [...(document.technologies ?? []), ...document.keywords].join(' '),
        ),
      )
  )
    return undefined;

  const sigaa = knowledge.getDocument?.('experiencia-sig');
  const phasscode = knowledge.getDocument?.('phasscode-platform');
  const hasTechnology = (values: string[] | undefined, name: string) =>
    (values ?? []).some((value) => knowledgePhrase(value) === name);

  // Never construct transferable evidence from missing or changed documents.
  if (
    !sigaa ||
    !phasscode ||
    !hasTechnology(sigaa.technologies, 'java') ||
    !hasTechnology(sigaa.technologies, 'postgresql') ||
    !hasTechnology(phasscode.technologies, 'node js') ||
    !hasTechnology(phasscode.technologies, 'typescript')
  )
    return undefined;

  return {
    answer: [
      'Não há experiência profissional com Go (Golang) comprovada na documentação disponível. Isso não significa afirmar que Pedro desconheça a linguagem.',
      '',
      'Duas competências documentadas que podem facilitar uma futura adaptação:',
      '- **Backend Java no SIGAA (experiência profissional):** desenvolvimento de funcionalidades e persistência com PostgreSQL; conceitos de lógica de negócio e acesso a dados são transferíveis, não a sintaxe nem as bibliotecas de Go.',
      '- **APIs em Node.js/TypeScript no PHASSCODE Platform (projeto autoral):** construção de serviços HTTP, integrações e testes oferece experiência aplicável ao desenho de serviços em Go, mas não comprova domínio dessa linguagem.',
      '',
      'Para uma vaga que exija Go em produção, essa experiência direta permanece uma lacuna não comprovada.',
    ].join('\n'),
    sources: [documentSource(sigaa), documentSource(phasscode)],
  };
}
