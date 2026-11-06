import { describe, expect, it } from 'vitest';
import type {
  EvidenceClaim, EvidenceGraphMatch, EvidenceSource,
} from '../apps/orbe-node/src/domain/evidence-graph.js';
import {
  aggregateGate8Scores, scoreGate8Evidence,
  type Gate8ReferenceClaim, type Gate8ReferenceSources,
} from '../scripts/hydradb-lab-gate8-score.js';

const refClaims: Gate8ReferenceClaim[] = [
  { subjectId: 'experiencia-sig', scope: 'professional' },
  { subjectId: 'webservice-springboot-jpa', scope: 'study' },
];
const refSources: Gate8ReferenceSources[] = [
  { subjectId: 'experiencia-sig', sources: [
    { id: 'source-experiencia-sig-catalog',
      verificationStatus: 'catalog_only', origin: 'ppks_catalog' },
  ] },
  { subjectId: 'webservice-springboot-jpa', sources: [
    { id: 'source-webservice-springboot-jpa-repo',
      verificationStatus: 'code_reviewed', origin: 'github' },
  ] },
];
const source = (id: string, status: EvidenceSource['verificationStatus'],
  origin: EvidenceSource['origin']): EvidenceSource => ({
    kind: 'source', id, label: id, verificationStatus: status,
    origin, visibility: 'public',
  });
const claim = (id: string, subjectId: string, scope: EvidenceClaim['scope'],
  sourceIds: string[]): EvidenceClaim => ({
    kind: 'claim', id, subjectId, objectId: 'skill-java',
    label: id, predicate: 'USES_TECHNOLOGY', scope, sourceIds,
  });
function good(): EvidenceGraphMatch {
  return {
    requirementId: 'req-java',
    claims: [
      claim('claim-experiencia-sig-skill-java',
        'experiencia-sig', 'professional', ['source-experiencia-sig-catalog']),
      claim('claim-webservice-springboot-jpa-skill-java',
        'webservice-springboot-jpa', 'study', ['source-webservice-springboot-jpa-repo']),
    ],
    sources: [
      source('source-experiencia-sig-catalog', 'catalog_only', 'ppks_catalog'),
      source('source-webservice-springboot-jpa-repo', 'code_reviewed', 'github'),
    ],
  };
}
describe('HydraDB Gate 8 draft reference scorer', () => {
  it('validates exact claim, scope, source, and confidence agreements', () => {
    const scored = scoreGate8Evidence(refClaims, refSources, good());
    expect(scored.exact).toBe(true);
    expect(scored.matchedClaims).toBe(2);
    expect(scored.matchedSources).toBe(2);
    expect(scored.matchedSourceLinks).toBe(2);
    const aggregate = aggregateGate8Scores([scored]);
    expect(aggregate.draftClaimPrecision).toBe(1);
    expect(aggregate.draftSourceCoverage).toBe(1);
    expect(aggregate.allExact).toBe(true);
  });

  it('rejects promotion of a study project to professional experience', () => {
    const actual = good();
    actual.claims = actual.claims.map((entry, i) =>
      i === 1 ? { ...entry, scope: 'professional' } : entry);
    const scored = scoreGate8Evidence(refClaims, refSources, actual);
    expect(scored.exact).toBe(false);
    expect(scored.scopeMismatches).toBe(1);
    expect(scored.falseProfessionalClaims).toBe(1);
  });

  it('rejects inflation of catalogue-only evidence to reviewed code', () => {
    const actual = good();
    actual.sources = actual.sources.map((entry, i) =>
      i === 0 ? { ...entry, verificationStatus: 'code_reviewed', origin: 'github' } : entry);
    const scored = scoreGate8Evidence(refClaims, refSources, actual);
    expect(scored.exact).toBe(false);
    expect(scored.provenanceMismatches).toBe(1);
  });

  it('rejects missing sources and incorrect claim-source linkage', () => {
    const actual = good();
    actual.claims = actual.claims.map((entry, i) =>
      i === 0 ? { ...entry, sourceIds: [] } : entry);
    actual.sources = actual.sources.slice(1);
    const scored = scoreGate8Evidence(refClaims, refSources, actual);
    expect(scored.exact).toBe(false);
    expect(scored.missingSources).toBe(1);
    expect(scored.sourceLinkMismatches).toBeGreaterThan(0);
  });

  it('rejects duplicate source links even if source objects are unique', () => {
    const actual = good();
    actual.claims = actual.claims.map((entry, i) =>
      i === 0 ? { ...entry, sourceIds: [
        'source-experiencia-sig-catalog',
        'source-experiencia-sig-catalog',
      ] } : entry);
    const scored = scoreGate8Evidence(refClaims, refSources, actual);
    expect(scored.exact).toBe(false);
    expect(scored.duplicateSourceLinks).toBe(1);
  });

  it('counts correct zero-evidence results without inventing claims', () => {
    const negative: EvidenceGraphMatch = {
      requirementId: 'req-go', claims: [], sources: [],
    };
    const score = scoreGate8Evidence([], [], negative);
    expect(score.exact).toBe(true);
    expect(score.correctEmpty).toBe(true);
    const summary = aggregateGate8Scores([score]);
    expect(summary.correctEmpty).toBe(1);
    expect(summary.totalEmpty).toBe(1);
    expect(summary.draftClaimPrecision).toBeNull();
    expect(summary.draftClaimRecall).toBeNull();
  });

  it('catches fabricated evidence for a negative requirement', () => {
    const score = scoreGate8Evidence([], [], good());
    expect(score.exact).toBe(false);
    expect(score.extraClaims).toBe(2);
    expect(score.correctEmpty).toBe(false);
    expect(score.falseProfessionalClaims).toBeGreaterThan(0);
  });
});
