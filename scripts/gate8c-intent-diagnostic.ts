/**
 * Standalone, offline Gate 8C whole-question mention diagnostic.
 * Does not call HydraDB, the Orbe API, a remote LLM, or any live backend.
 * Does not mutate corpus files or promote provisional labels to gold.
 */
import { readFile } from 'node:fs/promises';
import { evaluateGate8cIntent } from '../evaluation/hydradb-gate8c-intent-diagnostic.js';

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('GATE8C_ARGS_NOT_ALLOWED');
  const [original, draft] = await Promise.all([
    readFile('knowledge/evaluations/hydradb-gate8-recruiter.json', 'utf8'),
    readFile('knowledge/evaluations/hydradb-gate8c-intent-draft.json', 'utf8'),
  ]);
  const result = evaluateGate8cIntent(original, draft);
  console.log('GATE8C_DIAGNOSTIC_JSON', JSON.stringify(result));
  console.log('GATE8C_DRAFT_STRUCTURAL_PARITY_PASS');
  console.log('GATE8C_WHOLE_QUESTION_LEXICAL_BASELINE_RECORDED');
  console.log('GATE8C_INDEPENDENT_GOLD_REVIEW_REQUIRED');
  console.log('GATE8C_INCREMENTAL_HYDRADB_SEMANTIC_GAIN_NOT_MEASURED');
}
main().catch((error: unknown) => {
  const code = error instanceof Error && error.message.startsWith('GATE8C_')
    ? error.message : 'INTERNAL_ERROR';
  console.error('GATE8C_DIAGNOSTIC_FAILED', code);
  process.exitCode = 1;
});
