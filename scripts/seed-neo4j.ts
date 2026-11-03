import { readFile } from 'node:fs/promises';
import { createNeo4jConnection } from '../apps/orbe-node/src/adapters/neo4j-driver-store.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';

/** Explicit opt-in maintenance process; not imported by the public Orbe runtime. */
async function main() {
  if (process.env.GRAPHRAG_SEED_ENABLED !== 'true') throw new Error('GRAPH_SEED_DISABLED');
  const path = process.env.NEO4J_AUTH_FILE;
  if (!path || !path.startsWith('/run/secrets/')) throw new Error('GRAPH_SECRET_FILE_REQUIRED');
  const raw = (await readFile(path, 'utf8')).trim();
  if (!raw.startsWith('neo4j/') || raw.slice(6).length < 12) {
    throw new Error('GRAPH_INVALID_AUTH_FILE');
  }
  const uri = process.env.NEO4J_URI ?? 'bolt://neo4j:7687';
  const store = createNeo4jConnection({ uri, username: 'neo4j', password: raw.slice(6) });
  try {
    await store.verifyConnectivity();
    const result = await store.seed(await projectPpksEvidenceGraph());
    const counts = await store.count();
    if (result.nodes !== counts.nodes || result.relations !== counts.relations) {
      throw new Error('GRAPH_SEED_COUNT_MISMATCH');
    }
    console.info(
      `GRAPH_SEED_OK snapshot=${result.snapshot} nodes=${counts.nodes} relations=${counts.relations}`,
    );
  } finally {
    await store.close();
  }
}

await main();
