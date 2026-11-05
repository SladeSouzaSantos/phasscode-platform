/**
 * Lab-only, read-only experimental HydraDB shadow adapter.
 *
 * Implements the Orbe EvidenceGraphRepository contract but intentionally has
 * NO imports from the app bootstrap, routing, or configuration. No API wiring,
 * no implicit activation, and no graph writes. The canonical repository
 * (sourced from PPKS) always owns the response; HydraDB may only verify it.
 *
 * Supported corpus is the public 7-record, two-skills-per-record LAB fixture.
 * This is NOT a replacement for the production OrbeEvidence projection.
 */
import {
  evidenceClaimSchema,
  evidenceSourceSchema,
  vacancyRequirementSchema,
  type EvidenceClaim,
  type EvidenceGraphMatch,
  type EvidenceGraphRepository,
  type EvidenceSource,
  type VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

export const hydraLabFindCypher = [
  'MATCH (s:Skill)<-[:USES_TECHNOLOGY]-(c:Claim)-[:SUPPORTED_BY]->(src:Source)',
  'WHERE s.normalized_name = $skill AND s.lab_run = $run',
  'RETURN c.record_key AS record, c.scope AS scope,',
  'src.source_key AS source, src.verification AS verification,',
  'src.origin AS origin ORDER BY record, source',
].join(' ');

export const hydraLabSourceCypher = [
  'MATCH (src:Source) WHERE src.source_key = $source AND src.lab_run = $run',
  'RETURN src.source_key AS source,',
  'src.verification AS verification, src.origin AS origin LIMIT 1',
].join(' ');

type LabReadCypher = typeof hydraLabFindCypher | typeof hydraLabSourceCypher;
type Rows = readonly (readonly string[])[];
type SafeStatus = 'canonical' | 'graph_verified' | 'canonical_fallback';
export type LabShadowDecision = Readonly<{
  operation: 'findEvidence' | 'getSource';
  status: SafeStatus;
  reason: 'OFF' | 'MATCH' | 'INCOMPLETE_CANONICAL' | 'UNSUPPORTED_PUBLIC_FIXTURE' | 'UNAVAILABLE_OR_MISMATCH';
}>;

export interface HydraLabReadTransport {
  /** Only two predefined, parameterized read queries are allowed. */
  read(query: LabReadCypher, params: Readonly<Record<string, string>>): Promise<unknown>;
}

type LabShadowOptions =
  | Readonly<{ mode: 'off'; onDecision?: (decision: LabShadowDecision) => void }>
  | Readonly<{
      mode: 'shadow';
      runKey: string;
      transport: HydraLabReadTransport;
      onDecision?: (decision: LabShadowDecision) => void;
    }>;

/** Only the same publicly declared PPKS records as in the isolated Python LAB. */
const LAB_RECORDS = [
  'experiencia-greencity',
  'experiencia-sig',
  'greencity-os',
  'hsp-simulator',
  'phasscode-platform',
  'web-portfolio-v2',
  'webservice-springboot-jpa',
] as const;

const LAB_SKILLS = new Set(['java', 'flutter', 'typescript', 'node.js', 'go']);
const FIND_COLUMNS = ['record', 'scope', 'source', 'verification', 'origin'];
const SOURCE_COLUMNS = ['source', 'verification', 'origin'];

function labSourceKey(id: string): string | undefined {
  for (const record of LAB_RECORDS) {
    const prefix = `source-${record}-`;
    if (!id.startsWith(prefix)) continue;
    const evidenceId = id.slice(prefix.length);
    if (/^[a-z0-9-]{1,80}$/.test(evidenceId)) return `${record}--${evidenceId}`;
  }
  return undefined;
}

function decodeRows(result: unknown, columns: readonly string[]): Rows {
  if (typeof result !== 'object' || result === null) throw new Error('LAB_GRAPH_INVALID_RESPONSE');
  const shape = result as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(shape.columns) || shape.columns.length !== columns.length) {
    throw new Error('LAB_GRAPH_INVALID_COLUMNS');
  }
  if (!shape.columns.every((name, i) => name === columns[i])) {
    throw new Error('LAB_GRAPH_INVALID_COLUMNS');
  }
  if (!Array.isArray(shape.rows) || shape.rows.length > 1000) {
    throw new Error('LAB_GRAPH_INVALID_ROWS');
  }
  return shape.rows.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error('LAB_GRAPH_INVALID_ROW');
    }
    return row.map((item: unknown) => {
      if (
        typeof item !== 'object' || item === null ||
        (item as { type?: unknown }).type !== 'string' ||
        typeof (item as { value?: unknown }).value !== 'string'
      ) {
        throw new Error('LAB_GRAPH_INVALID_VALUE');
      }
      return (item as { value: string }).value;
    });
  });
}

