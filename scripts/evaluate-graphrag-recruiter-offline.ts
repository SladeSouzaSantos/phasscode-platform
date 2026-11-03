import { evaluateStoredOfflineRecruiterMatrix } from '../evaluation/graphrag-recruiter-offline.js';

/**
 * Deterministic local/CI evaluation. No LLM, network, Neo4j or production
 * database access. Emits only scenario IDs, reasons and aggregate counts.
 * It does NOT compare live baseline answers or validate multi-turn memory.
 */
evaluateStoredOfflineRecruiterMatrix()
  .then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  })
  .catch(() => {
    // Avoid including source text or sensitive upstream failures in CI logs.
    console.error('GRAPH_RECRUITER_OFFLINE_EVALUATION_FAILED');
    process.exitCode = 1;
  });
