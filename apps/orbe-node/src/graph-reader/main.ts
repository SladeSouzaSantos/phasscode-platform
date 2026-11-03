import { readFile } from 'node:fs/promises';
import { createNeo4jConnection } from '../adapters/neo4j-driver-store.js';
import { Neo4jEvidenceRepository } from '../adapters/neo4j-graph-queries.js';
import { buildInternalGraphReader } from './app.js';

/** Deliberately distinct from the public Orbe API bootstrap. */
async function main(): Promise<void> {
  if (process.env.GRAPHRAG_READER_ENABLED !== 'true') {
    throw new Error('GRAPH_READER_NOT_ENABLED');
  }
  const authPath = process.env.NEO4J_AUTH_FILE;
  const tokenPath = process.env.GRAPH_READER_TOKEN_FILE;
  if (authPath !== '/run/secrets/neo4j_auth' || tokenPath !== '/run/secrets/graph_reader_token') {
    throw new Error('GRAPH_READER_SECRET_FILES_REQUIRED');
  }
  const [auth, token] = await Promise.all([
    readFile(authPath, 'utf8'),
    readFile(tokenPath, 'utf8'),
  ]);
  const credential = auth.trim();
  if (!credential.startsWith('neo4j/') || credential.slice(6).length < 12) {
    throw new Error('GRAPH_READER_INVALID_NEO4J_CREDENTIAL');
  }
  const port = Number(process.env.GRAPH_READER_PORT ?? '8765');
  if (!Number.isSafeInteger(port) || port !== 8765) {
    throw new Error('GRAPH_READER_INVALID_PORT');
  }
  const store = createNeo4jConnection({
    uri: process.env.NEO4J_URI ?? 'bolt://neo4j:7687',
    username: 'neo4j',
    password: credential.slice(6),
  });
  try {
    await store.verifyConnectivity();
    const app = buildInternalGraphReader({
      token: token.trim(),
      evidence: new Neo4jEvidenceRepository(store),
    });
    app.addHook('onClose', () => store.close());
    await app.listen({ host: '0.0.0.0', port });
  } catch (error) {
    await store.close();
    throw error;
  }
}

await main().catch(() => {
  // No runtime logs may include tokens, passwords, raw claims or private sources.
  console.error('Internal GraphRAG reader failed to start.');
  process.exitCode = 1;
});