function sameMultiset(actual: Rows, expected: Rows): boolean {
  const canonicalize = (rows: Rows): string[] =>
    rows.map((row) => JSON.stringify(row)).sort();
  const a = canonicalize(actual);
  const b = canonicalize(expected);
  return a.length === b.length && a.every((row, i) => row === b[i]);
}

function cleanMatch(match: EvidenceGraphMatch, limit: number): EvidenceGraphMatch {
  const sources = new Map<string, EvidenceSource>();
  for (const source of match.sources) {
    const parsed = evidenceSourceSchema.safeParse(source);
    if (parsed.success) sources.set(parsed.data.id, parsed.data);
  }
  const claims: EvidenceClaim[] = [];
  const used = new Map<string, EvidenceSource>();
  for (const item of match.claims) {
    const parsed = evidenceClaimSchema.safeParse(item);
    if (!parsed.success || !parsed.data.sourceIds.every((id) => sources.has(id))) continue;
    if (claims.length >= limit) break;
    claims.push(parsed.data);
    for (const id of parsed.data.sourceIds) used.set(id, sources.get(id)!);
  }
  return {
    requirementId: match.requirementId,
    claims,
    sources: [...used.values()],
  };
}

function expectedEvidenceRows(match: EvidenceGraphMatch): Rows | undefined {
  const sources = new Map(match.sources.map((source) => [source.id, source]));
  const rows: string[][] = [];
  if (match.claims.length >= 20) return undefined; // canonical query may be truncated
  for (const claim of match.claims) {
    if (
      claim.predicate !== 'USES_TECHNOLOGY' ||
      !LAB_RECORDS.some((record) => record === claim.subjectId) ||
      claim.sourceIds.length === 0
    ) return undefined;
    for (const sourceId of claim.sourceIds) {
      const source = sources.get(sourceId);
      const key = labSourceKey(sourceId);
      if (
        !key || !source || source.visibility !== 'public' ||
        !evidenceSourceSchema.safeParse(source).success
      ) return undefined;
      if (!key.startsWith(`${claim.subjectId}--`)) return undefined;
      rows.push([
        claim.subjectId, claim.scope, key,
        source.verificationStatus, source.origin,
      ]);
    }
  }
  return rows;
}

/**
 * A passive verifier: it always returns canonical PPKS data (or a safe
 * source-complete subset), whether HydraDB is working or not.
 */
export class HydraDbLabShadowEvidenceRepository implements EvidenceGraphRepository {
  constructor(
    private readonly canonical: EvidenceGraphRepository,
    private readonly options: LabShadowOptions = { mode: 'off' },
  ) {
    if (options.mode === 'shadow') {
      if (!/^[0-9]{10,20}$/.test(options.runKey)) {
        throw new Error('LAB_INVALID_RUN_KEY');
      }
      if (!options.transport || typeof options.transport.read !== 'function') {
        throw new Error('LAB_READ_TRANSPORT_REQUIRED');
      }
    }
  }

  private decision(decision: LabShadowDecision): void {
    // The event contains no requirement text, source id, query, error body or token.
    try { this.options.onDecision?.(decision); } catch { /* telemetry is non-critical */ }
  }

