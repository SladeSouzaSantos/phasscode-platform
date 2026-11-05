/**
 * Gate 7, LAB only: replay recruiter prompts as fixed, manually curated
 * requirement sets; verify PPKS claims and source completeness.
 * NO LLM answers, chat API, write queries, private academic data or DEV/MAIN.
 */
import { resolve } from 'node:path';
import type { EvidenceGraphMatch, EvidenceGraphRepository, EvidenceClaim } from '../apps/orbe-node/src/domain/evidence-graph.js';
import {
  HydraDbLabShadowEvidenceRepository, createHydraLabReadTransport,
  type HydraLabReadTransport, type LabShadowDecision,
} from './hydradb-lab-evidence-adapter.js';
import {
  approvedRun, assertLabCheckout, canonicalRepository, publicFixture,
  readToken, requirement,
} from './hydradb-lab-ts-live-check.js';

type Mode = 'off' | 'shadow';
type Failure = 'none' | 'outage' | 'missing-source' | 'extra-row';
interface Flags { mode: Mode; failure: Failure; requireGraph: boolean; report?: string; tokenFile?: string }
interface Scenario {
  id: string; question: string; skills: readonly string[]; maxClaims?: number;
}
const SCENARIOS: readonly Scenario[] = [
  { id: 'java-jobs-vs-study', question: 'Java profissional ou projeto de estudo?', skills: ['Java'] },
  { id: 'flutter-mixed', question: 'Flutter na Greencity é trabalho exclusivamente software?', skills: ['Flutter'] },
  { id: 'node-evidence', question: 'Quais fontes comprovam Node.js no backend?', skills: ['Node.js'] },
  { id: 'typescript-projects', question: 'TypeScript aparece em quais projetos?', skills: ['TypeScript'] },
  { id: 'go-no-fabrication', question: 'O candidato tem experiência Go?', skills: ['Go'] },
  { id: 'java-and-go', question: 'Java e Go são ambos comprovados?', skills: ['Java', 'Go'] },
  { id: 'react-public', question: 'Há projetos públicos de React?', skills: ['React'] },
  { id: 'spring-is-study', question: 'Spring Boot foi experiência profissional?', skills: ['Spring Boot'] },
  { id: 'hsp-languages', question: 'HSP utiliza Python e FastAPI?', skills: ['Python', 'FastAPI'] },
  { id: 'django-no-fabrication', question: 'Django foi utilizado?', skills: ['Django'] },
  { id: 'single-claim-all-sources', question: 'Mostre uma claim TypeScript e todas as fontes.', skills: ['TypeScript'], maxClaims: 1 },
  { id: 'mixed-requirements', question: 'Java, Flutter e Go para esta vaga?', skills: ['Java', 'Flutter', 'Go'] },
];

const EXPECTED: Readonly<Record<string, readonly (readonly [string, EvidenceClaim['scope']])[]>> = {
  Java: [['experiencia-sig', 'professional'], ['webservice-springboot-jpa', 'study']],
  Flutter: [['experiencia-greencity', 'mixed_role'], ['greencity-os', 'personal_project']],
  'Node.js': [['phasscode-platform', 'personal_project']],
  TypeScript: [['phasscode-platform', 'personal_project'], ['web-portfolio-v2', 'personal_project']],
  Go: [],
  React: [['web-portfolio-v2', 'personal_project']],
  'Spring Boot': [['webservice-springboot-jpa', 'study']],
  Python: [['hsp-simulator', 'unknown']],
  FastAPI: [['hsp-simulator', 'unknown']],
  Django: [],
};
const GRAPH_SUPPORTED = new Set(['Java', 'Flutter', 'TypeScript', 'Node.js', 'Go']);
const SOURCE_IDS = [
  'source-phasscode-platform-catalog', 'source-phasscode-platform-ports',
  'source-web-portfolio-v2-tests', 'source-experiencia-sig-catalog',
  'source-phasscode-platform-no-such-source',
];

