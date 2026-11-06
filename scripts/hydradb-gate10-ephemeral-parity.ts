/**
 * Gate 10: LIVE contract equivalence on two disposable CI engines ONLY.
 * Neo4j reference: original production queries/seed and Neo4j driver.
 * HydraDB: LAB-only native numeric-id provenance graph via HTTP transport.
 *
 * No connection or data access to DEV, MAIN, MiniMac, real Orbe or academic PPKS.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';
import {
  Neo4jGraphStore,
  graphOrCanonical,
} from '../apps/orbe-node/src/adapters/neo4j-driver-store.js';
import { Neo4jEvidenceRepository } from '../apps/orbe-node/src/adapters/neo4j-graph-queries.js';
import {
  Gate10HydraEvidenceRepository,
  createGate10EphemeralHttpTransport,
} from './hydradb-gate10-repository.js';
import {
  gate10Fixture, gate10Requirements, gate10Claims, gate10Sources,
} from './hydradb-gate10-fixture.js';
import type {
  EvidenceGraphMatch, EvidenceGraphRepository, EvidenceClaim, EvidenceSource,
  EvidenceGraphSnapshot, VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';
import { loadGate12PublicPpksFixture } from './hydradb-gate12-public-ppks-fixture.js';

function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
function confidentialText(envName: string): string {
  const root = resolve(process.env.RUNNER_TEMP ?? '/__no_runner__');
  const file = resolve(process.env[envName] ?? '/__no_path__');
  ensure(file.startsWith(root + '/'), 'GATE10_SECRET_OUTSIDE_RUNNER');
  return readFileSync(file, 'utf8').trim();
}
function scalar(value: string): string {
  // LAB-only fixed public fixture labels can include spaces (e.g. Spring Boot).
  // Still reject quotes, backslashes, newlines and Cypher metacharacters.
  ensure(/^[A-Za-z0-9._+:/= -]{1,12000}$/.test(value), 'GATE10_CYPHER_SCALAR');
  return "'" + value + "'";
}
const pack = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

async function hydraQuery(token: string, query: string,
  parameters: Readonly<Record<string, string>> = {}): Promise<unknown> {
  const response = await fetch('http://127.0.0.1:18443/v1/graphs/lab/query', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'x-graph-namespace': 'lab',
    },
    body: JSON.stringify({cell_id:'cell-0',query,parameters,timeout_ms:10000}),
    signal: AbortSignal.timeout(12000),
  });
  ensure(response.ok, 'GATE10_HYDRA_QUERY_HTTP_' + response.status);
  const content = await response.text();
  ensure(content.length < 1000000, 'GATE10_HYDRA_RESPONSE_LIMIT');
  return JSON.parse(content) as unknown;
}

async function waitReady(graph: Neo4jGraphStore): Promise<void> {
  for (let attempt = 0; attempt < 70; attempt++) {
    let hydraReady = false;
    try {
      const response = await fetch('http://127.0.0.1:19090/readyz', {
        signal: AbortSignal.timeout(1500),
      });
      hydraReady = response.ok;
    } catch { /* startup is still in progress */ }
    if (hydraReady) {
      try {
        await graph.verifyConnectivity();
        return;
      } catch { /* wait for Neo4j */ }
    }
    await new Promise(done => setTimeout(done, 1500));
  }
  throw new Error('GATE10_READINESS_TIMEOUT');
}

async function seedHydra(
  token: string, run: string, offset: number,
  claims: readonly EvidenceClaim[], sources: readonly EvidenceSource[],
  nodes: EvidenceGraphSnapshot['nodes'],
): Promise<void> {
  const claimIds = new Map(claims.map((claim,i) => [claim.id, offset + 100 + i]));
  const sourceIds = new Map(sources.map((source,i) => [source.id, offset + 200 + i]));
  const labels = new Map(nodes.filter(n=>n.kind==='skill').map(n=>[n.id,n.label.toLowerCase()]));
  const skills = [...new Set(claims.map(c=>labels.get(c.objectId)!))].sort();
  ensure(skills.every(x=>typeof x==='string' && x.length>0),
    'GATE10_UNKNOWN_SKILL_NODE');
  const skillIds = new Map(skills.map((skill,i)=>[skill,offset+300+i]));
  const safeRun = scalar(run);
  for (const claim of claims) {
    const cid = claimIds.get(claim.id)!;
    const skill = labels.get(claim.objectId);
    ensure(skill!==undefined,'GATE10_MISSING_SKILL');
    const claimPattern = '(c:Claim {id: ' + cid +
      ', lab_run: ' + safeRun +
      ', normalized_name: ' + scalar(skill) +
      ', payload: ' + scalar(pack(claim)) + '})';
    const skillPattern = '(s:Skill {id: ' + skillIds.get(skill) +
      ', lab_run: ' + safeRun + ', normalized_name: ' + scalar(skill) + '})';
    await hydraQuery(token, 'MERGE ' + claimPattern + '-[:USES_TECHNOLOGY]->' + skillPattern);
    for (const sourceId of claim.sourceIds) {
      const source = sources.find(s=>s.id===sourceId);
      ensure(source !== undefined, 'GATE10_SOURCE_FIXTURE_INVALID');
      const sourcePattern = '(src:Source {id: ' + sourceIds.get(sourceId) +
        ', lab_run: ' + safeRun +
        ', source_key: ' + scalar(sourceId) +
        ', payload: ' + scalar(pack(source)) + '})';
      await hydraQuery(token, 'MERGE ' + claimPattern + '-[:SUPPORTED_BY]->' + sourcePattern);
    }
  }
}

