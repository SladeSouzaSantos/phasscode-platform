import {
  evidenceClaimSchema,
  evidenceSourceSchema,
  type EvidenceGraphMatch,
  type EvidenceGraphRepository,
  type EvidenceSource,
  type VacancyRequirement,
} from '../domain/evidence-graph.js';

/**
 * F3.2: public-only boundary for results returned by a trusted graph reader.
 * This is a data-minimization policy, not an authorization substitute for
 * Neo4j Community's missing read-only RBAC. The public runtime must never
 * receive the privileged Bolt credentials.
 */
export class PublicGraphEvidenceGateway implements EvidenceGraphRepository {
  constructor(private readonly upstream: EvidenceGraphRepository) {}

  async findEvidence(
    requirements: readonly VacancyRequirement[],
    options: { maxClaimsPerRequirement?: number } = {},
  ): Promise<readonly EvidenceGraphMatch[]> {
    const maxClaims = options.maxClaimsPerRequirement ?? 5;
    if (!Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 20) {
      throw new Error('GRAPH_PUBLIC_INVALID_LIMIT');
    }
    const matches = await this.upstream.findEvidence(requirements, {
      maxClaimsPerRequirement: maxClaims,
    });
    if (matches.length !== requirements.length) {
      throw new Error('GRAPH_PUBLIC_INVALID_RESULT_COUNT');
    }
    return matches.map((match, index) => {
      if (match.requirementId !== requirements[index]?.id) {
        throw new Error('GRAPH_PUBLIC_REQUIREMENT_MISMATCH');
      }
      const sources = new Map<string, EvidenceSource>();
      for (const raw of match.sources) {
        const source = evidenceSourceSchema.parse(raw);
        if (source.visibility === 'public') sources.set(source.id, source);
      }
      const claims = match.claims
        .map((raw) => evidenceClaimSchema.parse(raw))
        // A mixed public/private claim is never partially disclosed.
        .filter((claim) => claim.sourceIds.every((id) => sources.has(id)));
      const requiredSources = new Set(claims.flatMap((claim) => claim.sourceIds));
      return {
        requirementId: match.requirementId,
        claims,
        sources: [...sources.values()].filter((source) => requiredSources.has(source.id)),
      };
    });
  }

  async getSource(id: string): Promise<EvidenceSource | undefined> {
    const raw = await this.upstream.getSource(id);
    if (!raw) return undefined;
    const source = evidenceSourceSchema.parse(raw);
    return source.visibility === 'public' ? source : undefined;
  }
}

/**
 * Fail closed on any attempt to inject the privileged graph credentials or
 * maintenance flags into the internet-facing Orbe process.
 */
export function assertPublicOrbeGraphIsolation(env: NodeJS.ProcessEnv): void {
  for (const key of [
    'NEO4J_AUTH',
    'NEO4J_AUTH_FILE',
    'NEO4J_URI',
    'NEO4J_PASSWORD',
    'GRAPHRAG_SEED_ENABLED',
  ]) {
    if (env[key] !== undefined) {
      throw new Error('ORBE_PUBLIC_GRAPH_PRIVILEGE_FORBIDDEN');
    }
  }
}
