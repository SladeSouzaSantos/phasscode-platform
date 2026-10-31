/**
 * Small, conservative, deterministic classifier. Only controlled labels are saved;
 * never retain the visitor's question, free text, personal details or model answer.
 */
export const ORBE_TOPICS = [
  ['java', /\bjava\b|spring\s?boot|hibernate|jpa/i],
  ['ia', /\b(?:llm|rag|langchain|agente(?:s)?|gemini|intelig[eê]ncia artificial)\b/i],
  ['python', /\bpython\b|fastapi|pvlib/i],
  ['frontend', /\breact\b|frontend|front-end|typescript|css|javascript/i],
  ['mobile', /flutter|\bdart\b|android|mobile/i],
  ['devops', /docker|kubernetes|devops|ci\/cd|nginx|terraform/i],
  ['formacao', /gradua[cç][aã]o|faculdade|curso|p[oó]s-gradua/i],
  ['energia', /fotovolta|solar|irradi[aâ]ncia|petr[oó]leo/i],
  ['dados', /\b(?:sql|nosql|dados|etl|pandas|spark)\b/i],
] as const;

export type ReportIntent = 'geral' | 'recrutamento' | 'contato';
export function classifyInteraction(message: string): {
  topics: string[];
  intent: ReportIntent;
} {
  const topics = ORBE_TOPICS.filter(([, expression]) => expression.test(message))
    .map(([label]) => label);
  const intent = /recrutad|recrutam|\bvaga\b|entrevista|contrat|curr[ií]cul|\brh\b/i.test(message)
    ? 'recrutamento'
    : /\b(?:contato|email|e-mail|whatsapp|falar com|telefonar)\b/i.test(message)
      ? 'contato'
      : 'geral';
  return { topics: topics.slice(0, 9), intent };
}