function canonicalMatch(value: EvidenceGraphMatch) {
  return {
    requirementId: value.requirementId,
    claims: [...value.claims].map(claim => ({
      ...claim, sourceIds: [...claim.sourceIds].sort(),
    })).sort((a,b)=>a.id.localeCompare(b.id)),
    sources: [...value.sources].sort((a,b)=>a.id.localeCompare(b.id)),
  };
}
function hashMatches(matches: readonly EvidenceGraphMatch[]): string {
  return createHash('sha256').update(JSON.stringify(matches.map(canonicalMatch)))
    .digest('hex');
}
async function assertParity(
  neo: EvidenceGraphRepository,
  hydra: EvidenceGraphRepository,
  runLabel: string,
): Promise<Array<{scenario:string, claims:number,sources:number}>> {
  const scenarios = [
    { name: 'multi_skill_all', requirements:gate10Requirements, limit:5 },
    { name: 'multi_skill_bounded', requirements:gate10Requirements, limit:1 },
    { name: 'java_professional_and_study', requirements:[gate10Requirements[0]!], limit:20 },
    { name: 'flutter_mixed_and_personal', requirements:[gate10Requirements[1]!], limit:20 },
    { name: 'unsupported_go_absent', requirements:[gate10Requirements[2]!], limit:20 },
  ];
  const results: Array<{scenario:string,claims:number,sources:number}> = [];
  for (const scenario of scenarios) {
    const original = await neo.findEvidence(scenario.requirements, {
      maxClaimsPerRequirement:scenario.limit,
    });
    const candidate = await hydra.findEvidence(scenario.requirements, {
      maxClaimsPerRequirement:scenario.limit,
    });
    ensure(
      JSON.stringify(original.map(canonicalMatch)) ===
      JSON.stringify(candidate.map(canonicalMatch)),
      'GATE10_REPOSITORY_PARITY_MISMATCH_' + scenario.name,
    );
    const claimCount = original.reduce((n,c)=>n+c.claims.length,0);
    const sourceCount = original.reduce((n,c)=>n+c.sources.length,0);
    if (scenario.name === 'multi_skill_all') {
      ensure(claimCount === 4 && sourceCount === 6,'GATE10_EVIDENCE_COUNT_DRIFT');
    }
    if (scenario.name === 'multi_skill_bounded') {
      ensure(claimCount === 2 && sourceCount === 4,'GATE10_LIMIT_SOURCE_LOSS');
    }
    if (scenario.name === 'unsupported_go_absent') {
      ensure(claimCount === 0 && sourceCount === 0,'GATE10_GO_INVENTED');
    }
    results.push({scenario:runLabel+'_'+scenario.name,claims:claimCount,sources:sourceCount});
  }

  for (const source of gate10Sources) {
    const first = await neo.getSource(source.id);
    const second = await hydra.getSource(source.id);
    ensure(first?.id === source.id && second?.id === source.id &&
      JSON.stringify(first) === JSON.stringify(second),
      'GATE10_GET_SOURCE_PARITY');
  }
  ensure(await neo.getSource('source-missing') === undefined &&
    await hydra.getSource('source-missing') === undefined,
    'GATE10_MISSING_SOURCE_INVENTED');
  const initial = await neo.findEvidence(gate10Requirements);
  const digest = hashMatches(initial);
  const other = await hydra.findEvidence(gate10Requirements);
  ensure(digest === hashMatches(other), 'GATE10_RESPONSE_DIGEST_MISMATCH');
  return results;
}

