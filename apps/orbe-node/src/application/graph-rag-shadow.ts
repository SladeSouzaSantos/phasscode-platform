import { z } from 'zod';
import { evaluateGraphRecruiterPreview } from './graph-recruiter-preview.js';
import { createCoverageAwareVacancyPlanner } from './graph-vacancy-coverage.js';
import { createSnapshotRequirementIdentifier } from './graph-requirements.js';
import type { EvidenceGraphRepository, EvidenceGraphSnapshot } from '../domain/evidence-graph.js';

export const graphShadowObservationSchema = z.strictObject({
  mode: z.enum(['verified_graph', 'transferable_graph', 'canonical_ppks']),
  reason: z.enum([
    'verified',
    'transferable',
    'no_requirements',
    'unrecognized_requirements',
    'unavailable_or_incomplete',
  ]),
  matchedRequirements: z.number().int().min(0).max(1000),
  unknownRequirements: z.number().int().min(0).max(1000),
});

export type GraphShadowObservation = z.infer<typeof graphShadowObservationSchema>;

export interface GraphShadowPort {
  inspect(question: string): Promise<GraphShadowObservation>;
}

/**
 * DEV rollout precursor: graph evidence is inspected, but the evaluated
 * answer NEVER enters the public chat response or conversation history.
 * The canonical callback is only a non-displayed routing sentinel.
 *
 * No LLM is called; no source URL, prompt, answer or secret is logged.
 */
export function createGraphRagShadow(
  snapshot: EvidenceGraphSnapshot,
  evidence: EvidenceGraphRepository,
): GraphShadowPort {
  const identifyRequirements = createSnapshotRequirementIdentifier(snapshot);
  const catalog = snapshot.nodes
    .filter((node): node is Extract<typeof node, { kind: 'skill' }> => node.kind === 'skill')
    .map((node) => ({ id: node.id, label: node.label }));
  const structured = createCoverageAwareVacancyPlanner(catalog);
  return {
    async inspect(question) {
      const signposted = /(?:^|\n)\s*(?:requisitos?|diferenciais|desej[aá]veis|must have|required skills)\s*:/i.test(
        question,
      );
      const result = await evaluateGraphRecruiterPreview(question, {
        evidence,
        identifyRequirements,
        canonicalPpks: () => 'PPKS_SHADOW_ONLY_NEVER_DISPLAY',
        ...(signposted ? { requirementPlan: structured.plan } : {}),
      });
      return graphShadowObservationSchema.parse({
        mode: result.mode,
        reason: result.reason,
        matchedRequirements: result.matchedRequirements,
        unknownRequirements: result.unrecognizedRequirements?.length ?? 0,
      });
    },
  };
}
