/**
 * Gate 13, GitHub-hosted disposable only:
 * public-only PPKS evidence + HydraDB S3-compatible MinIO
 * write/read -> new HydraDB node/cache -> replaced MinIO + node.
 *
 * No Neo4j instance, no academic projector, no production connection.
 * Compare with the exact original Orbe-domain public fixture on EVERY read.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Gate10HydraEvidenceRepository, createGate10EphemeralHttpTransport,
} from './hydradb-gate10-repository.js';
import { loadGate12PublicPpksFixture } from './hydradb-gate12-public-ppks-fixture.js';
import type { EvidenceGraphMatch, EvidenceSource, EvidenceClaim } from
  '../apps/orbe-node/src/domain/evidence-graph.js';

function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function secretFile(variable: string): string {
  const root = resolve(process.env.RUNNER_TEMP ?? '/not-a-runner');
  const path = resolve(process.env[variable] ?? '/not-a-path');
  check(path.startsWith(root+'/'), 'GATE13_FILE_OUTSIDE_RUNNER');
  return path;
}
function scalar(str: string): string {
  check(/^[A-Za-z0-9._+:/= -]{1,12000}$/.test(str),
    'GATE13_SCALAR_UNSAFE');
  return "'" + str + "'";
}
function encode(data: unknown): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
}
function canon(match: EvidenceGraphMatch) {
  return {
    requirementId: match.requirementId,
    claims: [...match.claims].map(x=>({...x,sourceIds:[...x.sourceIds].sort()}))
      .sort((a,b)=>a.id.localeCompare(b.id)),
    sources: [...match.sources].sort((a,b)=>a.id.localeCompare(b.id)),
  };
}
async function send(token:string,cypher:string):Promise<void> {
  const response=await fetch('http://127.0.0.1:18443/v1/graphs/lab/query',{
    method:'POST',
    headers:{
      'authorization':'Bearer '+token,
      'x-graph-namespace':'lab',
      'content-type':'application/json',
    },
    body:JSON.stringify({cell_id:'cell-0',query:cypher,timeout_ms:15000}),
    signal:AbortSignal.timeout(18000),
  });
  check(response.ok, 'GATE13_SEED_HTTP_'+response.status);
  const result=await response.json() as {error?:unknown,errors?:unknown};
  check(!result.error && !result.errors, 'GATE13_SEED_ENGINE_FAILURE');
}
async function awaitReady():Promise<void> {
  for(let i=0;i<90;i++){
    try{
      const x=await fetch('http://127.0.0.1:19090/readyz',{
        signal:AbortSignal.timeout(1500),
      });
      if(x.ok)return;
    }catch{/* restarting */}
    await new Promise(done=>setTimeout(done,1200));
  }
  throw new Error('GATE13_ENGINE_NOT_READY');
}
async function seed(
  token:string,run:string,
  claims:readonly EvidenceClaim[],sources:readonly EvidenceSource[],
  skillNames:ReadonlyMap<string,string>,
):Promise<number> {
  const ids=new Map(claims.map((c,i)=>[c.id,4800100+i]));
  const sourceIds=new Map(sources.map((c,i)=>[c.id,4800300+i]));
  const skills=[...skillNames].sort((a,b)=>a[0].localeCompare(b[0]));
  const skillIds=new Map(skills.map(([id],i)=>[id,4800500+i]));
  let writes=0;
  for(const claim of claims){
    const label=skillNames.get(claim.objectId);
    check(label!==undefined,'GATE13_MISSING_SKILL');
    const cid=ids.get(claim.id);
    check(cid!==undefined,'GATE13_MISSING_CLAIM');
    const claimNode='(c:Claim {id: '+cid+
      ', lab_run: '+scalar(run)+
      ', payload: '+scalar(encode(claim))+'})';
    const skillNode='(s:Skill {id: '+skillIds.get(claim.objectId)+
      ', lab_run: '+scalar(run)+
      ', normalized_name: '+scalar(label.toLowerCase())+'})';
    await send(token,'MERGE '+claimNode+'-[:USES_TECHNOLOGY]->'+skillNode);
    writes++;
    for(const key of claim.sourceIds){
      const source=sources.find(x=>x.id===key);
      const sid=sourceIds.get(key);
      check(source!==undefined&&sid!==undefined,'GATE13_SOURCE_MISSING');
      const sourceNode='(src:Source {id: '+sid+
        ', lab_run: '+scalar(run)+
        ', source_key: '+scalar(source.id)+
        ', payload: '+scalar(encode(source))+'})';
      await send(token,'MERGE '+claimNode+'-[:SUPPORTED_BY]->'+sourceNode);
      writes++;
    }
  }
  return writes;
}
async function verify(token:string,run:string) {
  const fixture=await loadGate12PublicPpksFixture();
  check(fixture.metadata.recordCount===7 && fixture.metadata.claimCount===14 &&
    fixture.metadata.sourceCount===16 &&
    fixture.metadata.privateAcademicRecordsLoaded===false,
    'GATE13_PUBLIC_FIXTURE_CHANGED');

  const labels=new Map(fixture.snapshot.nodes.filter(x=>x.kind==='skill')
    .map(x=>[x.id,x.label]));
  const sourceById=new Map(fixture.sources.map(x=>[x.id,x]));
  const allowed=new Set(['professional','mixed_role','professional_project',
    'personal_project','study']);
  const repo=new Gate10HydraEvidenceRepository(
    createGate10EphemeralHttpTransport(token),run);
  const answers=await repo.findEvidence(fixture.requirements,{
    maxClaimsPerRequirement:20,
  });
  check(answers.length===fixture.requirements.length,
    'GATE13_REQUIREMENT_CARDINALITY');
  let checkedClaims=0, checkedReferences=0;
  const matches=[];
  for(const [i,req] of fixture.requirements.entries()){
    const expectedClaims=fixture.claims.filter(x=>
      x.objectId===('skill-'+req.label.toLowerCase()
        .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')) &&
      allowed.has(x.scope)).sort((a,b)=>a.id.localeCompare(b.id));
    const expectedIds=new Set(expectedClaims.flatMap(x=>x.sourceIds));
    const expectedSources=fixture.sources.filter(x=>expectedIds.has(x.id))
      .sort((a,b)=>a.id.localeCompare(b.id));
    const expected:EvidenceGraphMatch={
      requirementId:req.id,claims:expectedClaims,sources:expectedSources,
    };
    check(JSON.stringify(canon(answers[i]!))===JSON.stringify(canon(expected)),
      'GATE13_PUBLIC_CLAIM_SOURCE_SCOPE_MISMATCH');
    checkedClaims+=expectedClaims.length;
    checkedReferences+=expectedClaims.reduce((n,x)=>n+x.sourceIds.length,0);
    matches.push(canon(answers[i]!));
  }
  const retrieved=[];
  for(const src of fixture.sources){
    const result=await repo.getSource(src.id);
    check(result!==undefined && JSON.stringify(result)===
      JSON.stringify(sourceById.get(src.id)),
      'GATE13_SPECIFIC_SOURCE_NOT_PRESERVED');
    retrieved.push(result);
  }
  check(await repo.getSource('source-not-found')===undefined,
    'GATE13_UNKNOWN_SOURCE_INVENTED');
  const digest=createHash('sha256').update(JSON.stringify({
    matches,retrieved,
  })).digest('hex');
  return {
    digest,
    labels:labels.size,
    requirements:answers.length,
    claims:fixture.claims.length,
    scopedClaimsChecked:checkedClaims,
    sourceReferenceChecks:checkedReferences,
    specificSources:retrieved.length,
    metadata:fixture.metadata,
  };
}
async function main(){
  check(process.argv.length===4 && process.argv[2]==='--mode' &&
    (process.argv[3]==='seed'||process.argv[3]==='verify'),
    'GATE13_ARGUMENTS');
  check(process.env.GATE11_ISOLATION_MODE==='github_hosted_ephemeral' &&
    process.env.GATE10_ISOLATION_MODE==='github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY==='SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF==='refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID??''),
    'GATE13_RUNNER_RESTRICTION');
  const token=readFileSync(secretFile('GATE11_TOKEN_FILE'),'utf8').trim();
  check(token.length>=32,'GATE13_BAD_TOKEN');
  const signature=secretFile('GATE13_DIGEST_FILE');
  const run=process.env.GITHUB_RUN_ID!;
  await awaitReady();

  if(process.argv[3]==='seed'){
    check(!existsSync(signature),'GATE13_SIGNATURE_ALREADY_SET');
    const fixture=await loadGate12PublicPpksFixture();
    const labels=new Map(fixture.snapshot.nodes.filter(x=>x.kind==='skill')
      .map(x=>[x.id,x.label]));
    const writes=await seed(token,run,fixture.claims,fixture.sources,labels);
    const result=await verify(token,run);
    check(writes===46 && result.specificSources===16,
      'GATE13_PUBLIC_SEED_INCOMPLETE');
    writeFileSync(signature,result.digest+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    console.log('GATE13_PUBLIC_MINIO_FIRST_READ_JSON',JSON.stringify({
      ...result,writes,scope:'ephemeral_public_ppks_only',
    }));
    console.log('GATE13_PUBLIC_MINIO_WRITE_READ_PASS');
  }else{
    const expected=readFileSync(signature,'utf8').trim();
    check(/^[a-f0-9]{64}$/.test(expected),'GATE13_EXPECTED_SHA_INVALID');
    const result=await verify(token,run);
    check(result.digest===expected,'GATE13_PUBLIC_MINIO_RESTART_MISMATCH');
    console.log('GATE13_PUBLIC_MINIO_RESTART_JSON',JSON.stringify({
      ...result,scope:'ephemeral_public_ppks_only',
    }));
    console.log('GATE13_PUBLIC_MINIO_RESTART_PARITY_PASS');
  }
}
main().catch(error=>{
  const code=error instanceof Error && error.message.startsWith('GATE13_')
    ?error.message:'INTERNAL_ERROR';
  console.error('GATE13_PUBLIC_MINIO_VALIDATION_FAILED',code);
  process.exitCode=1;
});
