/**
 * Pure, deterministic draft-reference agreement scorer for Gate 8.
 * It does not infer requirements from prose and must not be interpreted as
 * independent retrieval accuracy or a measured benefit from HydraDB.
 */
import type {
  EvidenceClaim,
  EvidenceGraphMatch,
  EvidenceSource,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

export type Gate8ReferenceClaim = Readonly<{
  subjectId: string;
  scope: EvidenceClaim['scope'];
}>;
export type Gate8ReferenceSource = Readonly<{
  id: string;
  verificationStatus: EvidenceSource['verificationStatus'];
  origin: EvidenceSource['origin'];
}>;
export type Gate8ReferenceSources = Readonly<{
  subjectId: string;
  sources: readonly Gate8ReferenceSource[];
}>;
export type Gate8Score = Readonly<{
  expectedClaims: number;
  returnedClaims: number;
  matchedClaims: number;
  missingClaims: number;
  extraClaims: number;
  scopeMismatches: number;
  falseProfessionalClaims: number;
  expectedSources: number;
  returnedSources: number;
  matchedSources: number;
  missingSources: number;
  extraSources: number;
  provenanceMismatches: number;
  expectedSourceLinks: number;
  matchedSourceLinks: number;
  sourceLinkMismatches: number;
  duplicateClaims: number;
  duplicateSources: number;
  correctEmpty: boolean | null;
  exact: boolean;
}>;

function key(subjectId: string, scope: string): string {
  return JSON.stringify([subjectId, scope]);
}
function linkKey(subjectId: string, sourceId: string): string {
  return JSON.stringify([subjectId, sourceId]);
}
function intersect(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const item of left) if (right.has(item)) count++;
  return count;
}

export function scoreGate8Evidence(
  referenceClaims: readonly Gate8ReferenceClaim[],
  referenceSources: readonly Gate8ReferenceSources[],
  actual: EvidenceGraphMatch,
): Gate8Score {
  const expectedClaims = new Set(referenceClaims.map((ref) => key(ref.subjectId, ref.scope)));
  const actualClaims = new Set(actual.claims.map((claim) => key(claim.subjectId, claim.scope)));
  const matchedClaims = intersect(expectedClaims, actualClaims);
  const expectedSubjects = new Map(referenceClaims.map((claim) =>
    [claim.subjectId, claim.scope] as const));
  const scopeMismatches = actual.claims.filter((claim) =>
    expectedSubjects.has(claim.subjectId) &&
    expectedSubjects.get(claim.subjectId) !== claim.scope).length;
  const falseProfessionalClaims = actual.claims.filter((claim) =>
    claim.scope === 'professional' && expectedSubjects.get(claim.subjectId) !== 'professional').length;

  const refSources = new Map<string, Gate8ReferenceSource>();
  const expectedLinks = new Set<string>();
  for (const record of referenceSources) {
    for (const source of record.sources) {
      refSources.set(source.id, source);
      expectedLinks.add(linkKey(record.subjectId, source.id));
    }
  }
  const actualSources = new Map(actual.sources.map((source) => [source.id, source]));
  const actualLinks = new Set(actual.claims.flatMap((claim) =>
    claim.sourceIds.map((id) => linkKey(claim.subjectId, id))));
  const matchedSources = intersect(new Set(refSources.keys()), new Set(actualSources.keys()));
  let provenanceMismatches = 0;
  for (const [id, expected] of refSources) {
    const observed = actualSources.get(id);
    if (observed && (
      observed.verificationStatus !== expected.verificationStatus ||
      observed.origin !== expected.origin ||
      observed.visibility !== 'public'
    )) provenanceMismatches++;
  }

  const duplicateClaims = actual.claims.length - new Set(actual.claims.map((c) => c.id)).size;
  const duplicateSources = actual.sources.length - actualSources.size;
  const matchedSourceLinks = intersect(expectedLinks, actualLinks);
  const missingClaims = expectedClaims.size - matchedClaims;
  const extraClaims = actualClaims.size - matchedClaims;
  const missingSources = refSources.size - matchedSources;
  const extraSources = actualSources.size - matchedSources;
  const sourceLinkMismatches =
    expectedLinks.size + actualLinks.size - 2 * matchedSourceLinks;
  const exact =
    missingClaims === 0 && extraClaims === 0 && scopeMismatches === 0 &&
    falseProfessionalClaims === 0 && missingSources === 0 &&
    extraSources === 0 && provenanceMismatches === 0 &&
    sourceLinkMismatches === 0 && duplicateClaims === 0 &&
    duplicateSources === 0 &&
    actual.claims.length === expectedClaims.size &&
    actual.sources.length === refSources.size;
  return {
    expectedClaims: expectedClaims.size,
    returnedClaims: actual.claims.length,
    matchedClaims, missingClaims, extraClaims, scopeMismatches,
    falseProfessionalClaims, expectedSources: refSources.size,
    returnedSources: actual.sources.length, matchedSources,
    missingSources, extraSources, provenanceMismatches,
    expectedSourceLinks: expectedLinks.size, matchedSourceLinks,
    sourceLinkMismatches, duplicateClaims, duplicateSources,
    correctEmpty: expectedClaims.size === 0 ? actual.claims.length === 0 : null,
    exact,
  };
}

export function aggregateGate8Scores(scores: readonly Gate8Score[]) {
  const fields = [
    'expectedClaims', 'returnedClaims', 'matchedClaims', 'missingClaims',
    'extraClaims', 'scopeMismatches', 'falseProfessionalClaims',
    'expectedSources', 'returnedSources', 'matchedSources',
    'missingSources', 'extraSources', 'provenanceMismatches',
    'expectedSourceLinks', 'matchedSourceLinks', 'sourceLinkMismatches',
    'duplicateClaims', 'duplicateSources',
  ] as const;
  const totals = Object.fromEntries(fields.map((field) =>
    [field, scores.reduce((sum, score) => sum + score[field], 0)])) as
    { [K in typeof fields[number]]: number };
  const ratio = (num: number, den: number) =>
    den === 0 ? null : Number((num / den).toFixed(6));
  const negatives = scores.filter((s) => s.correctEmpty !== null);
  return {
    requirements: scores.length,
    ...totals,
    draftClaimPrecision: ratio(totals.matchedClaims, totals.returnedClaims),
    draftClaimRecall: ratio(totals.matchedClaims, totals.expectedClaims),
    draftSourceCoverage: ratio(totals.matchedSources, totals.expectedSources),
    draftLinkCoverage: ratio(totals.matchedSourceLinks, totals.expectedSourceLinks),
    correctEmpty: negatives.filter((s) => s.correctEmpty === true).length,
    totalEmpty: negatives.length,
    allExact: scores.length > 0 && scores.every((s) => s.exact),
  };
}
