/**
 * Gate 14, only disposable GH-hosted pair:
 * Cross-check identical fixed Cypher statements over HydraDB HTTP and
 * neo4j-driver JS Bolt, with the same seeded graph and database variants.
 *
 * Diagnostic is intentionally non-fatal on HydraDB incompatibilities:
 * CI success means a reliable REPORT, never a pass on all Bolt statements.
 * No logs of keys, raw engine responses, stack traces or credentials.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';

const require = createRequire(import.meta.url);
const pkg = require('neo4j-driver/package.json');
const QUERIES = [
  {
    id: 'return_literal',
    cypher: 'RETURN 1 AS id',
    params: {},
    expected: 1,
  },
  {
    id: 'labeled_node',
    cypher: 'MATCH (a:Gate9Claim {id: 800101}) RETURN a.id AS id',
    params: {},
    expected: 800101,
  },
  {
    id: 'one_hop',
    cypher: 'MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
    params: {},
    expected: 800101,
  },
  {
    id: 'parameterized_one_hop',
    cypher: 'MATCH (a:Gate9Skill {id: $id})-[:GATE9_SKILL]->(b) RETURN b.id AS id',
    params: { id: 800100 },
    expected: 800101,
  },
];
const variants = [
  { id: 'bolt_lab', uri:'bolt://127.0.0.1:17687', database:'lab' },
  { id: 'bolt_default', uri:'bolt://127.0.0.1:17687', database:'default' },
  { id: 'bolt_unspecified', uri:'bolt://127.0.0.1:17687' },
  { id: 'routed_lab', uri:'neo4j://127.0.0.1:17687', database:'lab' },
  { id: 'routed_default', uri:'neo4j://127.0.0.1:17687', database:'default' },
];

function assert(ok, name) {
  if (!ok) throw new Error(name);
}
function safeCode(error) {
  if (typeof error?.code === 'string') {
    return error.code.slice(0,90).replace(/[^a-zA-Z0-9_.-]/g,'_');
  }
  return error?.name==='RangeError' ? 'RANGE_ERROR' : 'UNCLASSIFIED';
}
function readSecret(name) {
  const temp = resolve(process.env.RUNNER_TEMP || '/absent');
  const file = resolve(process.env[name] || '/absent');
  assert(file.startsWith(temp+'/'), 'GATE14_OUTSIDE_RUNNER_FILE');
  return readFileSync(file,'utf8').trim();
}
function decode(value) {
  if (neo4j.isInt(value)) return value.toNumber();
  if (value && typeof value === 'object' && 'type' in value &&
      'value' in value) return decode(value.value);
  return value;
}
async function httpBaseline(token) {
  const results = [];
  for (const item of QUERIES) {
    const request=await fetch('http://127.0.0.1:18443/v1/graphs/lab/query',{
      method:'POST',
      headers:{
        authorization:'Bearer '+token,
        'content-type':'application/json',
        'x-graph-namespace':'lab',
      },
      body:JSON.stringify({
        cell_id:'cell-0',query:item.cypher,
        parameters:item.params,timeout_ms:10000,
      }),
      signal:AbortSignal.timeout(13000),
    });
    if (!request.ok) {
      results.push({id:item.id,status:'http_rejected',httpStatus:request.status});
      continue;
    }
    let payload;
    try {
      const body=await request.text();
      assert(body.length<100000,'GATE14_HTTP_BODY_LIMIT');
      payload=JSON.parse(body);
    } catch {
      results.push({id:item.id,status:'malformed_http_response'});
      continue;
    }
    const got = Array.isArray(payload.rows) && payload.rows.length===1 &&
      Array.isArray(payload.rows[0]) ? decode(payload.rows[0][0]) : undefined;
    results.push({
      id:item.id,
      status:got===item.expected?'value_match':'value_mismatch',
      rows:Array.isArray(payload.rows)?payload.rows.length:undefined,
    });
  }
  return results;
}
async function boltVariant(variant,password) {
  const driver=neo4j.driver(variant.uri,neo4j.auth.basic('neo4j',password),{
    connectionTimeout:6000,
    maxTransactionRetryTime:0,
    maxConnectionPoolSize:1,
  });
  let connected=false;
  const cases=[];
  try {
    try {
      await driver.verifyConnectivity();
      connected=true;
    } catch(error) {
      return {id:variant.id,connectivity:'failed',code:safeCode(error),cases:[]};
    }
    for(const item of QUERIES){
      const opts={defaultAccessMode:neo4j.session.READ};
      if(variant.database) opts.database=variant.database;
      const session=driver.session(opts);
      try {
        const result=await session.run(item.cypher,item.params);
        const values=result.records.map(record=>decode(record.get('id')));
        cases.push({
          id:item.id,
          status:values.length===1 && values[0]===item.expected
            ?'value_match':'value_mismatch',
          rows:values.length,
        });
      } catch(error) {
        cases.push({id:item.id,status:'bolt_rejected',code:safeCode(error)});
      } finally {
        await session.close().catch(()=>undefined);
      }
    }
    return {id:variant.id,connectivity:'ok',cases};
  }finally{
    await driver.close().catch(()=>undefined);
  }
}

async function main() {
  assert(process.argv.length===2 &&
    process.env.GATE9_ISOLATION_MODE==='github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY==='SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF==='refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID||''),
    'GATE14_RUNNER_ISOLATION');
  const token=readSecret('GATE9_HYDRA_TOKEN_FILE');
  const neoAuth=readSecret('GATE9_NEO_AUTH_FILE');
  assert(token.length>=32&&/^neo4j\/.{28,}$/.test(neoAuth),
    'GATE14_INVALID_EPHEMERAL_AUTH');
  const http=await httpBaseline(token);
  const bolt=[];
  for(const variant of variants){
    bolt.push(await boltVariant(variant,token));
  }
  const neoControl=await boltVariant({
    id:'neo4j_bolt_control',uri:'bolt://127.0.0.1:17688',database:'neo4j',
  },neoAuth.slice(6));
  assert(neoControl.connectivity==='ok' &&
    neoControl.cases.length===QUERIES.length &&
    neoControl.cases.every(x=>x.status==='value_match'),
    'GATE14_NEO4J_REFERENCE_FAILED');
  const report={
    schemaVersion:'hydradb-gate14-bolt-matrix-v1',
    scope:'ephemeral_gh_runner_only',
    driver:'neo4j-driver',
    driverVersion:pkg.version,
    hydradbVersion:'0.3.0',
    neo4jControl:neoControl,
    sameCypherHttp: http,
    bolt,
    diagnosisStatus:'empirical_matrix_only',
    noProductionAccess:true,
    semanticParityNotAssumed:true,
  };
  console.log('GATE14_BOLT_MATRIX_JSON',JSON.stringify(report));
  console.log('GATE14_BOLT_DIAGNOSTIC_REPORT_COMPLETE');
}
main().catch(error=>{
  console.error('GATE14_BOLT_DIAGNOSTIC_FAILED',
    error instanceof Error&&error.message.startsWith('GATE14_')
    ?error.message:'INTERNAL_ERROR');
  process.exitCode=1;
});
