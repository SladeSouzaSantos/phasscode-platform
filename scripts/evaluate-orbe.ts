import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  apiOrigin,
  DEFAULT_MAX_CALLS,
  DEFAULT_TIMEOUT_MS,
  MAX_CALLS,
  renderMarkdown,
  runEvaluation,
} from '../evaluation/runner.js';
import { catalogSchema, categorySchema, matrixSchema } from '../evaluation/schema.js';
import {
  MAX_MODEL_CALLS_PER_TURN,
  MAX_FALLBACK_ATTEMPTS_PER_TURN,
  MAX_TOOL_CALLS_PER_ROUND,
  MAX_TOOL_ROUNDS_PER_TURN,
} from '../apps/orbe-node/src/domain/llm-limits.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const permitted = ['--live', '--allow-remote', '--help'];
  const valueOptions = [
    '--case=',
    '--category=',
    '--matrix=',
    '--output=',
    '--max-calls=',
    '--timeout-ms=',
  ];
  if (
    args.some((arg) => !permitted.includes(arg) && !valueOptions.some((key) => arg.startsWith(key)))
  ) {
    throw new Error('Opção inválida; use --help.');
  }
  if (args.includes('--help')) {
    console.info(
      'Uso: npm run eval:orbe -- --live [--matrix=evaluation/vacancies-ppks-v12.json] [--case=id] [--category=nome] [--max-calls=24] [--timeout-ms=70000] [--output=evaluation/reports] [--allow-remote]\nSem --live, apenas lista o plano; nenhuma chamada é feita.',
    );
    return;
  }
  const value = (prefix: string) => {
    const values = args.filter((arg) => arg.startsWith(prefix));
    if (values.length > 1) throw new Error('Opções de valor não podem ser repetidas.');
    const result = values[0]?.slice(prefix.length);
    if (result !== undefined && result.trim().length === 0) {
      throw new Error('Opções de valor não podem estar vazias.');
    }
    return result;
  };
  const selectedMatrix = value('--matrix=') ?? 'evaluation/cases.json';
  if (!['evaluation/cases.json', 'evaluation/recruiter-cases.json', 'evaluation/vacancies-ppks-v12.json'].includes(selectedMatrix))
    throw new Error('Matriz não permitida.');
  const matrix = matrixSchema.parse(JSON.parse(await readFile(selectedMatrix, 'utf8')));
  if (new Set(matrix.cases.map(({ id }) => id)).size !== matrix.cases.length) {
    throw new Error('Matriz possui IDs duplicados.');
  }
  const caseId = value('--case=');
  const categoryValue = value('--category=');
  const category = categoryValue === undefined ? undefined : categorySchema.parse(categoryValue);
  matrix.cases = matrix.cases.filter(
    (scenario) =>
      (!caseId || scenario.id === caseId) && (!category || scenario.category === category),
  );
  if (matrix.cases.length === 0) throw new Error('Nenhum cenário corresponde ao filtro.');
  const plannedCalls = matrix.cases.reduce((total, scenario) => total + scenario.turns.length, 0);
  const maxCalls = Number(value('--max-calls=') ?? DEFAULT_MAX_CALLS);
  const timeoutMs = Number(value('--timeout-ms=') ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > MAX_CALLS) {
    throw new Error(`Limite de chamadas deve estar entre 1 e ${MAX_CALLS}.`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 90_000) {
    throw new Error('Timeout deve estar entre 100 e 90000 ms.');
  }
  const origin = apiOrigin(process.env['EVAL_API_URL'], args.includes('--allow-remote'));
  console.info(
    `${matrix.cases.length} cenários; ${plannedCalls} mensagens HTTP previstas; limite HTTP ${maxCalls}.`,
  );
  const boundedMessages = Math.min(plannedCalls, maxCalls);
  console.info(
    `Teto conservador com fallback: ${boundedMessages * MAX_FALLBACK_ATTEMPTS_PER_TURN} tentativas aos provedores. Sem fallback: até ${boundedMessages * MAX_MODEL_CALLS_PER_TURN} chamadas.`,
  );
  console.info(
    `Por mensagem: até ${MAX_MODEL_CALLS_PER_TURN} rodadas do modelo, ${MAX_FALLBACK_ATTEMPTS_PER_TURN} tentativas com fallback e ${MAX_TOOL_ROUNDS_PER_TURN * MAX_TOOL_CALLS_PER_ROUND} buscas locais; políticas determinísticas e mock não consomem o provedor. Tokens consumidos variam.`,
  );
  if (!args.includes('--live')) {
    console.info(matrix.cases.map(({ id, category }) => `${id} (${category})`).join('\n'));
    console.info('Plano apenas. Para chamar a API configurada, execute com --live.');
    return;
  }
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile('knowledge/portfolio.json', 'utf8')),
  );
  if (new Set(catalog.map(({ id }) => id)).size !== catalog.length) {
    throw new Error('Catálogo possui IDs duplicados.');
  }
  for (const scenario of matrix.cases) {
    for (const turn of scenario.turns) {
      if (turn.expect.requiredSourceIds.some((id) => !catalog.some((source) => source.id === id))) {
        throw new Error(
          'Matriz exige uma fonte ausente no catálogo; atualize os insumos antes do live.',
        );
      }
    }
  }
  const output = resolve(value('--output=') ?? 'evaluation/reports');
  await mkdir(output, { recursive: true });
  const report = await runEvaluation(matrix, catalog, {
    apiOrigin: origin,
    maxCalls,
    timeoutMs,
    onProgress: (message) => console.info(message),
  });
  const name = `orbe-${report.startedAt.replace(/[:.]/g, '-')}`;
  await writeFile(resolve(output, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  });
  await writeFile(resolve(output, `${name}.md`), renderMarkdown(report), { flag: 'wx' });
  console.info(`Relatórios salvos em ${output}. Revisão semântica humana permanece pendente.`);
  if (report.summary.fail > 0) process.exitCode = 1;
  else if (report.summary.review > 0 || report.summary.stoppedEarly) process.exitCode = 2;
}

// Nunca registra erro bruto, schema completo, valor de ambiente ou corpo de upstream.
main().catch(() => {
  console.error(
    'Avaliação não concluída. Verifique opções, matriz, catálogo e acesso de escrita; detalhes internos omitidos.',
  );
  process.exitCode = 1;
});