async function assertPublicParity(
  neo: EvidenceGraphRepository, hydra: EvidenceGraphRepository,
  requirements: readonly VacancyRequirement[], sources: readonly EvidenceSource[],
  phase: string,
): Promise<{phase:string, requirementComparisons:number,sourceComparisons:number}> {
  let requirementComparisons=0;
  for (const limit of [1, 20]) {
    const a=await neo.findEvidence(requirements,{maxClaimsPerRequirement:limit});
    const b=await hydra.findEvidence(requirements,{maxClaimsPerRequirement:limit});
    ensure(a.length===requirements.length && b.length===a.length,
      'GATE12_PUBLIC_REQUIREMENTS_DRIFT');
    for(let i=0;i<requirements.length;i++) {
      ensure(JSON.stringify(canonicalMatch(a[i]!))===
        JSON.stringify(canonicalMatch(b[i]!)),
        'GATE12_PUBLIC_REPOSITORY_PARITY');
      ensure(a[i]!.claims.every(c=>c.scope!=='unknown'),
        'GATE12_PUBLIC_UNKNOWN_SCOPE_LEAK');
      requirementComparisons++;
    }
    const missing=a.find(x=>x.requirementId==='req-public-go');
    ensure(missing?.claims.length===0 && missing.sources.length===0,
      'GATE12_PUBLIC_UNSUPPORTED_GO_INVENTED');
  }
  let sourceComparisons=0;
  for(const source of sources) {
    const first=await neo.getSource(source.id);
    const second=await hydra.getSource(source.id);
    ensure(first?.id===source.id && second?.id===source.id &&
      JSON.stringify(first)===JSON.stringify(second),
      'GATE12_PUBLIC_SOURCE_PARITY');
    sourceComparisons++;
  }
  ensure(await neo.getSource('source-not-found')===undefined &&
    await hydra.getSource('source-not-found')===undefined,
    'GATE12_PUBLIC_UNKNOWN_SOURCE_INVENTED');
  return {phase,requirementComparisons,sourceComparisons};
}

