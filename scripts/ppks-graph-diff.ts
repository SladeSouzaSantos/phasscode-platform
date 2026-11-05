import { readFile } from 'node:fs/promises';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { diffGraphSnapshots } from '../apps/orbe-node/src/application/graph-snapshot-diff.js';

/** Offline-only: takes a previously approved exported graph snapshot as baseline. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== '--dry-run' ||
    args[1] !== '--baseline' ||
    !args[2] ||
    args[2].startsWith('-')
  ) {
    throw new Error('PPKS_SYNC_DRY_RUN_USAGE');
  }
  const baseline = JSON.parse(await readFile(args[2], 'utf8'));
  const candidate = await projectPpksEvidenceGraph();
  const preview = diffGraphSnapshots(baseline, candidate);
  console.log(JSON.stringify({ mode: 'dry-run', ...preview }, null, 2));
}

main().catch(() => {
  // Paths, unexpected content and local filesystem errors are not logged.
  console.error('PPKS_SYNC_DRY_RUN_FAILED');
  process.exitCode = 1;
});
