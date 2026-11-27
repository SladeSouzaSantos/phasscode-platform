import type { EvidenceGraphMatch, VacancyRequirement } from '../../domain/evidence-graph.js';
import type { PublicGraphEvidenceGateway } from '../graph-public-policy.js';

// Internal read-only capability. Never bound to the LLM or given direct Neo4j access.
export async function searchKnowledgeGraph(
  publicEvidence: PublicGraphEvidenceGateway,
  requirements: readonly VacancyRequirement[],
): Promise<{ matches: EvidenceGraphMatch[]; retrievalFailed: boolean }> {
  if (!requirements.length) return { matches: [], retrievalFailed: false };
  try {
    const matches = await publicEvidence.findEvidence(requirements);
    return { matches: [...matches], retrievalFailed: false };
  } catch {
    // Do not log private graph details or invent evidence on outages.
    return { matches: [], retrievalFailed: true };
  }
}
