import { auditStoredSemanticHybridCoverage } from '../evaluation/semantic-hybrid-coverage-report.js';

/**
 * F3.7 offline coverage diagnostic. No model, network, Neo4j, Redis or
 * production state; outputs only public fixture IDs, counts and short hashes.
 * Do not interpret the draft annotations as validated ground truth.
 */
auditStoredSemanticHybridCoverage()
  .then((report) => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  })
  .catch(() => {
    console.error('SEMANTIC_HYBRID_COVERAGE_AUDIT_FAILED');
    process.exitCode = 1;
  });
