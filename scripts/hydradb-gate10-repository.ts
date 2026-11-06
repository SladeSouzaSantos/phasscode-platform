/**
 * LAB-ONLY: first functional, read-only HydraDB implementation of Orbe's
 * EvidenceGraphRepository port for SYNTHETIC PUBLIC Gate 10 claim/source data.
 *
 * This module is not imported by the Orbe application and cannot be used as
 * a drop-in production adapter. Query strings are fixed, the HTTP path is
 * bound to runner loopback, and the canonical PPKS is still authoritative.
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

export const gate10FindQuery = [
  'MATCH (s:Skill)<-[:USES_TECHNOLOGY]-(c:Claim)-[:SUPPORTED_BY]->(src:Source)',
  'WHERE s.normalized_name = $skill AND s.lab_run = $run',
  'RETURN c.payload AS claim, src.payload AS source ORDER BY claim, source',
].join(' ');

export const gate10SourceQuery = [
  'MATCH (src:Source) WHERE src.source_key = $source AND src.lab_run = $run',
  'RETURN src.payload AS source LIMIT 1',
].join(' ');
type Query = typeof gate10FindQuery | typeof gate10SourceQuery;

export type Gate10Transport = Readonly<{
  read(query: Query, params: Readonly<Record<string, string>>): Promise<unknown>;
}>;

function check(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function decodeRows(raw: unknown, columns: readonly string[]): string[][] {
  check(raw !== null && typeof raw === 'object' && !Array.isArray(raw),
    'GATE10_INVALID_ENVELOPE');
  const input = raw as { columns?: unknown; rows?: unknown; error?: unknown; errors?: unknown };
  check(input.error === undefined && input.errors === undefined,
    'GATE10_ENGINE_ERROR');
  check(Array.isArray(input.columns) && input.columns.length === columns.length
    && input.columns.every((value, i) => value === columns[i]),
    'GATE10_COLUMNS_MISMATCH');
  check(Array.isArray(input.rows) && input.rows.length <= 500,
    'GATE10_RESPONSE_TOO_LARGE');
  return input.rows.map((r: unknown) => {
    check(Array.isArray(r) && r.length === columns.length, 'GATE10_ROW_INVALID');
    return r.map((cell: unknown) => {
      check(cell !== null && typeof cell === 'object' &&
        (cell as { type?: unknown }).type === 'string' &&
        typeof (cell as { value?: unknown }).value === 'string',
        'GATE10_VALUE_INVALID');
      return (cell as { value: string }).value;
    });
  });
}

function decodePayload(value: string): unknown {
  check(value.length > 0 && value.length <= 16384 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value),
    'GATE10_PAYLOAD_INVALID');
  const bytes = Buffer.from(value, 'base64');
  check(bytes.toString('base64') === value, 'GATE10_PAYLOAD_INVALID');
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('GATE10_JSON_INVALID');
  }
}

const LAB_APPROVED_SKILLS = new Set([
  'java', 'flutter', 'go', 'hibernate', 'dart', 'python', 'fastapi',
  'node.js', 'typescript', 'react', 'spring boot',
]);
function normalizeSkill(label: string): string {
  const normalized = label.trim().toLowerCase();
  check(LAB_APPROVED_SKILLS.has(normalized),
    'GATE10_SKILL_NOT_IN_PUBLIC_LAB_FIXTURES');
  return normalized;
}
function canonicalSkillId(label: string): string {
  return 'skill-' + label.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const ALLOWED_SCOPES = new Set([
  'professional', 'mixed_role', 'professional_project',
  'personal_project', 'study',
]);

/**
 * Prove source completeness before applying the claims limit.
 * An incomplete claim is an error rather than silently claimed evidence.
 */
export class Gate10HydraEvidenceRepository implements EvidenceGraphRepository {
  constructor(
    private readonly readTransport: Gate10Transport,
    private readonly run: string,
  ) {
    check(/^[0-9]{8,20}$/.test(run), 'GATE10_BAD_RUN');
    check(typeof readTransport?.read === 'function', 'GATE10_TRANSPORT_REQUIRED');
  }

