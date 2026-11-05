/**
 * Gate 6: read-only HTTP integration proof for the isolated TypeScript
 * EvidenceGraphRepository shadow adapter.
 *
 * No Orbe API import, no graph writes, no LLM, and no DEV/MAIN state.
 * Reads ONLY the seven public PPKS records used in HydraDB LAB gate 3.
 */
import { execFileSync } from 'node:child_process';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  evidenceClaimSchema,
  evidenceSourceSchema,
  type EvidenceGraphRepository,
  type EvidenceClaim,
  type EvidenceSource,
  type VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';
import {
  HydraDbLabShadowEvidenceRepository,
  createHydraLabReadTransport,
  type LabShadowDecision,
} from './hydradb-lab-evidence-adapter.js';

const RECORDS = [
  ['experiences', 'experiencia-greencity'],
  ['experiences', 'experiencia-sig'],
  ['projects', 'greencity-os'],
  ['projects', 'hsp-simulator'],
  ['projects', 'phasscode-platform'],
  ['projects', 'web-portfolio-v2'],
  ['projects', 'webservice-springboot-jpa'],
] as const;

const SKILLS = ['Java', 'Flutter', 'TypeScript', 'Node.js', 'Go'] as const;
const SOURCES = [
  'phasscode-platform--ports',
  'phasscode-platform--catalog',
  'experiencia-sig--catalog',
  'web-portfolio-v2--tests',
  'missing-source-key',
] as const;

type Obj = Record<string, unknown>;
type EvidenceItem = { id: string; type: string };
type SkillItem = { name: string; evidenceIds: string[] };
type RecordFixture = {
  id: string;
  scope: EvidenceClaim['scope'];
  claims: EvidenceClaim[];
  sources: EvidenceSource[];
};
type Mode = 'off' | 'shadow';
type Cli = {
  mode: Mode;
  report?: string;
  tokenFile?: string;
  requireGraph: boolean;
};

function insist(condition: unknown, error: string): asserts condition {
  if (!condition) throw new Error(error);
}

/** On Node runtimes without Unix UID APIs, fail closed for private files. */
function currentUid(): number {
  const uid = process.getuid?.();
  insist(typeof uid === 'number' && Number.isSafeInteger(uid) && uid >= 0,
    'LAB_UNIX_UID_REQUIRED');
  return uid;
}

function object(value: unknown): Obj {
  insist(typeof value === 'object' && value !== null && !Array.isArray(value),
    'LAB_INVALID_PUBLIC_RECORD');
  return value as Obj;
}

function textField(value: unknown): string {
  insist(typeof value === 'string' && value.length > 0, 'LAB_INVALID_PUBLIC_FIELD');
  return value;
}

function stringArray(value: unknown): string[] {
  insist(Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    'LAB_INVALID_PUBLIC_STRING_ARRAY');
  return value as string[];
}

function argList(args: string[]): Cli {
  const values = new Map<string, string>();
  let requireGraph = false;
  for (let i = 0; i < args.length; i++) {
    const item = args[i];
    if (item === '--require-graph') {
      insist(!requireGraph, 'LAB_DUPLICATED_FLAG');
      requireGraph = true;
      continue;
    }
    insist(
      item === '--mode' || item === '--report' || item === '--token-file',
      'LAB_UNRECOGNIZED_ARGUMENT'
    );
    insist(!values.has(item), 'LAB_DUPLICATED_FLAG');
    const value = args[++i];
    insist(typeof value === 'string' && !value.startsWith('--'),
      'LAB_ARGUMENT_VALUE_REQUIRED');
    values.set(item, value);
  }
  const mode = values.get('--mode') ?? 'off';
  insist(mode === 'off' || mode === 'shadow', 'LAB_INVALID_MODE');
  insist(mode === 'shadow' || (!values.has('--report') && !values.has('--token-file')),
    'LAB_OFF_MUST_NOT_LOAD_TOKEN_OR_REPORT');
  insist(!requireGraph || mode === 'shadow', 'LAB_REQUIRE_GRAPH_NEEDS_SHADOW');
  if (mode === 'shadow') {
    insist(values.has('--report') && values.has('--token-file'),
      'LAB_SHADOW_REPORT_AND_TOKEN_REQUIRED');
  }
  const opts: Cli = { mode, requireGraph };
  const report = values.get('--report');
  const tokenFile = values.get('--token-file');
  if (report) opts.report = report;
  if (tokenFile) opts.tokenFile = tokenFile;
  return opts;
}

