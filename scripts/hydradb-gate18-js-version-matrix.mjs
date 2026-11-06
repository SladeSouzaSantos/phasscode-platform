/**
 * Gate18 (GitHub hosted disposable only): compare EXPLICITLY pinned
 * Neo4j JavaScript driver versions against exact self-hosted v0.3.0
 * documented Bolt parameterized MATCH. Same query, fixture and connection
 * options; compare against a real Neo4j control with each driver version.
 *
 * Success of the diagnostic script is NOT an implicit Bolt parity pass.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GRAPH = 'default';
const A = 1800100;
const B = 1800101;
const QUERY = 'MATCH (a {id: $src})-[:FOLLOWS]->(b) RETURN b.id AS id';
const VARIANTS = [
  {id:'documented_bolt_default',uri:'bolt://127.0.0.1:17687',database:'default',preflight:false},
  {id:'bolt_default_with_preflight',uri:'bolt://127.0.0.1:17687',database:'default',preflight:true},
  {id:'bolt_unspecified_no_preflight',uri:'bolt://127.0.0.1:17687',database:null,preflight:false},
  {id:'routed_default_no_preflight',uri:'neo4j://127.0.0.1:17687',database:'default',preflight:false},
];
const ALLOWED = new Set(['5.28.3','6.0.1','6.1.0','6.2.0']);

function check(ok,code){if(!ok)throw new Error(code);}
function root(){
  check(process.env.GATE18_ISOLATION_MODE==='github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY==='SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF==='refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID||'') &&
    ALLOWED.has(process.env.GATE18_DRIVER_VERSION),
    'GATE18_GITHUB_RESTRICTION');
  const path=resolve(process.env.RUNNER_TEMP||'/invalid-runner');
  check(path.startsWith('/')&&path!=='/'&&
    process.env.GATE18_DRIVER_ROOT?.startsWith(path+'/'),
    'GATE18_EPHEMERAL_ROOT');
  const driverRoot=resolve(process.env.GATE18_DRIVER_ROOT);
  check(driverRoot===path+'/gate18-'+process.env.GITHUB_RUN_ID+'-'+process.env.GATE18_DRIVER_VERSION,
    'GATE18_ROOT_NOT_OWNED_BY_RUN');
  return {driverRoot,driverVersion:process.env.GATE18_DRIVER_VERSION,runner:path};
}
function file(name,runner){
  const p=resolve(process.env[name]||'/invalid');
  check(p.startsWith(runner+'/'),'GATE18_FILE_OUTSIDE_EPHEMERAL_RUNNER');
  return p;
}
function code(error) {
  return typeof error?.code==='string'
    ? error.code.slice(0,90).replace(/[^A-Za-z0-9_.-]/g,'_')
    : error?.name==='RangeError'?'RANGE_ERROR'
      : String(error?.name||'UNCLASSIFIED').slice(0,70);
}
function normalize(cell,neo4j){
  if(neo4j.isInt(cell))return cell.toNumber();
  if(cell&&typeof cell==='object'&&'value' in cell)return normalize(cell.value,neo4j);
  return cell;
}
async function ready(){
  for(let i=0;i<85;i++){
    try{
      const res=await fetch('http://127.0.0.1:19090/readyz',{signal:AbortSignal.timeout(1500)});
      if(res.ok)return;
    }catch {/* startup */}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw Error('GATE18_HYDRA_NOT_READY');
}
async function hydraHttp(token,cypher,params={}){
  const r=await fetch('http://127.0.0.1:18443/v1/graphs/default/query',{
    method:'POST',
    headers:{
      authorization:'Bearer '+token,
      'content-type':'application/json',
      'x-graph-namespace':'default',
    },
    body:JSON.stringify({cell_id:'cell-0',query:cypher,parameters:params,timeout_ms:10000}),
    signal:AbortSignal.timeout(13000),
  });
  check(r.ok,'GATE18_HYDRA_HTTP_'+r.status);
  const txt=await r.text();
  check(txt.length<100000,'GATE18_HTTP_LIMIT');
  const val=JSON.parse(txt);
  check(!val.error&&!val.errors,'GATE18_HTTP_ENGINE_ERROR');
  return val;
}
async function seedNeo4j(neo4j,auth){
  // Seed with the *same* client version under evaluation. This avoids
  // assuming an HTTP transactional endpoint is available on the pinned
  // Neo4j image, and also verifies write capability for the reference.
  const driver=neo4j.driver('bolt://127.0.0.1:17688',
    neo4j.auth.basic('neo4j',auth.slice('neo4j/'.length)),{
      connectionTimeout:7000,maxTransactionRetryTime:0,maxConnectionPoolSize:1,
    });
  let stored=false;
  try{
    for(let attempt=0;attempt<30;attempt++){
      const session=driver.session({database:'neo4j'});
      try{
        await session.run('MERGE (a:Gate18A {id: '+A+'})-[:FOLLOWS]->(b:Gate18B {id: '+B+'})');
        stored=true;
        break;
      }catch{
        // Neo4j may start before the database becomes available; retry
        // only the fixed synthetic seed, never use arbitrary user input.
        await new Promise(done=>setTimeout(done,1000));
      }finally{
        await session.close().catch(()=>undefined);
      }
    }
  }finally{
    await driver.close().catch(()=>undefined);
  }
  check(stored,'GATE18_NEO4J_REFERENCE_SEED_FAILED');
}
async function runTrial(neo4j,config,password){
  const driver=neo4j.driver(config.uri,neo4j.auth.basic('neo4j',password),{
    connectionTimeout:6000,maxTransactionRetryTime:0,maxConnectionPoolSize:1,
  });
  const result={status:'not_run'};
  try{
    if(config.preflight){
      try{await driver.verifyConnectivity();result.preflight='ok';}
      catch(e){result.preflight='error';result.preflightCode=code(e);}
    }else{
      result.preflight='not_called';
    }
    const opts={};
    if(config.database!==null)opts.database=config.database;
    const session=driver.session(opts);
    try{
      const rows=await session.run(QUERY,{src:A});
      const values=rows.records.map(row=>normalize(row.get('id'),neo4j));
      result.status=values.length===1&&values[0]===B?'value_match':'value_mismatch';
      result.rowCount=values.length;
    }catch(e){
      result.status='query_failed';result.code=code(e);
    }finally{await session.close().catch(()=>undefined);}
  }catch(e){result.status='client_failed';result.code=code(e);}
  finally{await driver.close().catch(()=>undefined);}
  return result;
}
async function main(){
  check(process.argv.length===2,'GATE18_NO_CLI_ARGS');
  const {runner,driverRoot,driverVersion}=root();
  const neo4j=createRequire(driverRoot+'/package.json')('neo4j-driver');
  const version=createRequire(driverRoot+'/package.json')('neo4j-driver/package.json').version;
  check(version===driverVersion,'GATE18_DRIVER_VERSION_MISMATCH');
  const token=readFileSync(file('GATE18_HYDRA_TOKEN_FILE',runner),'utf8').trim();
  const auth=readFileSync(file('GATE18_NEO_AUTH_FILE',runner),'utf8').trim();
  check(token.length>=32&&auth.startsWith('neo4j/')&&auth.length>32,'GATE18_AUTH_INVALID');
  await ready();
  await hydraHttp(token,'MERGE (a {id: '+A+'})-[:FOLLOWS]->(b {id: '+B+'})');
  const baseline=await hydraHttp(token,QUERY,{src:A});
  check(Array.isArray(baseline.rows)&&baseline.rows.length===1&&
    normalize(baseline.rows[0]?.[0],neo4j)===B,
    'GATE18_HYDRA_HTTP_CONTROL_FAILED');
  await seedNeo4j(neo4j,auth);
  const neo4jControl=await runTrial(neo4j,{
    uri:'bolt://127.0.0.1:17688',database:'neo4j',preflight:false,
  },auth.slice('neo4j/'.length));
  check(neo4jControl.status==='value_match',
    'GATE18_SAME_DRIVER_NEO4J_CONTROL_FAILED');
  const variants=[];
  for(const v of VARIANTS){
    const trials=[];
    for(let i=0;i<3;i++)trials.push(await runTrial(neo4j,v,token));
    variants.push({
      variant:v.id,
      scheme:v.uri.split(':')[0],
      database:v.database,
      preflight:v.preflight,
      trials,
      matchingTrials:trials.filter(t=>t.status==='value_match').length,
    });
  }
  const report={
    schema:'hydradb-gate18-js-driver-version-matrix-v1',
    scope:'github_hosted_ephemeral_only',
    package:'neo4j-driver',
    driverVersion:version,
    nodeVersion:process.version,
    engine:'HydraDB open-source 0.3.0 (immutable OCI digest)',
    graphId:GRAPH,
    documentedStatement:'parameterized one-hop MATCH',
    verifiedHydraHttpValue:true,
    sameDriverNeo4jBoltControl:neo4jControl,
    runs:variants,
    noLiveOrbeAccess:true,noCloudV2Calls:true,
    rootCause:'undetermined',
  };
  const reportFile=file('GATE18_REPORT_FILE',runner);
  writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{
    flag:'wx',encoding:'utf8',mode:0o600,
  });
  console.log('GATE18_JS_VERSION_MATRIX_JSON',JSON.stringify(report));
  console.log('GATE18_DIAGNOSTIC_COMPLETE');
}
main().catch(e=>{
  console.error(
    e instanceof Error&&e.message.startsWith('GATE18_')
      ?e.message:'GATE18_INTERNAL_ERROR',
  );
  process.exitCode=1;
});
