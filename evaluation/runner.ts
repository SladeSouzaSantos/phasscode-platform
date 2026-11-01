import { createHash } from 'node:crypto';
import {
  chatResponseSchema,
  errorResponseSchema,
  type Source,
} from '../packages/contracts/src/index.js';
import { aggregateStatus, evaluateTurn, redactText } from './evaluator.js';
import { publicErrorCodeSchema } from './schema.js';
import type { CaseReport, EvaluationMatrix, EvaluationReport, TurnReport } from './schema.js';

export const MAX_CALLS = 30;
export const DEFAULT_MAX_CALLS = 24;
export const DEFAULT_TIMEOUT_MS = 70_000;
const MAX_ERROR_BYTES = 8192;
const publicErrorSchema = errorResponseSchema.extend({
  error: errorResponseSchema.shape.error.extend({ code: publicErrorCodeSchema }),
});

// Extrai exclusivamente um código público conhecido. Mensagem, correlationId e
// quaisquer outros detalhes do erro não entram no relatório nem nos logs.
async function readPublicErrorCode(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  try {
    const declaredLength = Number(response.headers.get('content-length'));
    if (declaredLength > MAX_ERROR_BYTES) return undefined;
    const buffer = new Uint8Array(MAX_ERROR_BYTES);
    let used = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (used + value.byteLength > MAX_ERROR_BYTES) return undefined;
      buffer.set(value, used);
      used += value.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used));
    const parsed = publicErrorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.error.code : undefined;
  } catch {
    return undefined;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function apiOrigin(input = 'http://127.0.0.1:3000', allowRemote = false): string {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (!local && (!allowRemote || url.protocol !== 'https:'))
  ) {
    throw new Error('URL de avaliação inválida; use origem local ou HTTPS com --allow-remote.');
  }
  return url.origin;
}

