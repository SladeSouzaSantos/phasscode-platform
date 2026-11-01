import { chatResponseSchema, type Source } from '../packages/contracts/src/index.js';
import type { Check, EvaluationStatus, Expectation, TurnAssessment } from './schema.js';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function containsTerm(text: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'u').test(normalize(text));
}

export function aggregateStatus(checks: ReadonlyArray<{ status: EvaluationStatus }>) {
  if (checks.some(({ status }) => status === 'fail')) return 'fail';
  if (checks.some(({ status }) => status === 'review')) return 'review';
  return 'pass';
}

// Somente texto público é persistido; tokens de conversa nunca entram no relatório.
export function redactText(text: string, privateValues: readonly string[] = []): string {
  let result = text
    .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, '[REDACTED_KEY]')
    .replace(/\bBearer\s+[a-z0-9_.-]{12,}/gi, 'Bearer [REDACTED_TOKEN]');
  for (const value of privateValues)
    if (value) result = result.replaceAll(value, '[REDACTED_TOKEN]');
  return result;
}

export function evaluateTurn(
  raw: unknown,
  expectation: Expectation,
  catalog: readonly (Source & { repositoryUrl?: string; demoUrl?: string; visibility?: string })[],
  context: { live: boolean; isNew: boolean; expectedConversationId?: string },
): TurnAssessment {
  const parsed = chatResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'fail',
      sourceIds: [],
      checks: [
        {
          id: 'contract',
          status: 'fail',
          explanation: 'Resposta não atende ao schema Zod público; corpo inválido omitido.',
        },
      ],
    };
  }
  const response = parsed.data;
  const checks: Check[] = [
    { id: 'contract', status: 'pass', explanation: 'Resposta atende ao contrato Zod público.' },
  ];
  const add = (id: string, condition: boolean, success: string, failure: string) => {
    checks.push({
      id,
      status: condition ? 'pass' : 'fail',
      explanation: condition ? success : failure,
    });
  };
  if (context.live) {
    add(
      'real-provider',
      response.meta.simulated === false && response.meta.provider !== 'mock',
      'Provedor real e simulated=false; isto não comprova tool calling por si só.',
      'Execução live recebeu resposta mock ou marcada como simulada.',
    );
  }
  add(
    'conversation-token',
    context.isNew
      ? typeof response.conversationToken === 'string'
      : response.conversationToken === undefined,
    context.isNew ? 'Nova conversa emitiu token.' : 'Continuação não reemitiu token.',
    context.isNew ? 'Nova conversa não emitiu token.' : 'Continuação reemitiu token indevidamente.',
  );
  if (context.expectedConversationId) {
    add(
      'conversation-continuity',
      response.conversationId === context.expectedConversationId,
      'Identificador da conversa foi preservado.',
      'Continuação respondeu com outra conversa.',
    );
  }
  const sourceIds = response.sources.map((source) => source.id);
  const validSources = response.sources.every((source) => {
    const reference = catalog.find((item) => item.id === source.id);
    const publicProject =
      reference &&
      ['project', 'platform'].includes(reference.type) &&
      reference.visibility !== 'private' &&
      reference.visibility !== 'third-party';
    const knownUrls = publicProject
      ? [reference.repositoryUrl, reference.demoUrl, reference.url]
      : [reference?.url];
    const documentedUrls = knownUrls.filter((url): url is string => typeof url === 'string');
    return (
      reference &&
      reference.type === source.type &&
      reference.title === source.title &&
      (source.url === undefined ? documentedUrls.length === 0 : documentedUrls.includes(source.url))
    );
  });
  add(
    'source-catalog',
    validSources && new Set(sourceIds).size === sourceIds.length,
    'IDs, tipos, títulos e URLs das fontes correspondem ao catálogo e não se repetem.',
    'Fonte desconhecida, adulterada ou duplicada; citar um ID não comprova fundamentação.',
  );
  if (expectation.sourcePolicy !== 'optional') {
    const shouldHaveSources = expectation.sourcePolicy === 'required';
    add(
      'source-policy',
      shouldHaveSources ? sourceIds.length > 0 : sourceIds.length === 0,
      shouldHaveSources ? 'Resposta inclui fonte rastreável.' : 'Recusa sem fontes artificiais.',
      shouldHaveSources
        ? 'Resposta factual sem fonte rastreável.'
        : 'Recusa incluiu fontes indevidas.',
    );
  }
  for (const id of expectation.requiredSourceIds) {
    add(
      `source:${id}`,
      sourceIds.includes(id),
      'Fonte esperada foi citada.',
      'Fonte esperada não foi citada.',
    );
  }
  for (const concept of expectation.concepts) {
    const found = concept.anyOf.some((term) => containsTerm(response.answer, term));
    checks.push({
      id: `concept:${concept.label}`,
      status: found ? 'pass' : concept.missing,
      explanation: found
        ? 'Texto contém ao menos um dos termos conceituais previstos; revisão semântica permanece pendente.'
        : 'Conceito esperado não foi detectado pelos termos previstos.',
    });
  }
  // Deterministic checks for broad false negatives contradicted by the
  // canonical professional and project catalog; lexical match is intentionally strict.
  const knownContradictions = [
    { id: 'professional-mysql', pattern: /mysql profissional nao foi verificado/ },
    {
      id: 'java-corporate',
      pattern: /java em ambiente corporativo nao est(?:a|ao) verificados?/,
    },
    {
      id: 'documented-ci',
      pattern: /nao ha documentacao de apis rest com swagger\/openapi nem de ci\/cd/,
    },
  ];
  const normalizedAnswer = normalize(response.answer);
  for (const contradiction of knownContradictions) {
    add(
      `consistency:${contradiction.id}`,
      !contradiction.pattern.test(normalizedAnswer),
      'Nenhuma contradição conhecida detectada.',
      'Resposta contradiz evidência profissional ou técnica documentada.',
    );
  }
  for (const term of expectation.forbiddenTerms) {
    add(
      `forbidden:${term}`,
      !containsTerm(response.answer, term),
      'Marcador proibido ausente.',
      'Texto contém marcador proibido.',
    );
  }
  return {
    status: aggregateStatus(checks),
    checks,
    answer: redactText(
      response.answer,
      response.conversationToken ? [response.conversationToken] : [],
    ),
    sourceIds,
    provider: response.meta.provider,
    simulated: response.meta.simulated,
    promptVersion: response.meta.promptVersion,
  };
}
