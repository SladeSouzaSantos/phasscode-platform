/**
 * F4.3 first controlled *application adapter* pilot, not engine benchmark:
 * original Neo4j Bolt repository vs HydraDB LAB HTTP repository, same public
 * fixture, bounded concurrency, same domain contract, no DEV/MAIN access.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  EvidenceGraphRepository, VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

type Workload = {
  name: string;
  run: (repo:EvidenceGraphRepository)=>Promise<unknown>;
};
type Outcome = { kind:'ok'|'error'|'mismatch'; elapsedMs:number };

function assert(value:unknown,code:string):asserts value {
  if(!value)throw new Error(code);
}
function normalized(value:unknown):unknown{
  if(Array.isArray(value)){
    return value.map(v=>normalized(v));
  }
  if(value&&typeof value==='object'){
    const o=value as Record<string,unknown>;
    if('requirementId' in o && Array.isArray(o.claims) && Array.isArray(o.sources)){
      return {
        requirementId:o.requirementId,
        claims:o.claims.map(v=>{
          const c=v as {id:string,sourceIds?:readonly string[]};
          return {...c,sourceIds:[...(c.sourceIds??[])].sort()};
        }).sort((a,b)=>a.id.localeCompare(b.id)),
        sources:[...o.sources].sort((a,b)=>
          (a as {id:string}).id.localeCompare((b as {id:string}).id)),
      };
    }
  }
  return value;
}
function fingerprint(value:unknown):string{
  return JSON.stringify(normalized(value));
}
function quantile(values:readonly number[],p:number):number|null{
  if(values.length===0)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return Number(sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]!.toFixed(3));
}
async function sample(
  workload:Workload,
  repo:EvidenceGraphRepository,
  engineName:string,
  expected:string,
  concurrency:number,
  operations:number,
){
  const warmups=8;
  for(let i=0;i<warmups;i++){
    assert(fingerprint(await workload.run(repo))===expected,
      'GATE15_WARMUP_PARITY_FAILED');
  }
  let cursor=0;
  const results:Outcome[]=[];
  const start=performance.now();
  async function worker(){
    while(cursor<operations){
      cursor++;
      const t=performance.now();
      try{
        const response=await workload.run(repo);
        const ms=performance.now()-t;
        const equivalent=fingerprint(response)===expected;
        results.push({kind:equivalent?'ok':'mismatch',elapsedMs:ms});
      }catch{
        results.push({kind:'error',elapsedMs:performance.now()-t});
      }
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  const wallMs=performance.now()-start;
  const good=results.filter(x=>x.kind==='ok').map(x=>x.elapsedMs);
  const errors=results.filter(x=>x.kind==='error').length;
  const mismatches=results.filter(x=>x.kind==='mismatch').length;
  assert(results.length===operations && errors===0 && mismatches===0,
    'GATE15_RESULT_ERROR_OR_MISMATCH');
  return {
    workload:workload.name,engine:engineName,concurrency,
    operations,warmups,errors,mismatches,
    p50Ms:quantile(good,0.5),p95Ms:quantile(good,0.95),
    p99Ms:quantile(good,0.99),
    meanMs:Number((good.reduce((a,b)=>a+b,0)/good.length).toFixed(3)),
    wallMs:Number(wallMs.toFixed(3)),
    operationsPerSecond:Number((operations/(wallMs/1000)).toFixed(2)),
  };
}

export async function runGate15AdapterPilot(
  neo:EvidenceGraphRepository,
  hydra:EvidenceGraphRepository,
  requirements:readonly VacancyRequirement[],
  sourceId:string,
):Promise<void>{
  assert(process.env.GATE10_ISOLATION_MODE==='github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY==='SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF==='refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID??''),
    'GATE15_EPHEMERAL_ONLY');
  assert(requirements.length===11 && requirements.at(-1)?.label==='Go' &&
    /^source-[a-z0-9-]+$/.test(sourceId),'GATE15_FIXTURE_UNEXPECTED');

  const workloads:Workload[]=[
    {name:'one_skill',run:repo=>repo.findEvidence([requirements[0]!],{maxClaimsPerRequirement:20})},
    {name:'four_skills',run:repo=>repo.findEvidence(requirements.slice(0,4),{maxClaimsPerRequirement:20})},
    {name:'absent_go',run:repo=>repo.findEvidence([requirements.at(-1)!],{maxClaimsPerRequirement:20})},
    {name:'source_lookup',run:repo=>repo.getSource(sourceId)},
  ];
  const reports:Awaited<ReturnType<typeof sample>>[]=[];
  const digests:Record<string,string>={};
  for(const workload of workloads){
    const original=fingerprint(await workload.run(neo));
    const adapted=fingerprint(await workload.run(hydra));
    assert(original===adapted,'GATE15_BASELINE_PARITY_FAILED');
    digests[workload.name]=createHash('sha256').update(original).digest('hex');
    for(const concurrency of [1,4]){
      const order=concurrency===1
        ? [{name:'neo4j_bolt',repo:neo},{name:'hydradb_http',repo:hydra}]
        : [{name:'hydradb_http',repo:hydra},{name:'neo4j_bolt',repo:neo}];
      for(const item of order){
        reports.push(await sample(workload,item.repo,item.name,
          original,concurrency,64));
      }
    }
  }
  const report={
    schemaVersion:'hydradb-f43-public-ppks-adapter-pilot-v1',
    scope:'github_hosted_ephemeral_only',
    testPurpose:'measure_application_level_adapter_read_roundtrips',
    notEngineIsolated:true,
    neo4jTransport:'Bolt neo4j-driver 6.2.0',
    hydraTransport:'HTTP node fetch',
    dataset:'seven_allowlisted_public_PPKS_records_first_two_skills_per_record',
    fixtureCounts:{records:7,skills:10,claims:14,sources:16},
    dockerLimits:{cpuEach:1.5,memoryMiBEach:2048,
      neo4jHeapMaxMiB:512,cacheModelsNotIdentical:true},
    measurementsPerSeries:64,warmupPerSeries:8,
    concurrencyLevels:[1,4],
    responseDigests:digests,
    results:reports,
    coldCache:'not_measured',
    actualCpuRamIops:'not_measured',
    objectStorage:'not_used_in_this_pilot_HydraDB_local_storage',
    completeOrbeResponseLatency:'not_measured',
    dollarsPerQuery:'not_measured',
    allResultsCorrect:true,
    migrationDecision:'not_approved',
  };
  const json=JSON.stringify(report,null,2);
  const temp=resolve(process.env.RUNNER_TEMP??'/__not_runner__');
  const reportFile=resolve(temp,
    'gate15-adapter-pilot-'+process.env.GITHUB_RUN_ID+'.json');
  assert(reportFile.startsWith(temp+'/'),'GATE15_OUTSIDE_RUNNER');
  writeFileSync(reportFile,json+'\n',{mode:0o600,flag:'wx'});
  console.log('GATE15_ADAPTER_PILOT_JSON',JSON.stringify(report));
  console.log('GATE15_ADAPTER_PILOT_PASS');
}
