/**
 * Gate 9: discriminate Bolt handshake vs query syntax vs row decoding on
 * two disposable GitHub-hosted graph engines; NEVER MiniMac/DEV/MAIN.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';

const READ_QUERIES = [
  {
    name: 'unlabeled_one_hop',
    cypher: 'MATCH (a {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
    params: {},
  },
  {
    name: 'labeled_one_hop',
    cypher: 'MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
    params: {},
  },
  {
    name: 'label_lookup',
    cypher: 'MATCH (b:Gate9Claim) RETURN b.id AS id',
    params: {},
  },
  {
    name: 'parameterized_one_hop',
    cypher: 'MATCH (a {id: $id})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
    params: { id: 800100 },
  },
];
function guard(ok, code) {
  if (!ok) throw new Error(code);
}
function privateText(key) {
  const folder = resolve(process.env.RUNNER_TEMP || '/nonexistent');
  const file = resolve(process.env[key] || '/nonexistent');
  guard(file.startsWith(folder + '/'), 'GATE9_BOLT_SECRET_PATH');
  return readFileSync(file, 'utf8').trim();
}
const numberValue = v => neo4j.isInt(v) ? v.toNumber() : v;
function safeCode(error) {
  return typeof error?.code === 'string'
    ? error.code.slice(0, 90)
    : (error instanceof RangeError ? 'RANGE_ERROR' : 'UNCLASSIFIED');
}
async function probe(uri, database, password) {
  const driver = neo4j.driver(
    uri, neo4j.auth.basic('neo4j', password),
    { connectionTimeout: 6000, maxTransactionRetryTime: 0, maxConnectionPoolSize: 1 },
  );
  try {
    try {
      await driver.verifyConnectivity();
    } catch (error) {
      return { connectivity: 'failed', code: safeCode(error), cases: [] };
    }
    const cases = [];
    for (const { name, cypher, params } of READ_QUERIES) {
      const session = driver.session({
        database, defaultAccessMode: neo4j.session.READ,
      });
      try {
        const result = await session.run(cypher, params);
        const returned = result.records.map(rec => numberValue(rec.get('id')));
        cases.push({
          name,
          status: returned.length === 1 && returned[0] === 800101
            ? 'value_match' : 'value_mismatch',
          rows: returned.length,
        });
      } catch (error) {
        cases.push({ name, status: 'query_or_decode_error', code: safeCode(error) });
      } finally {
        await session.close().catch(() => undefined);
      }
    }
    return { connectivity: 'ok', cases };
  } finally {
    await driver.close().catch(() => undefined);
  }
}
async function main() {
  guard(process.argv.length === 2, 'GATE9_BOLT_ARGUMENTS');
  guard(
    process.env.GATE9_ISOLATION_MODE === 'github_hosted_ephemeral'
    && process.env.GITHUB_REF === 'refs/heads/experiment/hydradb'
    && process.env.GITHUB_REPOSITORY === 'SladeSouzaSantos/phasscode-platform'
    && /^[0-9]+$/.test(process.env.GITHUB_RUN_ID || ''),
    'GATE9_BOLT_ISOLATION_REQUIRED',
  );
  const token = privateText('GATE9_HYDRA_TOKEN_FILE');
  const neoAuth = privateText('GATE9_NEO_AUTH_FILE');
  guard(token.length >= 32 && /^neo4j\/.{28,}$/.test(neoAuth),
    'GATE9_BOLT_AUTH_INVALID');

  const neo = await probe('bolt://127.0.0.1:17688', 'neo4j', neoAuth.slice(6));
  guard(neo.connectivity === 'ok' && neo.cases.every(c => c.status === 'value_match'),
    'GATE9_BOLT_NEO4J_REFERENCE_FAILED');

  const hydra = await probe('bolt://127.0.0.1:17687', 'lab', token);
  const verified = hydra.connectivity === 'ok'
    && hydra.cases.length === READ_QUERIES.length
    && hydra.cases.every(c => c.status === 'value_match');
  console.log('GATE9_BOLT_RUNTIME_JSON', JSON.stringify({
    mode: 'disposable_pair_only',
    testCount: READ_QUERIES.length,
    neo4j: neo,
    hydradb: hydra,
    result: verified
      ? 'four_synthetic_bolt_reads_equal'
      : 'bolt_behavior_requires_investigation',
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
