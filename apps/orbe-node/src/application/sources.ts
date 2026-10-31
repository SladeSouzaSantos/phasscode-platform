import type { Source } from '../../../../packages/contracts/src/index.js';
import type { KnowledgeDocument } from '../domain/ports.js';
import {
  knowledgePhrase,
  knowledgeTerms,
  mentionedTechnologies,
  technologyMatches,
} from '../knowledge-matching.js';

const genericTerms = new Set(
  'projeto portfolio experiencia profissional profissionais tecnologia competencia qualificacao desenvolvimento desenvolvedor apresenta utiliza pode possui publico publica publicos publicas conhecimento conhecimentos sistema sistemas aplicacao aplicacoes estudo curso fonte fontes material registrado registrada base informacao informacoes relacionado relacionadas relacionado documentado documentada trabalho atuacao repositorio demonstracao link'.split(
    ' ',
  ),
);

function distinctiveTerms(text: string): Set<string> {
  return new Set([...knowledgeTerms(text)].filter((term) => !genericTerms.has(term)));
}

function validUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    // An internal data file or source-code permalink is never a recruiting reference.
    if (/\/assets\/json\/|\/src\/data\/|\.(?:json|ts|tsx)(?:$|[?#])/i.test(url.pathname))
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Keep the existing HTTP DTO; cite public portfolio pages or public projects, not internal files. */
export function documentSource(document: KnowledgeDocument): Source {
  const publicProject =
    (document.type === 'project' || document.type === 'platform') &&
    document.visibility !== 'private' &&
    document.visibility !== 'third-party';
  const url =
    (publicProject && (validUrl(document.repositoryUrl) ?? validUrl(document.demoUrl))) ||
    validUrl(document.url);
  return {
    type: document.type,
    id: document.id,
    title: document.title,
    ...(url ? { url } : {}),
  };
}

/**
 * Select only from bounded documents actually supplied to the provider in this turn.
 * Retrieving a record alone does not make it a source for the final answer.
 */
export function selectSources(input: {
  query: string;
  answer: string;
  documents: KnowledgeDocument[];
}): Source[] {
  const query = distinctiveTerms(input.query);
  const supportedAnswer = input.answer
    .split(/(?<=[.!?;])\s+|\n+|\bmas\b/i)
    .filter(
      (sentence) =>
        !/\b(?:nao (?:tenho|temos|ha|encontrei|consta|existem?)[\s\S]{0,70}(?:informac|dado|registro|evidenc)|nao (?:posso|consigo) confirmar|desconheco)\w*/.test(
          knowledgePhrase(sentence),
        ),
    )
    .join(' ');
  const answer = distinctiveTerms(supportedAnswer);
  const answerPhrase = ` ${knowledgePhrase(supportedAnswer)} `;
  const answerTechnologies = mentionedTechnologies(supportedAnswer);
  const queryTechnologies = mentionedTechnologies(input.query);
  // A personal project cannot substantiate duties at a third-party employer.
  // Keep company-experience evidence separate even when Java technologies overlap.
  const queryPhrase = knowledgePhrase(input.query);
  const employmentInquiry =
    /\b(?:sigaa|sig software|geowellex|acrux)\b/.test(queryPhrase) &&
    /\b(?:atuou|atuacao|contribuicao|responsabilidades?|empresa|emprego|trabalh\w*|experienc\w*)\b/.test(
      queryPhrase,
    );
  const documents = [
    ...new Map(
      input.documents
        .filter(
          (document) =>
            !employmentInquiry || (document.type !== 'project' && document.type !== 'platform'),
        )
        .map((document) => [document.id, document]),
    ).values(),
  ];
  const indexed = documents.map((document) => {
    // Evidence footnotes contain other record names and URLs; they are not the record's subject.
    const body = document.content.split(/\bFontes?\s*:/i)[0]!;
    const facts = distinctiveTerms(`${document.title} ${body}`);
    const subject = distinctiveTerms(`${document.title} ${document.id.replaceAll('-', ' ')}`);
    const technologies = mentionedTechnologies(
      document.technologies?.join(' ') ??
        `${document.title} ${document.keywords.join(' ')} ${body}`,
    );
    return { document, facts, subject, technologies };
  });
  const frequency = (term: string) => indexed.filter((entry) => entry.facts.has(term)).length;
  const weight = (term: string) => 1 + Math.log((documents.length + 1) / (frequency(term) + 1));

  const ranked = indexed
    .map(({ document, facts, subject, technologies }) => {
      const overlap = new Set([...answer].filter((term) => facts.has(term)));
      const subjectHits = [...subject].filter(
        (term) =>
          answer.has(term) && (frequency(term) < documents.length || documents.length === 1),
      );
      const exactTitle = knowledgePhrase(document.title);
      const named =
        subjectHits.some((term) => !mentionedTechnologies(term).size) ||
        (exactTitle.length > 4 && answerPhrase.includes(` ${exactTitle} `));
      const queryOverlap = [...query].some((term) => facts.has(term));
      const technologyMatch = technologyMatches(answerTechnologies, technologies);
      const requestedTechnology = technologyMatches(queryTechnologies, technologies);
      const project = document.type === 'project' || document.type === 'platform';
      // A common technology alone cannot justify a generic record with no stated facts.
      const relevant =
        overlap.size >= 2 &&
        (named ||
          queryOverlap ||
          (technologyMatch && (requestedTechnology || queryTechnologies.size === 0)));
      const score =
        [...overlap].reduce((total, term) => total + weight(term), 0) +
        (named ? 8 : 0) +
        (project && technologyMatch ? 4 : 0) +
        (document.category === 'professional' && technologyMatch ? 4 : 0);
      return { document, overlap, relevant, named, score };
    })
    .filter((entry) => entry.relevant)
    .sort((left, right) => {
      // Prefer a demonstrable project when factual relevance is comparable.
      const project = (document: KnowledgeDocument) =>
        (document.type === 'project' || document.type === 'platform') &&
        document.visibility !== 'private' &&
        document.visibility !== 'third-party' &&
        Boolean(validUrl(document.repositoryUrl) ?? validUrl(document.demoUrl));
      if (
        Math.abs(right.score - left.score) < 3 &&
        project(left.document) !== project(right.document)
      )
        return project(left.document) ? -1 : 1;
      return right.score - left.score || left.document.id.localeCompare(right.document.id);
    });

  const selected: Source[] = [];
  const covered = new Set<string>();
  const urls = new Set<string>();
  for (const entry of ranked) {
    const source = documentSource(entry.document);
    if (source.url && urls.has(source.url)) continue;
    const novel = [...entry.overlap].filter((term) => !covered.has(term));
    // Usually 1–3 sources suffice. Additional named records may support a longer answer.
    if (selected.length > 0 && novel.length < (entry.named ? 1 : 2)) continue;
    if (selected.length >= 3 && !entry.named && novel.length < 4) continue;
    selected.push(source);
    for (const term of entry.overlap) covered.add(term);
    if (source.url) urls.add(source.url);
    if (selected.length === 10) break;
  }
  return selected;
}
