/**
 * Gate 9: Neo4j JavaScript driver check against disposable GH runner ports.
 * Never connect to the operational Orbe Neo4j or MiniMac/Tailscale.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';

function guard(ok, code) {
  if (!ok) throw new Error(code);
}
function privateText(key) {
  const folder = resolve(process.env.RUNNER_TEMP || '/nonexistent');
  const file = resolve(process.env[key] || '/nonexistent');
  guard(file.startsWith(folder + '/'), 'GATE9_BOLT_SECRET_PATH');
  return readFileSync(file, 'utf8').trim();
}
function valueNumber(value) {
  return neo4j.isInt(value) ? value.toNumber() : value;
}
async function probe(uri, db, password) {
  const driver = neo4j.driver(
    uri, neo4j.auth.basic('neo4j', password),
    { connectionTimeout: 6000, maxTransactionRetryTime: 0, maxConnectionPoolSize: 1 },
  );
  try {
    await driver.verifyConnectivity();
    const session = driver.session({
      database: db,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      const result = await session.run(
        'MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
      );
      const rows = result.records.map(record => valueNumber(record.get('id')));
      return {
        status: rows.length === 1 && rows[0] === 800101
          ? 'read_parity_verified' : 'different_rows',
        rows: rows.length,
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    return {
      status: 'driver_error',
      code: typeof error?.code === 'string'
        ? error.code.slice(0, 90) : 'UNCLASSIFIED',
    };
  } finally {
    await driver.close().catch(() => undefined);
  }
}

async function main() {
  guard(process.argv.length === 2, 'GATE9_BOLT_ARGUMENTS');
  guard(process.env.GATE9_ISOLATION_MODE === 'github_hosted_ephemeral'
    && process.env.GITHUB_REF === 'refs/heads/experiment/hydradb'
    && process.env.GITHUB_REPOSITORY === 'SladeSouzaSantos/phasscode-platform'
    && /^[0-9]+$/.test(process.env.GITHUB_RUN_ID || ''),
  'GATE9_BOLT_ISOLATION_REQUIRED');

  const token = privateText('GATE9_HYDRA_TOKEN_FILE');
  const neoAuth = privateText('GATE9_NEO_AUTH_FILE');
  guard(token.length >= 32 && /^neo4j\/.{28,}$/.test(neoAuth),
    'GATE9_BOLT_AUTH_INVALID');
  const neo = await probe('bolt://127.0.0.1:17688', 'neo4j', neoAuth.slice(6));
  guard(neo.status === 'read_parity_verified', 'GATE9_BOLT_NEO4J_REFERENCE_FAILED');
  const hydra = await probe('bolt://127.0.0.1:17687', 'lab', token);
  console.log('GATE9_BOLT_RUNTIME_JSON', JSON.stringify({
    mode: 'disposable_pair_only',
    neo4j: neo,
    hydradb: hydra,
    result: hydra.status === 'read_parity_verified'
      ? 'single_synthetic_bolt_read_parity'
      : 'bolt_integration_not_yet_proven',
    notAnOrbeAdapterMigration: true,
  }));
  console.log('GATE9_BOLT_PROBE_COMPLETED');
}
main().catch(error => {
  console.error('GATE9_BOLT_PROBE_FAILED',
    error instanceof Error && error.message.startsWith('GATE9_')
      ? error.message : 'INTERNAL_ERROR');
  process.exitCode = 1;
});
