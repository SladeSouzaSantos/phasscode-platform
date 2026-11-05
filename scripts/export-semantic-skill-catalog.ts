import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { makeSemanticSkillCatalog } from '../evaluation/semantic-skill-catalog.js';

/** Offline, read-only catalog export. Emits only skill IDs and labels. */
projectPpksEvidenceGraph()
  .then((snapshot) => {
    const catalog = makeSemanticSkillCatalog(snapshot);
    process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
  })
  .catch(() => {
    console.error('SEMANTIC_SKILL_CATALOG_EXPORT_FAILED');
    process.exitCode = 1;
  });
