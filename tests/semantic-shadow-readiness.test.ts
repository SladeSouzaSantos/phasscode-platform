import { describe, expect, it } from 'vitest';
import {
  assessSemanticShadowReadiness,
  currentF37ShadowReadiness,
} from '../apps/orbe-node/src/application/semantic-shadow-readiness.js';

const approvedFixture = {
  independentlyReviewedGoldSet: true,
  lexicalAndOnnxBlindComparison: true,
  outOfCatalogAndNegationSafety: true,
  miniMacCpuMemoryBudget: true,
  publicResponseParity: true,
  shadowRollbackExercised: true,
};

describe('F3.7/#44 offline readiness never activates the public runtime', () => {
  it('keeps every incomplete prerequisite blocked on current DEV', () => {
    expect(currentF37ShadowReadiness.status).toBe('blocked');
    expect(currentF37ShadowReadiness.pending).toHaveLength(6);
    expect(currentF37ShadowReadiness.publicRuntimeEnabled).toBe(false);
  });

  it('rejects missing or untrusted gate fields without attempting a model call', () => {
    const result = assessSemanticShadowReadiness({
      independentlyReviewedGoldSet: true,
      shadowRollbackExercised: true,
      enableShadow: true,
    });
    expect(result.status).toBe('blocked');
    expect(result.pending).toContain('invalid_evidence');
    expect(result.additionalLlmCalls).toBe(0);
    expect(result.modelDownloads).toBe(0);
  });

  it('never enables public Shadow even if all fields are set to true', () => {
    const result = assessSemanticShadowReadiness(approvedFixture);
    expect(result.status).toBe('requires_separate_release_approval');
    expect(result.publicRuntimeEnabled).toBe(false);
    expect(result.pending).toHaveLength(0);
  });

  it('separately blocks an unchecked OOV or rollback gate', () => {
    const result = assessSemanticShadowReadiness({
      ...approvedFixture,
      outOfCatalogAndNegationSafety: false,
      shadowRollbackExercised: false,
    });
    expect(result.status).toBe('blocked');
    expect(result.pending).toEqual([
      'outOfCatalogAndNegationSafety',
      'shadowRollbackExercised',
    ]);
  });
});
