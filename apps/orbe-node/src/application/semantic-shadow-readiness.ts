import { z } from 'zod';

/**
 * F3.7/#44: offline-only readiness report for FUTURE Shadow integration.
 *
 * Deliberately has no env flag, runner, adapter invocation, LLM call,
 * GraphRAG request or effectful path to Orbe public responses.
 *
 * Even all checks passing never activates Shadow: a separately approved
 * integration and explicit rollback-capable release are still required.
 */
const readinessEvidenceSchema = z.strictObject({
  independentlyReviewedGoldSet: z.boolean(),
  lexicalAndOnnxBlindComparison: z.boolean(),
  outOfCatalogAndNegationSafety: z.boolean(),
  miniMacCpuMemoryBudget: z.boolean(),
  publicResponseParity: z.boolean(),
  shadowRollbackExercised: z.boolean(),
});

export type SemanticShadowReadinessEvidence = z.infer<typeof readinessEvidenceSchema>;

const orderedGates: ReadonlyArray<keyof SemanticShadowReadinessEvidence> = [
  'independentlyReviewedGoldSet',
  'lexicalAndOnnxBlindComparison',
  'outOfCatalogAndNegationSafety',
  'miniMacCpuMemoryBudget',
  'publicResponseParity',
  'shadowRollbackExercised',
];

export interface SemanticShadowReadiness {
  status: 'blocked' | 'requires_separate_release_approval';
  pending: ReadonlyArray<keyof SemanticShadowReadinessEvidence | 'invalid_evidence'>;
  publicRuntimeEnabled: false;
  additionalLlmCalls: 0;
  modelDownloads: 0;
  reason: 'offline_preflight_only_not_a_production_activation';
}

export function assessSemanticShadowReadiness(input: unknown): SemanticShadowReadiness {
  const parsed = readinessEvidenceSchema.safeParse(input);
  const pending: SemanticShadowReadiness['pending'] = parsed.success
    ? orderedGates.filter((name) => parsed.data[name] !== true)
    : ['invalid_evidence'];

  return {
    status: pending.length === 0 ? 'requires_separate_release_approval' : 'blocked',
    pending,
    publicRuntimeEnabled: false,
    additionalLlmCalls: 0,
    modelDownloads: 0,
    reason: 'offline_preflight_only_not_a_production_activation',
  };
}

/** The current, non-asserted state in DEV; not a dynamically inferred approval. */
export const currentF37ShadowReadiness: SemanticShadowReadiness = assessSemanticShadowReadiness({
  independentlyReviewedGoldSet: false,
  lexicalAndOnnxBlindComparison: false,
  outOfCatalogAndNegationSafety: false,
  miniMacCpuMemoryBudget: false,
  publicResponseParity: false,
  shadowRollbackExercised: false,
});
