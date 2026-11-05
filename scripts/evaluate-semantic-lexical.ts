import { readFile } from 'node:fs/promises';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import {
  evaluateSemanticLexicalBaseline,
  evaluateStoredSemanticLexicalBaseline,
} from '../evaluation/semantic-hybrid-lexical-baseline.js';

/**
 * Read-only baseline over one of two versioned synthetic fixture sets.
 * Never accept arbitrary paths from a visitor or API request.
 */
const challenge = process.argv[2];
const evaluation =
  challenge === undefined
    ? evaluateStoredSemanticLexicalBaseline()
    : challenge === '--paraphrase-challenge'
      ? Promise.all([
          readFile('evaluation/semantic-embedding-paraphrase-v0.json', 'utf8'),
          projectPpksEvidenceGraph(),
        ]).then(([corpus, snapshot]) => evaluateSemanticLexicalBaseline(corpus, snapshot))
      : Promise.reject(new Error('SEMANTIC_LEXICAL_UNKNOWN_FIXTURE'));

evaluation
  .then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  })
  .catch(() => {
    console.error('SEMANTIC_LEXICAL_BASELINE_FAILED');
    process.exitCode = 1;
  });
