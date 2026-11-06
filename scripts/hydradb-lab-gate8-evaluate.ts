/**
 * Gate 8 / LAB ONLY: compare annotated requirements to draft public PPKS
 * reference and run the canonical, OFF, and optional real SHADOW read path.
 * This is NOT natural-language understanding, model/LLM evaluation,
 * independent gold accuracy, or a HydraDB performance benchmark.
 *
 * No app bootstrap, database writes, private data, HTTP except explicit
 * authenticated loopback SHADOW, or modifications to DEV/MAIN.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EvidenceGraphRepository, EvidenceSource } from '../apps/orbe-node/src/domain/evidence-graph.js';
import {
  HydraDbLabShadowEvidenceRepository,
  createHydraLabReadTransport,
  type LabShadowDecision,
} from './hydradb-lab-evidence-adapter.js';
import {
  approvedRun, assertLabCheckout, canonicalRepository, publicFixture,
  readToken, requirement,
} from './hydradb-lab-ts-live-check.js';
import {
  aggregateGate8Scores, scoreGate8Evidence,
  type Gate8ReferenceClaim, type Gate8ReferenceSources,
  type Gate8Score,
} from './hydradb-lab-gate8-score.js';

type Mode = 'off' | 'shadow';
type Options = {
  mode: Mode;
  report?: string;
  tokenFile?: string;
  requireGraph: boolean;
};
type DraftCase = {
  id: string;
  origin: 'synthetic';
  question: string;
  expectedSkills: string[];
  riskTags: string[];
};
type DraftCorpus = {
  schemaVersion: number;
  state: string;
  knownClaims: Record<string, Gate8ReferenceClaim[]>;
  knownSourceEvidence: Record<string, Gate8ReferenceSources[]>;
  cases: DraftCase[];
};
type CaseResult = Readonly<{
  id: string;
  skills: readonly string[];
  statuses: readonly string[];
  exact: boolean;
}>;

const GRAPH_SUPPORTED = new Set(['Java', 'Flutter', 'TypeScript', 'Node.js', 'Go']);
function check(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
function flags(args: readonly string[]): Options {
  const values = new Map<string, string>();
  let requireGraph = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--require-graph') {
      check(!requireGraph, 'LAB_GATE8_DUPLICATED_FLAG');
      requireGraph = true;
      continue;
    }
    check(flag === '--mode' || flag === '--report' || flag === '--token-file',
      'LAB_GATE8_INVALID_FLAG');
    check(!values.has(flag), 'LAB_GATE8_DUPLICATED_FLAG');
    const value = args[++i];
    check(typeof value === 'string' && value.length > 0 && !value.startsWith('--'),
      'LAB_GATE8_FLAG_VALUE_REQUIRED');
    values.set(flag, value);
  }
  const mode = values.get('--mode') ?? 'off';
  check(mode === 'off' || mode === 'shadow', 'LAB_GATE8_INVALID_MODE');
  if (mode === 'off') {
    check(!values.has('--report') && !values.has('--token-file') && !requireGraph,
      'LAB_GATE8_OFF_MUST_NOT_LOAD_SHADOW_SECRETS');
  } else {
    check(values.has('--report') && values.has('--token-file'),
      'LAB_GATE8_SHADOW_NEEDS_REPORT_AND_TOKEN');
  }
  return {
    mode,
    report: values.get('--report'),
    tokenFile: values.get('--token-file'),
    requireGraph,
  };
}

function parseDraft(raw: string): DraftCorpus {
  const data = JSON.parse(raw) as DraftCorpus;
  check(data !== null && typeof data === 'object' && !Array.isArray(data) &&
    data.schemaVersion === 1 && data.state === 'draft_requires_independent_review',
    'LAB_GATE8_DRAFT_REFERENCE_REQUIRED');
  check(data.knownClaims && typeof data.knownClaims === 'object' &&
    data.knownSourceEvidence && typeof data.knownSourceEvidence === 'object' &&
    Array.isArray(data.cases) && data.cases.length === 20,
    'LAB_GATE8_INVALID_DRAFT_REFERENCE');
  const keys = Object.keys(data.knownClaims).sort();
  check(keys.length === 10 &&
    JSON.stringify(keys) === JSON.stringify(Object.keys(data.knownSourceEvidence).sort()),
    'LAB_GATE8_SKILL_REGISTRY_DRIFT');
  const ids = new Set<string>();
  for (const item of data.cases) {
    check(typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) &&
      !ids.has(item.id) && item.origin === 'synthetic' &&
      typeof item.question === 'string' && Array.isArray(item.expectedSkills) &&
      item.expectedSkills.length > 0 && item.expectedSkills.length <= 3 &&
      new Set(item.expectedSkills).size === item.expectedSkills.length &&
      item.expectedSkills.every((skill) => keys.includes(skill)) &&
      Array.isArray(item.riskTags), 'LAB_GATE8_CASE_INVALID');
    ids.add(item.id);
  }
  return data;
}

async function createRepo(
  canonical: EvidenceGraphRepository, opts: Options,
  events: LabShadowDecision[],
): Promise<EvidenceGraphRepository> {
  if (opts.mode === 'off') return new HydraDbLabShadowEvidenceRepository(canonical, {
    mode: 'off', onDecision: (event) => events.push(event),
  });
  const runKey = await approvedRun(opts.report!);
  const token = await readToken(opts.tokenFile!);
  return new HydraDbLabShadowEvidenceRepository(canonical, {
    mode: 'shadow', runKey, transport: createHydraLabReadTransport(token),
    onDecision: (event) => events.push(event),
  });
}

function checkDecision(skill: string, event: LabShadowDecision | undefined, opts: Options): string {
  check(event?.operation === 'findEvidence', 'LAB_GATE8_MISSING_FIND_DECISION');
  if (opts.mode === 'off') {
    check(event.status === 'canonical', 'LAB_GATE8_OFF_NOT_CANONICAL');
  } else if (!GRAPH_SUPPORTED.has(skill)) {
    check(event.status === 'canonical_fallback' &&
      event.reason === 'UNSUPPORTED_PUBLIC_FIXTURE',
      'LAB_GATE8_UNEXPECTED_UNSUPPORTED_STATUS');
  } else {
    check(event.status === 'graph_verified' ||
      (!opts.requireGraph && event.status === 'canonical_fallback'),
    'LAB_GATE8_GRAPH_NOT_VERIFIED');
  }
  return event.status;
}

async function main(): Promise<void> {
  const opts = flags(process.argv.slice(2));
  const root = resolve(process.cwd());
  await assertLabCheckout(root);
  const bytes = await readFile(resolve(root,
    'knowledge/evaluations/hydradb-gate8-recruiter.json'));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const draft = parseDraft(bytes.toString('utf8'));
  const fixture = await publicFixture(root);
  const canonical = canonicalRepository(fixture);
  const decisions: LabShadowDecision[] = [];
  const adapter = await createRepo(canonical, opts, decisions);

  const baselineScores: Gate8Score[] = [];
  const adapterScores: Gate8Score[] = [];
  const cases: CaseResult[] = [];
  for (const item of draft.cases) {
    const requirements = item.expectedSkills.map(requirement);
    const originals = await canonical.findEvidence(requirements, {
      maxClaimsPerRequirement: 20,
    });
    const start = decisions.length;
    const actual = await adapter.findEvidence(requirements, {
      maxClaimsPerRequirement: 20,
    });
    const currentEvents = decisions.slice(start);
    check(originals.length === requirements.length &&
      actual.length === originals.length &&
      currentEvents.length === requirements.length,
    'LAB_GATE8_REQUIREMENT_CARDINALITY');
    const statuses: string[] = [];
    for (let i = 0; i < requirements.length; i++) {
      const skill = item.expectedSkills[i]!;
      const original = originals[i]!;
      const observed = actual[i]!;
      check(original.requirementId === requirements[i]!.id &&
        observed.requirementId === requirements[i]!.id,
      'LAB_GATE8_REQUIREMENT_ID_DRIFT');
      const expectedClaims = draft.knownClaims[skill];
      const expectedSources = draft.knownSourceEvidence[skill];
      check(Array.isArray(expectedClaims) && Array.isArray(expectedSources),
        'LAB_GATE8_MISSING_REFERENCE');
      const baseScore = scoreGate8Evidence(expectedClaims, expectedSources, original);
      const candidateScore = scoreGate8Evidence(expectedClaims, expectedSources, observed);
      baselineScores.push(baseScore);
      adapterScores.push(candidateScore);
      check(baseScore.exact, 'LAB_GATE8_CANONICAL_REFERENCE_DRIFT');
      check(candidateScore.exact &&
        JSON.stringify(observed) === JSON.stringify(original),
      'LAB_GATE8_ADAPTER_REFERENCE_DRIFT');
      statuses.push(checkDecision(skill, currentEvents[i], opts));
    }
    cases.push({ id: item.id, skills: item.expectedSkills, statuses, exact: true });
  }

  // Verify the 16 distinct reference sources, including code-vs-catalog
  // verification levels; never collect or log token or source payload.
  const sources = new Map<string, EvidenceSource>();
  for (const records of Object.values(draft.knownSourceEvidence)) {
    for (const record of records) {
      for (const entry of record.sources) {
        const previous = sources.get(entry.id);
        if (previous) {
          check(previous.verificationStatus === entry.verificationStatus &&
            previous.origin === entry.origin,
          'LAB_GATE8_CONFLICTING_SOURCE_REFERENCE');
        }
        sources.set(entry.id, {
          kind: 'source', id: entry.id, label: entry.id,
          visibility: 'public', verificationStatus: entry.verificationStatus,
          origin: entry.origin,
        });
      }
    }
  }
  check(sources.size === 16, 'LAB_GATE8_SOURCE_REFERENCE_COUNT_DRIFT');
  const sourceStatuses: Record<string, number> = {};
  for (const [id, expected] of sources) {
    const canonicalSource = await canonical.getSource(id);
    check(canonicalSource?.visibility === 'public' &&
      canonicalSource.verificationStatus === expected.verificationStatus &&
      canonicalSource.origin === expected.origin,
    'LAB_GATE8_CANONICAL_SOURCE_REFERENCE_DRIFT');
    const start = decisions.length;
    const observed = await adapter.getSource(id);
    check(decisions.length === start + 1 &&
      decisions[start]?.operation === 'getSource' &&
      JSON.stringify(observed) === JSON.stringify(canonicalSource),
    'LAB_GATE8_ADAPTER_SOURCE_CHANGED');
    const status = decisions[start]!.status;
    if (opts.requireGraph) check(status === 'graph_verified',
      'LAB_GATE8_SOURCE_GRAPH_NOT_VERIFIED');
    if (opts.mode === 'off') check(status === 'canonical',
      'LAB_GATE8_OFF_SOURCE_NOT_CANONICAL');
    sourceStatuses[status] = (sourceStatuses[status] ?? 0) + 1;
  }
  const baseline = aggregateGate8Scores(baselineScores);
  const adapterResult = aggregateGate8Scores(adapterScores);
  check(baseline.allExact && adapterResult.allExact,
    'LAB_GATE8_NOT_EXACT_AGAINST_DRAFT_REFERENCE');

  const reasons: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const event of decisions) {
    reasons[event.reason] = (reasons[event.reason] ?? 0) + 1;
    statuses[event.status] = (statuses[event.status] ?? 0) + 1;
  }
  const report = {
    schemaVersion: 1,
    evidenceType: 'draft_public_fixture_agreement_only',
    goldReviewed: false,
    nlpEvaluation: false,
    llmEvaluation: false,
    hydraDbPerformanceBenchmark: false,
    mode: opts.mode,
    corpusSha256: digest,
    cases: cases.length,
    requirementCount: adapterResult.requirements,
    sourceLookups: sources.size,
    baseline,
    candidate: adapterResult,
    decisions: { statuses, reasons, sourceStatuses },
    caseResults: cases,
    incrementalSemanticGain: 'not_measured',
  };
  console.log('GATE8_DRAFT_REFERENCE_EVAL_JSON', JSON.stringify(report));
  console.log('GATE8_DRAFT_REFERENCE_RETRIEVAL_PASS');
  if (opts.mode === 'shadow') {
    console.log('GATE8_SHADOW_CANONICAL_PARITY_PASS');
    if (opts.requireGraph) console.log('GATE8_SHADOW_SUPPORTED_FIXTURE_VERIFIED_PASS');
  }
  console.log('GATE8_INDEPENDENT_GOLD_REVIEW_REQUIRED');
  console.log('GATE8_NO_INCREMENTAL_SEMANTIC_GAIN_DEMONSTRATED');
}

main().catch((error: unknown) => {
  console.error('GATE8_DRAFT_REFERENCE_EVAL_FAILED',
    error instanceof Error && error.message.startsWith('LAB_')
      ? error.message : 'INTERNAL_ERROR');
  process.exitCode = 1;
});