async function assertLabCheckout(root: string): Promise<void> {
  insist(
    execFileSync('git', ['branch', '--show-current'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === 'experiment/hydradb',
    'LAB_WRONG_BRANCH'
  );
  const envPath = join(root, '.env');
  const entry = await lstat(envPath);
  insist(entry.isFile() && !entry.isSymbolicLink(), 'LAB_ENV_FILE_INVALID');
  insist((entry.mode & 0o077) === 0, 'LAB_ENV_NOT_PRIVATE');
  const env = await readFile(envPath, 'utf8');
  insist(/^COMPOSE_PROJECT_NAME=phasscode-hydradb-lab\r?$/m.test(env),
    'LAB_PROJECT_NOT_ISOLATED');
  insist(/^PHASSCODE_HTTP_PORT=13003\r?$/m.test(env),
    'LAB_PORT_NOT_ISOLATED');
  insist(/^ORBE_GRAPHRAG_MODE=off\r?$/m.test(env),
    'LAB_ORBE_MUST_REMAIN_OFF');
}

function officialScope(data: Obj, directory: string): EvidenceClaim['scope'] {
  if (directory === 'experiences') {
    const areas = stringArray(data.areas);
    insist(areas.includes('software-development'), 'LAB_EXPERIENCE_NOT_SOFTWARE');
    return areas.includes('engineering') ? 'mixed_role' : 'professional';
  }
  const kind = object(data.identity).nature;
  const scopes: Record<string, EvidenceClaim['scope']> = {
    professional: 'professional_project', personal: 'personal_project',
    study: 'study',
  };
  return typeof kind === 'string' ? (scopes[kind] ?? 'unknown') : 'unknown';
}

async function publicFixture(root: string): Promise<RecordFixture[]> {
  const all: RecordFixture[] = [];
  for (const [directory, id] of RECORDS) {
    const filename = join(root, 'knowledge', 'ppks', directory, id + '.json');
    const data = object(JSON.parse(await readFile(filename, 'utf8')) as unknown);
    insist(data.id === id && data.kind === directory.slice(0, -1),
      'LAB_RECORD_IDENTITY_INVALID');
    if (directory === 'projects') {
      insist(object(data.identity).visibility === 'public',
        'LAB_PRIVATE_PROJECT_FORBIDDEN');
    }
    const scope = officialScope(data, directory);
    const sync = object(data.sync);
    insist(
      sync.verificationStatus === 'code_reviewed' ||
      sync.verificationStatus === 'catalog_only',
      'LAB_RECORD_STATUS_INVALID'
    );
    insist(Array.isArray(data.evidence) && Array.isArray(data.stack),
      'LAB_RECORD_EVIDENCE_MISSING');
    const declared = new Map<string, EvidenceItem>();
    for (const item of data.evidence) {
      const e = object(item);
      const key = textField(e.id);
      insist(/^[a-z0-9-]{1,80}$/.test(key) && !declared.has(key),
        'LAB_EVIDENCE_ID_INVALID');
      declared.set(key, { id: key, type: textField(e.type) });
    }
    const stack: SkillItem[] = data.stack.map((entry: unknown) => {
      const s = object(entry);
      return { name: textField(s.name), evidenceIds: stringArray(s.evidenceIds) };
    });
    insist(stack.length >= 2 && new Set(stack.map((s) => s.name)).size === stack.length,
      'LAB_SKILL_FIXTURE_INVALID');
    const claims: EvidenceClaim[] = [];
    const sources = new Map<string, EvidenceSource>();
    for (const tech of stack.slice(0, 2)) {
      insist(tech.evidenceIds.length > 0 &&
        new Set(tech.evidenceIds).size === tech.evidenceIds.length,
        'LAB_CLAIM_EVIDENCE_INVALID');
      const idSuffix = tech.name.normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      insist(idSuffix.length > 0, 'LAB_SKILL_IDENTIFIER_INVALID');
      const sourceIds: string[] = [];
      for (const evidenceId of [...tech.evidenceIds].sort()) {
        const item = declared.get(evidenceId);
        insist(item, 'LAB_CLAIM_UNKNOWN_SOURCE');
        const sourceId = `source-${id}-${evidenceId}`;
        sourceIds.push(sourceId);
        if (!sources.has(sourceId)) {
          const reviewed = sync.verificationStatus === 'code_reviewed' &&
            ['source_code', 'test', 'documentation'].includes(item.type);
          sources.set(sourceId, evidenceSourceSchema.parse({
            kind: 'source', id: sourceId, label: id + ': ' + evidenceId,
            visibility: 'public',
            verificationStatus: reviewed ? 'code_reviewed' : 'catalog_only',
            origin: reviewed ? 'github' : 'ppks_catalog',
          }));
        }
      }
      claims.push(evidenceClaimSchema.parse({
        kind: 'claim', id: `claim-${id}-skill-${idSuffix}`,
        label: id + ': ' + tech.name,
        subjectId: id, objectId: 'skill-' + idSuffix,
        predicate: 'USES_TECHNOLOGY', scope, sourceIds,
      }));
    }
    all.push({ id, scope, claims, sources: [...sources.values()] });
  }
  const names = new Set(all.flatMap((record) =>
    record.claims.map((claim) => claim.objectId)));
  const countSources = all.reduce((sum, record) => sum + record.sources.length, 0);
  const countEdges = all.reduce((sum, record) => sum +
    record.claims.reduce((s, c) => s + c.sourceIds.length + 2, 0), 0);
  insist(all.length === 7 && names.size === 10 &&
    all.reduce((s, r) => s + r.claims.length, 0) === 14 &&
    countSources === 16 && countEdges === 60,
    'LAB_PPKS_PUBLIC_FIXTURE_DRIFT');
  insist(
    all.find((record) => record.id === 'experiencia-greencity')?.scope === 'mixed_role' &&
    all.find((record) => record.id === 'experiencia-sig')?.scope === 'professional',
    'LAB_EXPERIENCE_SCOPE_DRIFT'
  );
  return all;
}

function canonicalRepository(records: RecordFixture[]): EvidenceGraphRepository {
  const bySource = new Map(records.flatMap((record) =>
    record.sources.map((source) => [source.id, source] as const)));
  return {
    async findEvidence(requirements, options) {
      const max = options?.maxClaimsPerRequirement ?? 5;
      insist(Number.isInteger(max) && max >= 1 && max <= 20,
        'LAB_INVALID_CLAIM_LIMIT');
      return requirements.map((requirement) => {
        const claims = records.flatMap((record) =>
          record.claims.filter((item) =>
            item.objectId === 'skill-' + requirement.label
              .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
              .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          )).slice(0, max);
        const selected = new Set(claims.flatMap((claim) => claim.sourceIds));
        return {
          requirementId: requirement.id, claims,
          sources: [...bySource.values()].filter((source) => selected.has(source.id)),
        };
      });
    },
    async getSource(sourceId) { return bySource.get(sourceId); },
  };
}

async function approvedRun(filename: string): Promise<string> {
  const candidate = resolve(filename);
  const parent = await realpath(dirname(candidate));
  const labHome = resolve(process.cwd(), '..');
  const allowed = [
    resolve('/lab-reports'),
    resolve(labHome, 'benchmarks'),
  ];
  insist(allowed.includes(parent) &&
    /^ppks-contract-\d{8}T\d{6}Z\.json$/.test(basename(candidate)),
    'LAB_REPORT_PATH_FORBIDDEN');
  const stat = await lstat(candidate);
  insist(stat.isFile() && !stat.isSymbolicLink() &&
    (stat.mode & 0o077) === 0 && stat.uid === currentUid(),
    'LAB_REPORT_NOT_PRIVATE');
  insist(stat.size > 0 && stat.size < 200_000, 'LAB_REPORT_INVALID_SIZE');
  const data = object(JSON.parse(await readFile(candidate, 'utf8')) as unknown);
  insist(data.scenario === 'ppks_claim_specific_source_contract' &&
    data.parity === 'PASS: parameterized claim-source retrieval in both LAB engines',
    'LAB_REPORT_NOT_APPROVED');
  const counts = object(data.counts);
  for (const [name, count] of Object.entries({
    records: 7, skills: 10, claims: 14, sources: 16, vertices: 47, edges: 60,
  })) insist(counts[name] === count, 'LAB_REPORT_COUNTS_INVALID');
  const run = data.lab_run;
  insist(typeof run === 'string' && /^[0-9]{10,20}$/.test(run),
    'LAB_REPORT_RUN_INVALID');
  return run;
}

async function readToken(filename: string): Promise<string> {
  const requested = resolve(filename);
  const labHome = resolve(process.cwd(), '..');
  insist(
    requested === '/run/secrets/hydradb_auth_token' ||
    requested === join(labHome, 'secrets', 'hydradb_auth_token'),
    'LAB_TOKEN_PATH_FORBIDDEN'
  );
  const stat = await lstat(requested);
  insist(stat.isFile() && !stat.isSymbolicLink() &&
    (stat.mode & 0o077) === 0 && stat.uid === currentUid(),
    'LAB_TOKEN_FILE_NOT_PRIVATE');
  const raw = (await readFile(requested, 'utf8')).trim();
  insist(raw.length >= 32 && raw.length <= 250, 'LAB_TOKEN_INVALID');
  return raw;
}

function requirement(name: string): VacancyRequirement {
  return {
    kind: 'vacancy_requirement',
    id: 'req-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label: name,
    mandatory: true,
  };
}

function comparable(value: unknown): string {
  // JSON.stringify(undefined) returns undefined rather than a string.
  return JSON.stringify(value) ?? 'undefined';
}

async function checkReader(
  repo: EvidenceGraphRepository,
  canonical: EvidenceGraphRepository,
  decisions: LabShadowDecision[],
  mode: Mode,
  requireGraph: boolean,
): Promise<void> {
  const requirements = SKILLS.map(requirement);
  const baseline = await canonical.findEvidence(requirements, {
    maxClaimsPerRequirement: 20,
  });
  const output = await repo.findEvidence(requirements, {
    maxClaimsPerRequirement: 20,
  });
  insist(comparable(output) === comparable(baseline),
    'LAB_SHADOW_CHANGED_CANONICAL_CLAIMS');
  for (let i = 0; i < SKILLS.length; i++) {
    const action = decisions[i];
    insist(action?.operation === 'findEvidence', 'LAB_SHADOW_MISSING_DECISION');
    const expected = mode === 'off' ? 'canonical' : 'graph_verified';
    if (requireGraph) insist(action.status === expected, 'LAB_GRAPH_VERIFICATION_FAILED');
    const count = output[i]?.claims.length ?? 0;
    const sources = output[i]?.sources.length ?? 0;
    console.log('TS_SHADOW_PROBE skill', SKILLS[i], action.status,
      'CLAIMS', count, 'SOURCES', sources);
  }
  for (const source of SOURCES) {
    const id = source === 'missing-source-key'
      ? 'source-phasscode-platform-missing-source-key'
      : 'source-' + source.replace('--', '-');
    const actual = await repo.getSource(id);
    const control = await canonical.getSource(id);
    insist(comparable(actual) === comparable(control),
      'LAB_SHADOW_CHANGED_CANONICAL_SOURCE');
    const latest = decisions.at(-1);
    insist(latest?.operation === 'getSource', 'LAB_SHADOW_MISSING_SOURCE_DECISION');
    if (requireGraph) insist(latest.status === 'graph_verified',
      'LAB_GRAPH_SOURCE_VERIFICATION_FAILED');
    console.log('TS_SHADOW_PROBE source', source, latest.status,
      'RESULTS', Number(actual !== undefined));
  }
  insist(decisions.length === SKILLS.length + SOURCES.length,
    'LAB_SHADOW_DECISION_COUNT_INVALID');
  console.log(mode === 'off' ? 'TS_SHADOW_OFF_CANONICAL_PASS' :
    'TS_SHADOW_HTTP_CANONICAL_SAFE');
  if (requireGraph) console.log('TS_SHADOW_HTTP_ALL_VERIFIED');
}

async function main(): Promise<void> {
  const flags = argList(process.argv.slice(2));
  const root = resolve(process.cwd());
  await assertLabCheckout(root);
  const fixture = await publicFixture(root);
  const canonical = canonicalRepository(fixture);
  const decisions: LabShadowDecision[] = [];
  if (flags.mode === 'off') {
    const repo = new HydraDbLabShadowEvidenceRepository(canonical, {
      mode: 'off', onDecision: (action) => decisions.push(action),
    });
    await checkReader(repo, canonical, decisions, flags.mode, flags.requireGraph);
    return;
  }
  const runKey = await approvedRun(flags.report!);
  const token = await readToken(flags.tokenFile!);
  const repo = new HydraDbLabShadowEvidenceRepository(canonical, {
    mode: 'shadow', runKey,
    transport: createHydraLabReadTransport(token),
    onDecision: (action) => decisions.push(action),
  });
  await checkReader(repo, canonical, decisions, flags.mode, flags.requireGraph);
}

main().catch((err: unknown) => {
  // Never echo exceptions from fs/network: they might contain file paths,
  // request parameters or credential material.
  console.error('TS_SHADOW_GATE_FAILED',
    err instanceof Error && err.message.startsWith('LAB_') ? err.message :
      'INTERNAL_ERROR');
  process.exitCode = 1;
});
