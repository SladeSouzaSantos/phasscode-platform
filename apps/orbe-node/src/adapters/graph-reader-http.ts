import { z } from 'zod';
import {
  evidenceClaimSchema,
  evidenceSourceSchema,
  vacancyRequirementSchema,
  type EvidenceGraphMatch,
  type EvidenceGraphRepository,
  type EvidenceSource,
  type VacancyRequirement,
} from '../domain/evidence-graph.js';

// Only the private graph-reader hostname is trusted. Never accept a visitor URL,
// arbitrary Cypher or a Bolt connection string in the public Orbe process.
const READER_URL = 'http://graph-reader:8765';
const REQUEST_LIMIT_BYTES = 60_000;
const RESPONSE_LIMIT_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 5_000;
const credentialFormat = /^[A-Za-z0-9_-]{43,128}$/;

const evidenceResponseSchema = z.strictObject({
  matches: z.array(
    z.strictObject({
      requirementId: z.string(),
      claims: z.array(evidenceClaimSchema),
      sources: z.array(evidenceSourceSchema),
    }),
  ),
});
const sourceResponseSchema = z.strictObject({
  source: evidenceSourceSchema.nullable(),
});

export interface GraphReaderHttpOptions {
  readonly token: string;
  /** Tests may inject a transport; production always uses the fixed internal URL. */
  readonly transport?: typeof fetch;
}

/**
 * Unprivileged, read-only HTTP client for the private GraphRAG reader.
 * It never receives Neo4j credentials, never runs Cypher and is not connected
 * to the public chat route until separately enabled and approved.
 */
export class GraphReaderHttpRepository implements EvidenceGraphRepository {
  private readonly token: string;
  private readonly transport: typeof fetch;

  constructor(options: GraphReaderHttpOptions) {
    if (!credentialFormat.test(options.token)) throw new Error('GRAPH_HTTP_INVALID_TOKEN');
    this.token = options.token;
    this.transport = options.transport ?? fetch;
  }

  private async request(path: '/internal/evidence' | '/internal/source', data: unknown) {
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > REQUEST_LIMIT_BYTES) {
      throw new Error('GRAPH_HTTP_REQUEST_TOO_LARGE');
    }
    let response: Response;
    try {
      response = await this.transport(READER_URL + path, {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: serialized,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error('GRAPH_HTTP_UNAVAILABLE');
    }
    if (!response.ok) throw new Error('GRAPH_HTTP_UNAVAILABLE');
    if (!response.body) throw new Error('GRAPH_HTTP_INVALID_RESPONSE');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > RESPONSE_LIMIT_BYTES) throw new Error('GRAPH_HTTP_RESPONSE_TOO_LARGE');
        chunks.push(value);
      }
    } catch {
      throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
    }
  }

  async findEvidence(
    requirements: readonly VacancyRequirement[],
    options: { maxClaimsPerRequirement?: number } = {},
  ): Promise<readonly EvidenceGraphMatch[]> {
    const parsed = z.array(vacancyRequirementSchema).parse(requirements);
    if (new Set(parsed.map((item) => item.id)).size !== parsed.length) {
      throw new Error('GRAPH_HTTP_DUPLICATE_REQUIREMENT');
    }
    const maxClaims = options.maxClaimsPerRequirement ?? 5;
    if (!Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 20) {
      throw new Error('GRAPH_HTTP_INVALID_LIMIT');
    }
    const raw = await this.request('/internal/evidence', {
      requirements: parsed,
      maxClaimsPerRequirement: maxClaims,
    });
    const result = evidenceResponseSchema.safeParse(raw);
    if (!result.success || result.data.matches.length !== parsed.length) {
      throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
    }
    return result.data.matches.map((match, index) => {
      if (match.requirementId !== parsed[index]?.id) {
        throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
      }
      const sourceIds = new Set<string>();
      for (const source of match.sources) {
        if (source.visibility !== 'public' || sourceIds.has(source.id)) {
          throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
        }
        sourceIds.add(source.id);
      }
      for (const claim of match.claims) {
        if (!claim.sourceIds.every((id) => sourceIds.has(id))) {
          throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
        }
      }
      return match;
    });
  }

  async getSource(id: string): Promise<EvidenceSource | undefined> {
    const sourceId = evidenceSourceSchema.shape.id.parse(id);
    const raw = await this.request('/internal/source', { id: sourceId });
    const result = sourceResponseSchema.safeParse(raw);
    if (!result.success) throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
    const source = result.data.source;
    if (source && (source.id !== id || source.visibility !== 'public')) {
      throw new Error('GRAPH_HTTP_INVALID_RESPONSE');
    }
    return source ?? undefined;
  }
}
