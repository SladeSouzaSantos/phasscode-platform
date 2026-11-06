/**
 * Gate 9 / F4.1 static only: no Bolt, HTTP, LLM, Docker or graph writes.
 */
import { readFile } from 'node:fs/promises';
import { createGate9CypherInventory } from '../evaluation/hydradb-gate9-cypher-inventory.js';

async function main() {
  if (process.argv.length !== 2) throw new Error('GATE9_ARGS_NOT_ALLOWED');
  const [querySource, driverSource] = await Promise.all([
    readFile('apps/orbe-node/src/adapters/neo4j-graph-queries.ts', 'utf8'),
    readFile('apps/orbe-node/src/adapters/neo4j-driver-store.ts', 'utf8'),
  ]);
  const result = createGate9CypherInventory({ querySource, driverSource });
  console.log('GATE9_STATIC_CYPHER_INVENTORY_JSON', JSON.stringify(result));
  console.log('GATE9_CYPHER_SOURCE_SURFACE_PASS');
  console.log('GATE9_RUNTIME_COMPATIBILITY_REMAINS_UNTESTED');
}
main().catch((error: unknown) => {
  const message = error instanceof Error && error.message.startsWith('GATE9_')
    ? error.message : 'INTERNAL_ERROR';
  console.error('GATE9_STATIC_CYPHER_INVENTORY_FAILED', message);
  process.exitCode = 1;
});