export interface RunnerOptions {
  apiOrigin: string;
  maxCalls: number;
  timeoutMs: number;
  onProgress?: (message: string) => void;
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function runEvaluation(
  matrix: EvaluationMatrix,
  catalog: readonly Source[],
  options: RunnerOptions,
  transport: typeof fetch = fetch,
): Promise<EvaluationReport> {
  if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > MAX_CALLS) {
    throw new Error(`Limite de chamadas deve estar entre 1 e ${MAX_CALLS}.`);
  }
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 100 ||
    options.timeoutMs > 90_000
  ) {
    throw new Error('Timeout deve estar entre 100 e 90000 ms.');
  }
  const startedAt = new Date().toISOString();
  const reports: CaseReport[] = [];
  let calls = 0;
  let stoppedEarly = false;
  for (const scenario of matrix.cases) {
    const turns: TurnReport[] = [];
    let conversationId: string | undefined;
    let conversationToken: string | undefined;
    for (const [index, turn] of scenario.turns.entries()) {
      if (stoppedEarly || calls >= options.maxCalls) {
        stoppedEarly = true;
        break;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (conversationToken) headers['X-Conversation-Token'] = conversationToken;
      const started = performance.now();
      calls += 1;
      let httpStatus: number | null = null;
      try {
        const response = await transport(`${options.apiOrigin}/api/v1/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: turn.message,
            ...(conversationId ? { conversationId } : {}),
          }),
          signal: AbortSignal.timeout(options.timeoutMs),
          redirect: 'error',
        });
        httpStatus = response.status;
        if (!response.ok) {
          const errorCode = await readPublicErrorCode(response);
          // Provider cooldowns and control-plane outages are operational
          // blockers, not evidence failures. Stop instead of burning more quota.
          const providerLimited =
            httpStatus === 503 && errorCode === 'LLM_PROVIDERS_LIMITED';
          const controlUnavailable =
            httpStatus === 503 &&
            (errorCode === 'LLM_BUDGET_UNAVAILABLE' ||
              errorCode === 'RATE_LIMIT_UNAVAILABLE');
          const limited = httpStatus === 429 || providerLimited || controlUnavailable;
          turns.push({
            message: turn.message,
            httpStatus,
            latencyMs: Math.round(performance.now() - started),
            status: limited ? 'review' : 'fail',
            sourceIds: [],
            ...(errorCode ? { errorCode } : {}),
            checks: [
              {
                id: 'http',
                status: limited ? 'review' : 'fail',
                explanation: limited
                  ? httpStatus === 429
                    ? 'HTTP 429: execução interrompida, sem retry. Corpo do erro omitido.'
                    : 'HTTP 503: indisponibilidade temporária de IA ou controle de cotas; execução interrompida sem retry. Corpo do erro omitido.'
                  : `HTTP ${httpStatus}: chamada não concluída. Corpo do erro omitido.`,
              },
            ],
          });
          if (limited) stoppedEarly = true;
          break;
        }
        const raw: unknown = await response.json();
        const assessment = evaluateTurn(raw, turn.expect, catalog, {
          live: true,
          isNew: index === 0,
          ...(conversationId ? { expectedConversationId: conversationId } : {}),
        });
        const parsed = chatResponseSchema.safeParse(raw);
        if (index === 0 && parsed.success) {
          conversationId = parsed.data.conversationId;
          conversationToken = parsed.data.conversationToken;
        }
        turns.push({
          ...assessment,
          ...(assessment.answer !== undefined
            ? {
                answer: redactText(assessment.answer, conversationToken ? [conversationToken] : []),
              }
            : {}),
          message: turn.message,
          httpStatus,
          latencyMs: Math.round(performance.now() - started),
        });
        if (!parsed.success || !conversationToken) break;
      } catch {
        turns.push({
          message: turn.message,
          httpStatus,
          latencyMs: Math.round(performance.now() - started),
          status: 'fail',
          sourceIds: [],
          checks: [
            {
              id: 'transport',
              status: 'fail',
              explanation:
                'Falha de transporte, timeout ou JSON inválido; detalhes internos omitidos.',
            },
          ],
        });
        break;
      }
    }
    const incomplete = turns.length < scenario.turns.length;
    const status = aggregateStatus([
      ...turns,
      ...(incomplete ? [{ status: 'review' as const }] : []),
    ]);
    reports.push({
      id: scenario.id,
      category: scenario.category,
      title: scenario.title,
      status,
      turns,
      humanReview: { status: 'pending', criteria: scenario.humanReview },
    });
    options.onProgress?.(
      `${scenario.id}: ${status}; ${turns.length}/${scenario.turns.length} turnos.`,
    );
  }
  return {
    reportVersion: 'orbe-evaluation-v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    configuration: {
      apiOrigin: options.apiOrigin,
      mode: 'live',
      matrixVersion: matrix.version,
      matrixSha256: digest(matrix),
      catalogSha256: digest(catalog),
      timeoutMs: options.timeoutMs,
      maxCalls: options.maxCalls,
      selectedCaseIds: matrix.cases.map((scenario) => scenario.id),
    },
    summary: {
      pass: reports.filter(({ status }) => status === 'pass').length,
      fail: reports.filter(({ status }) => status === 'fail').length,
      review: reports.filter(({ status }) => status === 'review').length,
      calls,
      stoppedEarly,
    },
    limitations: [
      'Pass significa aprovação dos checks determinísticos; revisão humana de todas as respostas permanece pendente.',
      'Correspondência de termos e fontes não comprova fidelidade semântica completa.',
      'simulated=false não comprova uso de ferramentas; esta matriz avalia o contrato HTTP público.',
      'Execução limitada e sequencial; não mede estabilidade estatística, carga ou segurança exaustiva.',
      'Hashes identificam a representação JSON validada da matriz selecionada e do catálogo.',
    ],
    cases: reports,
  };
}

function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

export function renderMarkdown(report: EvaluationReport): string {
  const lines = [
    '# Avaliação HTTP do Orbe',
    '',
    `Execução: ${report.startedAt} — ${report.finishedAt}.`,
    '',
    `API: ${report.configuration.apiOrigin}. Matriz: ${report.configuration.matrixVersion}.`,
    '',
    `Chamadas: ${report.summary.calls}; pass: ${report.summary.pass}; fail: ${report.summary.fail}; review: ${report.summary.review}; interrompida: ${report.summary.stoppedEarly}.`,
    '',
    ...report.limitations.map((item) => `- ${item}`),
    '',
    `SHA-256 matriz: ${report.configuration.matrixSha256}`,
    '',
    `SHA-256 catálogo: ${report.configuration.catalogSha256}`,
  ];
  for (const scenario of report.cases) {
    lines.push(
      '',
      `## ${scenario.id} — ${scenario.status}`,
      '',
      `${scenario.title} (${scenario.category}).`,
    );
    for (const [index, turn] of scenario.turns.entries()) {
      lines.push(
        '',
        `### Turno ${index + 1}`,
        '',
        fenced(turn.message),
        '',
        `HTTP ${turn.httpStatus ?? 'indisponível'}; ${turn.latencyMs} ms; ${turn.status}.`,
        ...(turn.errorCode ? [`Código público: ${turn.errorCode}.`] : []),
        '',
        ...(turn.answer !== undefined ? [fenced(turn.answer), ''] : []),
        `Fontes: ${turn.sourceIds.join(', ') || 'nenhuma'}.`,
        '',
        ...turn.checks.map((check) => `- ${check.status}: ${check.id} — ${check.explanation}`),
      );
    }
    lines.push(
      '',
      'Revisão humana: pending.',
      '',
      ...scenario.humanReview.criteria.map((item) => `- ${item}`),
    );
  }
  return `${lines.join('\n')}\n`;
}