  async findEvidence(
    requirements: readonly VacancyRequirement[],
    options: { maxClaimsPerRequirement?: number } = {},
  ): Promise<readonly EvidenceGraphMatch[]> {
    const limitInput = options.maxClaimsPerRequirement ?? 5;
    check(typeof limitInput === 'number' && Number.isSafeInteger(limitInput),
      'GATE10_BAD_LIMIT');
    const limit = Math.min(20, Math.max(1, limitInput));
    const result: EvidenceGraphMatch[] = [];
    for (const rawRequirement of requirements) {
      const req = vacancyRequirementSchema.parse(rawRequirement);
      const skill = normalizeSkill(req.label);
      const rows = decodeRows(await this.readTransport.read(gate10FindQuery, {
        run: this.run, skill,
      }), ['claim','source']);
      const claims = new Map<string, EvidenceClaim>();
      const linked = new Map<string, Map<string, EvidenceSource>>();
      const pairIds = new Set<string>();
      for (const [encodedClaim, encodedSource] of rows) {
        const claim = evidenceClaimSchema.parse(decodePayload(encodedClaim!));
        const source = evidenceSourceSchema.parse(decodePayload(encodedSource!));
        check(claim.predicate === 'USES_TECHNOLOGY' &&
          claim.objectId === canonicalSkillId(req.label) &&
          claim.sourceIds.includes(source.id) &&
          source.visibility === 'public',
          'GATE10_UNTRUSTED_GRAPH_EDGE');
        // Match the original Neo4j adapter's Cypher scope whitelist. In
        // particular, UNKNOWN does not become recruiter-facing evidence.
        if (!ALLOWED_SCOPES.has(claim.scope)) continue;
        const pair = claim.id + '|' + source.id;
        check(!pairIds.has(pair), 'GATE10_DUPLICATE_GRAPH_EDGE');
        pairIds.add(pair);
        const prior = claims.get(claim.id);
        check(!prior || JSON.stringify(prior) === JSON.stringify(claim),
          'GATE10_CLAIM_DRIFT');
        claims.set(claim.id, claim);
        const group = linked.get(claim.id) ?? new Map<string, EvidenceSource>();
        group.set(source.id, source);
        linked.set(claim.id, group);
      }
      const selected = [...claims.values()].sort((a,b)=>a.id.localeCompare(b.id))
        .slice(0, limit);
      const sources = new Map<string, EvidenceSource>();
      for (const claim of selected) {
        const group = linked.get(claim.id);
        check(group !== undefined && group.size === claim.sourceIds.length &&
          claim.sourceIds.every(id => group.has(id)),
          'GATE10_INCOMPLETE_CLAIM_SOURCES');
        for (const id of claim.sourceIds) {
          const candidate = group.get(id)!;
          const existing = sources.get(id);
          check(!existing || JSON.stringify(existing) === JSON.stringify(candidate),
            'GATE10_SOURCE_DRIFT');
          sources.set(id, candidate);
        }
      }
      result.push({
        requirementId: req.id,
        claims: selected,
        sources: [...sources.values()].sort((a,b)=>a.id.localeCompare(b.id)),
      });
    }
    return result;
  }

  async getSource(sourceId: string): Promise<EvidenceSource | undefined> {
    check(/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/.test(sourceId),
      'GATE10_BAD_SOURCE_ID');
    const rows = decodeRows(await this.readTransport.read(gate10SourceQuery, {
      run: this.run, source: sourceId,
    }), ['source']);
    check(rows.length <= 1, 'GATE10_DUPLICATE_SOURCE');
    if (rows.length === 0) return undefined;
    const source = evidenceSourceSchema.parse(decodePayload(rows[0]![0]!));
    check(source.id === sourceId && source.visibility === 'public',
      'GATE10_SOURCE_ID_MISMATCH');
    return source;
  }
}

/**
 * Isolated GitHub-hosted-only HTTP client. No default endpoints other than
 * fixed loopback, no production config, no automatic credential discovery.
 */
export function createGate10EphemeralHttpTransport(
  token: string, fetcher: typeof fetch = fetch,
): Gate10Transport {
  check(process.env.GATE10_ISOLATION_MODE === 'github_hosted_ephemeral' &&
    process.env.GITHUB_REPOSITORY === 'SladeSouzaSantos/phasscode-platform' &&
    process.env.GITHUB_REF === 'refs/heads/experiment/hydradb' &&
    /^[0-9]+$/.test(process.env.GITHUB_RUN_ID ?? ''),
    'GATE10_EPHEMERAL_ONLY');
  check(typeof token === 'string' && token.length >= 32, 'GATE10_TOKEN_REQUIRED');
  return {
    async read(query, params) {
      check(query === gate10FindQuery || query === gate10SourceQuery,
        'GATE10_UNAPPROVED_QUERY');
      const response = await fetcher(
        'http://127.0.0.1:18443/v1/graphs/lab/query', {
          method: 'POST',
          headers: {
            'authorization': 'Bearer ' + token,
            'x-graph-namespace': 'lab',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            cell_id: 'cell-0', query, parameters: params, timeout_ms: 10000,
          }),
          signal: AbortSignal.timeout(12000),
        });
      check(response.ok, 'GATE10_HTTP_REJECTED');
      const body = await response.text();
      check(body.length <= 500000, 'GATE10_HTTP_TOO_LARGE');
      return JSON.parse(body) as unknown;
    },
  };
}