  async findEvidence(
    requirements: readonly VacancyRequirement[],
    options: { maxClaimsPerRequirement?: number } = {},
  ): Promise<readonly EvidenceGraphMatch[]> {
    for (const req of requirements) vacancyRequirementSchema.parse(req);
    const limitInput = options.maxClaimsPerRequirement ?? 5;
    const limit = Number.isFinite(limitInput)
      ? Math.min(20, Math.max(1, Math.trunc(limitInput)))
      : 5;
    // Retrieve the full bounded canonical cohort before applying caller's
    // claim limit; NEVER limit graph source rows before provenance verification.
    const originals = await this.canonical.findEvidence(requirements, {
      maxClaimsPerRequirement: 20,
    });
    if (originals.length !== requirements.length) {
      throw new Error('LAB_CANONICAL_RESULT_COUNT_INVALID');
    }
    const result: EvidenceGraphMatch[] = [];
    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i]!;
      const original = originals[i]!;
      if (original.requirementId !== req.id) {
        throw new Error('LAB_CANONICAL_REQUIREMENT_ID_MISMATCH');
      }
      const clean = cleanMatch(original, limit);
      result.push(clean);
      if (this.options.mode === 'off') {
        this.decision({ operation: 'findEvidence', status: 'canonical', reason: 'OFF' });
        continue;
      }
      const skill = req.label.normalize('NFKD').toLowerCase().trim();
      if (!LAB_SKILLS.has(skill)) {
        this.decision({
          operation: 'findEvidence', status: 'canonical_fallback',
          reason: 'UNSUPPORTED_PUBLIC_FIXTURE',
        });
        continue;
      }
      const expected = expectedEvidenceRows(original);
      if (!expected || clean.claims.length < Math.min(limit, original.claims.length)) {
        this.decision({
          operation: 'findEvidence', status: 'canonical_fallback',
          reason: 'INCOMPLETE_CANONICAL',
        });
        continue;
      }
      try {
        const response = await this.options.transport.read(hydraLabFindCypher, {
          skill, run: this.options.runKey,
        });
        if (!sameMultiset(decodeRows(response, FIND_COLUMNS), expected)) {
          throw new Error('LAB_GRAPH_MISMATCH');
        }
        this.decision({ operation: 'findEvidence', status: 'graph_verified', reason: 'MATCH' });
      } catch {
        this.decision({
          operation: 'findEvidence', status: 'canonical_fallback',
          reason: 'UNAVAILABLE_OR_MISMATCH',
        });
      }
    }
    return result;
  }

  async getSource(sourceId: string): Promise<EvidenceSource | undefined> {
    if (!/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/.test(sourceId)) {
      throw new Error('LAB_INVALID_SOURCE_ID');
    }
    const canonicalSource = await this.canonical.getSource(sourceId);
    if (this.options.mode === 'off') {
      this.decision({ operation: 'getSource', status: 'canonical', reason: 'OFF' });
      return canonicalSource;
    }
    const key = labSourceKey(sourceId);
    if (!key || canonicalSource?.visibility === 'private' ||
        canonicalSource?.visibility === 'third_party') {
      this.decision({
        operation: 'getSource', status: 'canonical_fallback',
        reason: 'UNSUPPORTED_PUBLIC_FIXTURE',
      });
      return canonicalSource;
    }
    if (canonicalSource && !evidenceSourceSchema.safeParse(canonicalSource).success) {
      this.decision({
        operation: 'getSource', status: 'canonical_fallback',
        reason: 'INCOMPLETE_CANONICAL',
      });
      return undefined;
    }
    const expected: Rows = canonicalSource
      ? [[key, canonicalSource.verificationStatus, canonicalSource.origin]]
      : [];
    try {
      const response = await this.options.transport.read(hydraLabSourceCypher, {
        source: key, run: this.options.runKey,
      });
      if (!sameMultiset(decodeRows(response, SOURCE_COLUMNS), expected)) {
        throw new Error('LAB_GRAPH_MISMATCH');
      }
      this.decision({ operation: 'getSource', status: 'graph_verified', reason: 'MATCH' });
    } catch {
      this.decision({
        operation: 'getSource', status: 'canonical_fallback',
        reason: 'UNAVAILABLE_OR_MISMATCH',
      });
    }
    return canonicalSource;
  }
}

/** Fixed-loopback HTTP transport for lab use only; never use this in an app service. */
export function createHydraLabReadTransport(
  token: string, fetcher: typeof fetch = fetch,
): HydraLabReadTransport {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('LAB_MISSING_GRAPH_TOKEN');
  }
  const url = 'http://127.0.0.1:18443/v1/graphs/lab/query';
  return {
    async read(query, params): Promise<unknown> {
      if (query !== hydraLabFindCypher && query !== hydraLabSourceCypher) {
        throw new Error('LAB_UNAPPROVED_CYPHER');
      }
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-graph-namespace': 'lab',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cell_id: 'cell-0', query, parameters: params, timeout_ms: 5000 }),
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error('LAB_GRAPH_HTTP_FAILURE');
      const payload = await response.text();
      if (payload.length > 1_000_000) throw new Error('LAB_GRAPH_OVERSIZED_RESPONSE');
      return JSON.parse(payload) as unknown;
    },
  };
}