function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
function args(input: readonly string[]): Flags {
  const map = new Map<string, string>();
  let requireGraph = false;
  for (let i = 0; i < input.length; i++) {
    const flag = input[i];
    if (flag === '--require-graph') {
      check(!requireGraph, 'LAB_DUPLICATE_FLAG');
      requireGraph = true;
      continue;
    }
    check(flag === '--mode' || flag === '--report' || flag === '--token-file' ||
      flag === '--simulate', 'LAB_INVALID_FLAG');
    check(!map.has(flag), 'LAB_DUPLICATE_FLAG');
    const value = input[++i];
    check(value && !value.startsWith('--'), 'LAB_FLAG_VALUE_REQUIRED');
    map.set(flag, value);
  }
  const mode = map.get('--mode') ?? 'off';
  const failure = map.get('--simulate') ?? 'none';
  check(mode === 'off' || mode === 'shadow', 'LAB_INVALID_MODE');
  check(failure === 'none' || failure === 'outage' ||
    failure === 'missing-source' || failure === 'extra-row', 'LAB_INVALID_FAULT');
  check(mode !== 'off' || (failure === 'none' && !requireGraph &&
    !map.has('--report') && !map.has('--token-file')), 'LAB_OFF_GRAPH_FORBIDDEN');
  check(!requireGraph || (mode === 'shadow' && failure === 'none'),
    'LAB_FAULT_REQUIRE_GRAPH_CONFLICT');
  const result: Flags = { mode, failure, requireGraph };
  if (mode === 'shadow') {
    check(map.has('--report') && map.has('--token-file'), 'LAB_SHADOW_FILES_REQUIRED');
    result.report = map.get('--report')!;
    result.tokenFile = map.get('--token-file')!;
  }
  return result;
}
function failureTransport(read: HydraLabReadTransport, failure: Failure): HydraLabReadTransport {
  if (failure === 'none') return read;
  return { async read(query, params) {
    if (failure === 'outage') throw new Error('SIMULATED_GRAPH_DOWN');
    const raw = await read.read(query, params);
    if (typeof raw !== 'object' || raw === null) return raw;
    const shape = raw as { columns?: unknown; rows?: unknown };
    if (!Array.isArray(shape.rows) || shape.rows.length === 0) return raw;
    if (failure === 'missing-source') return { ...shape, rows: shape.rows.slice(1) };
    return { ...shape, rows: [...shape.rows, shape.rows[0]] };
  }};
}
function verifiedResult(skill: string, result: EvidenceGraphMatch, max: number): void {
  const expected = EXPECTED[skill];
  check(expected !== undefined, 'LAB_UNDOCUMENTED_SKILL_CASE');
  const got = result.claims.map((claim) =>
    [claim.subjectId, claim.scope] as const);
  check(JSON.stringify(got) === JSON.stringify(expected.slice(0, max)),
    'LAB_RECRUITER_SCOPE_OR_CLAIM_DRIFT');
  const sources = new Map(result.sources.map((source) => [source.id, source]));
  const referenced = new Set<string>();
  for (const claim of result.claims) {
    check(claim.predicate === 'USES_TECHNOLOGY' && claim.sourceIds.length > 0,
      'LAB_UNSUPPORTED_CLAIM');
    check(new Set(claim.sourceIds).size === claim.sourceIds.length,
      'LAB_DUPLICATED_CLAIM_SOURCE');
    for (const id of claim.sourceIds) {
      const source = sources.get(id);
      check(source?.visibility === 'public', 'LAB_MISSING_OR_PRIVATE_SOURCE');
      check(source.verificationStatus === 'catalog_only' ||
        source.verificationStatus === 'code_reviewed', 'LAB_WRONG_VERIFICATION_LEVEL');
      referenced.add(id);
    }
  }
  check(referenced.size === result.sources.length, 'LAB_EXTRANEOUS_SOURCE');
  if (skill === 'Go' || skill === 'Django') {
    check(result.claims.length === 0 && result.sources.length === 0,
      'LAB_FABRICATED_SKILL');
  }
  if (skill === 'TypeScript' && result.claims.length === 1) {
    check(result.sources.length === 4, 'LAB_LOST_CLAIM_SOURCES');
  }
}
function expectStatus(skill: string, flags: Flags, hasRows: boolean): string {
  if (flags.mode === 'off') return 'canonical';
  if (!GRAPH_SUPPORTED.has(skill) || flags.failure === 'outage') return 'canonical_fallback';
  if (flags.failure !== 'none' && hasRows) return 'canonical_fallback';
  return 'graph_verified';
}
async function replay(
  adapter: EvidenceGraphRepository, canonical: EvidenceGraphRepository,
  decisions: LabShadowDecision[], flags: Flags,
): Promise<void> {
  let counted = 0;
  let verified = 0;
  let fallback = 0;
  for (const item of SCENARIOS) {
    const req = item.skills.map(requirement);
    const max = item.maxClaims ?? 20;
    const start = decisions.length;
    const actual = await adapter.findEvidence(req, { maxClaimsPerRequirement: max });
    const control = await canonical.findEvidence(req, { maxClaimsPerRequirement: max });
    check(JSON.stringify(actual) === JSON.stringify(control),
      'LAB_CANONICAL_ANSWER_CHANGED');
    const evaluations = decisions.slice(start);
    check(actual.length === req.length && evaluations.length === req.length,
      'LAB_MISSING_REQUIREMENT_RESULT');
    for (let i = 0; i < req.length; i++) {
      const result = actual[i]!;
      const skill = item.skills[i]!;
      const status = evaluations[i]?.status;
      verifiedResult(skill, result, max);
      check(status === expectStatus(skill, flags, result.claims.length > 0),
        'LAB_UNEXPECTED_GRAPH_DECISION');
      if (flags.requireGraph && GRAPH_SUPPORTED.has(skill)) {
        check(status === 'graph_verified', 'LAB_EXPECTED_GRAPH_VERIFICATION');
      }
      verified += Number(status === 'graph_verified');
      fallback += Number(status === 'canonical_fallback');
      counted++;
      console.log('RECRUITER_EVIDENCE', item.id, skill, status,
        'CLAIMS', result.claims.length, 'SOURCES', result.sources.length);
    }
  }
  console.log('RECRUITER_EVIDENCE_REPLAY', SCENARIOS.length,
    'SCENARIOS', counted, 'REQUIREMENTS', verified, 'VERIFIED', fallback, 'FALLBACK');
  console.log('RECRUITER_EVIDENCE_REPLAY_PASS');
}
async function checkSources(
  adapter: EvidenceGraphRepository, canonical: EvidenceGraphRepository,
  decisions: LabShadowDecision[], flags: Flags,
): Promise<void> {
  for (const id of SOURCE_IDS) {
    const start = decisions.length;
    const found = await adapter.getSource(id);
    const original = await canonical.getSource(id);
    check(JSON.stringify(found) === JSON.stringify(original),
      'LAB_SOURCE_CANONICAL_DRIFT');
    check(decisions.length === start + 1 &&
      decisions.at(-1)?.operation === 'getSource', 'LAB_SOURCE_DECISION_MISSING');
    const expected = flags.mode === 'off' ? 'canonical' :
      flags.failure === 'outage' || (flags.failure !== 'none' && found)
        ? 'canonical_fallback' : 'graph_verified';
    check(decisions.at(-1)?.status === expected, 'LAB_SOURCE_STATUS_WRONG');
    if (flags.requireGraph) check(decisions.at(-1)?.status === 'graph_verified',
      'LAB_SOURCE_GRAPH_REQUIRED');
  }
  console.log('RECRUITER_EVIDENCE_SOURCE_CHECKS', SOURCE_IDS.length, 'PASS');
}
async function main(): Promise<void> {
  const flags = args(process.argv.slice(2));
  const root = resolve(process.cwd());
  await assertLabCheckout(root);
  const fixture = await publicFixture(root);
  const canonical = canonicalRepository(fixture);
  const decisions: LabShadowDecision[] = [];
  const options = flags.mode === 'off'
    ? { mode: 'off' as const, onDecision: (d: LabShadowDecision) => decisions.push(d) }
    : { mode: 'shadow' as const, runKey: await approvedRun(flags.report!),
        transport: failureTransport(
          createHydraLabReadTransport(await readToken(flags.tokenFile!)), flags.failure),
        onDecision: (d: LabShadowDecision) => decisions.push(d) };
  const adapter = new HydraDbLabShadowEvidenceRepository(canonical, options);
  await replay(adapter, canonical, decisions, flags);
  await checkSources(adapter, canonical, decisions, flags);
  console.log('RECRUITER_EVIDENCE_GATE7_PASS');
}
main().catch((error: unknown) => {
  console.error('RECRUITER_EVIDENCE_GATE7_FAILED',
    error instanceof Error && error.message.startsWith('LAB_')
      ? error.message : 'INTERNAL_ERROR');
  process.exitCode = 1;
});