async function main() {
  ensure(process.argv.length === 2 &&
    process.env.GATE10_ISOLATION_MODE === 'github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY === 'SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF === 'refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID ?? ''),
    'GATE10_GITHUB_HOSTED_ONLY');
  const token = confidentialText('GATE10_HYDRA_TOKEN_FILE');
  const auth = confidentialText('GATE10_NEO_AUTH_FILE');
  ensure(token.length >= 32 && auth.startsWith('neo4j/') &&
    auth.length >= 32, 'GATE10_BAD_AUTH_FILE');
  const rawDriver = neo4j.driver('bolt://127.0.0.1:17688',
    neo4j.auth.basic('neo4j',auth.slice(6)), {
      maxTransactionRetryTime:0,connectionTimeout:5000,maxConnectionPoolSize:2,
    });
  const store = new Neo4jGraphStore(rawDriver,'neo4j');
  try {
    await waitReady(store);
    console.log('GATE10_EPHEMERAL_PAIR_READY');
    const seeded = await store.seed(gate10Fixture);
    ensure(seeded.nodes === gate10Fixture.nodes.length &&
      seeded.relations === gate10Fixture.relations.length,
      'GATE10_NEO4J_SEED_COUNTS');
    const counted = await store.count();
    ensure(counted.nodes === seeded.nodes && counted.relations === seeded.relations,
      'GATE10_NEO4J_COUNT_MISMATCH');
    const neo = new Neo4jEvidenceRepository(store);
    const run = process.env.GITHUB_RUN_ID!;
    const secondRun = run + '1';
    const offset = 920000;
    const transport = createGate10EphemeralHttpTransport(token);
    const runA = new Gate10HydraEvidenceRepository(transport,run);
    const runB = new Gate10HydraEvidenceRepository(transport,secondRun);

    await seedHydra(token,run,offset,gate10Claims,gate10Sources,gate10Fixture.nodes);
    const initial = await assertParity(neo,runA,'first');
    await seedHydra(token,run,offset,gate10Claims,gate10Sources,gate10Fixture.nodes);
    const repeated = await assertParity(neo,runA,'idempotent');
    await seedHydra(token,secondRun,offset+10000,gate10Claims,gate10Sources,gate10Fixture.nodes);
    const isolated = await assertParity(neo,runA,'older_after_new');
    const newer = await assertParity(neo,runB,'second_run');

    const canonical = await neo.findEvidence(gate10Requirements);
    const recovered = await graphOrCanonical(
      async () => { throw new Error('GATE10_INJECTED_GRAPH_DOWN'); },
      async () => canonical,
    );
    ensure(hashMatches(recovered) === hashMatches(canonical),
      'GATE10_SAFE_FALLBACK_MISMATCH');

    const report = {
      schemaVersion:'hydradb-gate10-functional-parity-v1',
      runType:'github_hosted_ephemeral_synthetic_only',
      mainDevCodeContract:'same_git_blobs_verified_in_separate_gate',
      orbeNeo4jAdapter:'unmodified_Neo4jGraphStore_and_Neo4jEvidenceRepository',
      hydraAdapter:'LAB_native_http_strict_source_complete',
      fixtureNodes:seeded.nodes,fixtureRelations:seeded.relations,
      fixtureClaims:gate10Claims.length,fixtureSources:gate10Sources.length,
      scenarioPasses:initial.length+repeated.length+isolated.length+newer.length,
      getSourceComparisons:gate10Sources.length*4,
      experiments:[...initial,...repeated,...isolated,...newer],
      replayIdempotence:'pass',runReadIsolation:'pass',
      canonicalFallback:'pass',
      semanticParity:'pass_for_this_synthetic_fixture_only',
      humanGold:false,productionData:false,
      realMinioPersistence:'not_tested',
      hardCrashRecovery:'not_tested',boltHydraCompatibility:'not_tested_in_gate10',
      directNeo4jAdapterMigration:'not_supported',
      engineSpeedOrCostGain:'not_measured',
      devMainTouched:false,
    };
    console.log('GATE10_SYNTHETIC_REPOSITORY_PARITY_JSON',JSON.stringify(report));
    console.log('GATE10_REPOSITORY_CONTRACT_PASS');

    // Separate public PPKS experiment. Never call the full academic projector.
    const publicFixture=await loadGate12PublicPpksFixture();
    ensure(publicFixture.metadata.privateAcademicRecordsLoaded===false &&
      publicFixture.metadata.recordCount===7 &&
      publicFixture.metadata.claimCount===14 &&
      publicFixture.metadata.sourceCount===16,
      'GATE12_PUBLIC_CONSENT_OR_FIXTURE_DRIFT');
    const publicSeed=await store.seed(publicFixture.snapshot);
    ensure(publicSeed.nodes===publicFixture.snapshot.nodes.length,
      'GATE12_NEO4J_PUBLIC_SEED_FAILED');
    const neoPublic=new Neo4jEvidenceRepository(store);
    const publicRun=run+'2';
    const publicRunTwo=run+'3';
    const base=3500000;
    await seedHydra(token,publicRun,base,
      publicFixture.claims,publicFixture.sources,publicFixture.snapshot.nodes);
    const phases=[];
    phases.push(await assertPublicParity(
      neoPublic,new Gate10HydraEvidenceRepository(transport,publicRun),
      publicFixture.requirements,publicFixture.sources,'first'));
    await seedHydra(token,publicRun,base,
      publicFixture.claims,publicFixture.sources,publicFixture.snapshot.nodes);
    phases.push(await assertPublicParity(
      neoPublic,new Gate10HydraEvidenceRepository(transport,publicRun),
      publicFixture.requirements,publicFixture.sources,'idempotent'));
    await seedHydra(token,publicRunTwo,base+10000,
      publicFixture.claims,publicFixture.sources,publicFixture.snapshot.nodes);
    phases.push(await assertPublicParity(
      neoPublic,new Gate10HydraEvidenceRepository(transport,publicRun),
      publicFixture.requirements,publicFixture.sources,'older_after_second'));
    phases.push(await assertPublicParity(
      neoPublic,new Gate10HydraEvidenceRepository(transport,publicRunTwo),
      publicFixture.requirements,publicFixture.sources,'second'));
    const publicReport={
      schemaVersion:'hydradb-gate12-public-ppks-parity-v1',
      provenance:'seven_allowlisted_public_ppks_records_only',
      usesProductionNeo4jAdapterUnmodified:true,
      hydradbAdapter:'LAB_only_bounded_http',
      metadata:publicFixture.metadata,
      phases,
      requirementComparisons:phases.reduce((n,p)=>n+p.requirementComparisons,0),
      sourceComparisons:phases.reduce((n,p)=>n+p.sourceComparisons,0),
      replayIdempotence:'pass',runReadIsolation:'pass',
      humanGold:false,privateAcademicDataIncluded:false,
      actualDevMainDatabaseTouched:false,
      liveRecruiterResponsesCompared:false,
      migrationReady:false,
    };
    console.log('GATE12_PUBLIC_PPKS_REPOSITORY_PARITY_JSON',
      JSON.stringify(publicReport));
    console.log('GATE12_PUBLIC_PPKS_REPOSITORY_PARITY_PASS');
  } finally {
    await store.close();
  }
}
main().catch((error:unknown)=>{
  const code = error instanceof Error && error.message.startsWith('GATE10_')
    ? error.message:'INTERNAL_ERROR';
  console.error('GATE10_EPHEMERAL_PARITY_FAILED',code);
  process.exitCode=1;
});
