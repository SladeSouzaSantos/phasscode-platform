import { evaluateStoredSemanticLexicalBaseline } from '../evaluation/semantic-hybrid-lexical-baseline.js';

/**
 * F3.7/#42 read-only retrieval baseline. This is NOT an extractor or
 * a model comparison. Emits only fixture IDs, counters and metrics.
 */
evaluateStoredSemanticLexicalBaseline()
  .then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  })
  .catch(() => {
    console.error('SEMANTIC_LEXICAL_BASELINE_FAILED');
    process.exitCode = 1;
  });
