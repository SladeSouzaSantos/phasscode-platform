/**
 * Gate 17: reproduce official self-hosted v0.3.0 JavaScript Bolt example
 * using disposable graph IDs default and lab in GitHub Actions.
 * https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md
 *
 * No Orbe, production, MiniMac, remote API, or shell.
 * Diagnostic success means results reported; query results can fail.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import neo4j from 'neo4j-driver';

const require = createRequire(import.meta.url);
const driverVersion = require('neo4j-driver/package.json').version;
const ID = 1700100;
const ID2 = 1700101;
const CYPHER = 'MATCH (a {id: $src})-[:FOLLOWS]->(b) RETURN b.id AS id';
const modes = [
  {name:'official_js_without_preflight', database:'default', uri:'bolt://127.0.0.1:17687', preflight:false},
  {name:'documented_default_with_preflight', database:'default', uri:'bolt://127.0.0.1:17687', preflight:true},
  {name:'configured_graph_explicit', database:'@graph', uri:'bolt://127.0.0.1:17687'},
  {name:'unspecified', database:null, uri:'bolt://127.0.0.1:17687'},
  {name:'routed_graph', database:'@graph', uri:'neo4j://127.0.0.1:17687'},
];
function safe(error) {
  if(typeof error?.code === 'string')
    return error.code.slice(0,100).replace(/[^a-z0-9_.-]/gi,'_');
  if(error?.name === 'RangeError')return 'RANGE_ERROR';
  return 'UNCLASSIFIED';
}
function check(condition,code){if(!condition)throw new Error(code);}
function secret(name) {
  const root=resolve(process.env.RUNNER_TEMP||'/not-runner');
  const file=resolve(process.env[name]||'/missing');
  check(file.startsWith(root+'/'), 'GATE17_SECRET_OUTSIDE_RUNNER');
  return readFileSync(file,'utf8').trim();
}
function number(value){return neo4j.isInt(value)?value.toNumber():value;}
function entries(){
  const graph=process.env.GATE17_GRAPH_ID;
  check(process.env.GITHUB_REPOSITORY==='SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF==='refs/heads/experiment/hydradb' &&
    process.env.GATE17_ISOLATION_MODE==='github_hosted_ephemeral' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID||'') &&
    (graph==='lab'||graph==='default'), 'GATE17_RUNNER_RESTRICTED');
  return {graph, token:secret('GATE17_TOKEN_FILE')};
}
async function ready(){
  for(let i=0;i<75;i++){
    try {
      const r=await fetch('http://127.0.0.1:19090/readyz',{signal:AbortSignal.timeout(1500)});
      if(r.ok)return;
    }catch{ /* startup */ }
    await new Promise(resolve=>setTimeout(resolve,1200));
  }
  throw Error('GATE17_READY_TIMEOUT');
}
async function http(token,graph,query,params={}){
  const r=await fetch('http://127.0.0.1:18443/v1/graphs/'+graph+'/query',{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json',
      'x-graph-namespace':graph},
    body:JSON.stringify({cell_id:'cell-0',query,parameters:params,timeout_ms:10000}),
    signal:AbortSignal.timeout(12000),
  });
  if(!r.ok)throw Error('GATE17_HTTP_'+r.status);
  const response=await r.text();
  check(response.length<100000,'GATE17_RESPONSE_LIMIT');
  const data=JSON.parse(response);
  check(!data.error&&!data.errors,'GATE17_ENGINE_REJECTED');
  return data;
}
function valueOf(cell) {
  if(cell && typeof cell==='object' && 'value' in cell) return cell.value;
  return cell;
}
async function jsTrial(config,token){
  const driver=neo4j.driver(config.uri,neo4j.auth.basic('neo4j',token),{
    connectionTimeout:6500,maxTransactionRetryTime:0,maxConnectionPoolSize:1,
  });
  const report={db:config.database,uriScheme:config.uri.split(':')[0]};
  try{
    // Official JS example directly runs session query. Record connectivity
    // separately but still run the query when verification fails.
    if(config.preflight === false){
      report.connectivity='not_checked_as_in_official_js_example';
    }else{
      try{await driver.verifyConnectivity();report.connectivity='ok';}
      catch(e){report.connectivity='failed';report.connectError=safe(e);}
    }
    const options={};
    if(config.database!==null) options.database=config.database;
    const session=driver.session(options);
    try{
      const result=await session.run(CYPHER,{src:ID});
      const values=result.records.map(r=>number(r.get('id')));
      report.query=values.length===1&&values[0]===ID2?'value_match':'value_mismatch';
      report.rows=values.length;
    }catch(e){report.query='failed';report.queryError=safe(e);}
    finally{await session.close().catch(()=>undefined);}
  }finally{await driver.close().catch(()=>undefined);}
  return report;
}
async function main(){
  check(process.argv.length===2,'GATE17_ARGUMENTS');
  const {graph,token}=entries();
  check(token.length>=32,'GATE17_TOKEN_MISSING');
  await ready();
  await http(token,graph,
    'MERGE (a {id: '+ID+'})-[:FOLLOWS]->(b {id: '+ID2+'})');
  const reference=await http(token,graph,CYPHER,{src:ID});
  check(Array.isArray(reference.rows)&&reference.rows.length===1&&
    valueOf(reference.rows[0]?.[0])===ID2,'GATE17_HTTP_SEED_VALIDATION_FAILED');
  const results=[];
  for (const source of modes){
    const config={...source,database:source.database==='@graph'?graph:source.database};
    const trials=[];
    for(let i=0;i<3;i++)trials.push(await jsTrial(config,token));
    results.push({variant:source.name,config:{database:config.database,
      scheme:config.uri.split(':')[0],preflight:config.preflight!==false},trials});
  }
  const primary=results[0];
  const successes=primary.trials.filter(t=>t.query==='value_match').length;
  const payload={schemaVersion:'hydradb-gate17-official-bolt-example-v1',
    scope:'github_ephemeral_only',server:'HydraDB OSS 0.3.0 OCI pinned',
    graphId:graph,driver:'neo4j-driver',driverVersion,
    documentedConfiguration:graph==='default',
    httpValueMatch:true,documentationSampleParameterized:true,
    officialDefaultPassCount:successes,officialDefaultTrials:3,
    runs:results,sourceUrl:'https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md',
    originalOrbeTouched:false,hostedV2Used:false};
  const report=resolve(process.env.GATE17_JSON_REPORT_FILE||'/missing');
  const runner=resolve(process.env.RUNNER_TEMP||'/not-runner');
  check(report.startsWith(runner+'/'), 'GATE17_REPORT_OUTSIDE_RUNNER');
  writeFileSync(report,JSON.stringify(payload,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  console.log('GATE17_JS_OFFICIAL_EXAMPLE_JSON',JSON.stringify(payload));
  console.log(successes===3?'GATE17_JS_OFFICIAL_EXAMPLE_3_OF_3_PASS':
    'GATE17_JS_OFFICIAL_EXAMPLE_NOT_FULLY_REPRODUCED');
  console.log('GATE17_JS_DIAGNOSTIC_REPORTED');
}
main().catch(e=>{
  console.error(e instanceof Error&&e.message.startsWith('GATE17_')?
    e.message:'GATE17_JS_INTERNAL_ERROR');
  process.exitCode=1;
});
