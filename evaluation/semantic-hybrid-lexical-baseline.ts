import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { createSnapshotRequirementIdentifier } from '../apps/orbe-node/src/application/graph-requirements.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const annotationSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1),
  role: z.enum(['mandatory', 'desirable', 'alternative', 'context', 'negated', 'uncertain']),
  relation: z.enum([
    'candidate_requirement',
    'company_stack',
    'future_stack',
    'project_claim',
    'unrelated',
  ]),
  priority: z.enum(['mandatory', 'desirable', 'none']),
  candidateLabels: z.array(z.string().min(1)).min(1),
  alternativeGroup: z.string().min(1).optional(),
});

const corpusSchema = z.strictObject({
  schemaVersion: z.literal('semantic-hybrid-corpus-v0'),
  reviewStatus: z.literal('draft_not_human_approved'),
  provenance: z.literal('synthetic_examples_only'),
  purpose: z.string().min(1),
  cases: z.array(
    z.strictObject({
      id: z.string().min(1),
      language: z.enum(['pt', 'en']),
      text: z.string().min(1),
      annotations: z.array(annotationSchema).min(1),
    }),
  ),
});

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ratio = (numerator: number, denominator: number): number | null =>
  denominator ? Number((numerator / denominator).toFixed(4)) : null;

/**
 * Candidate retrieval benchmark ONLY. Source spans and requirement roles
 * come from PROVISIONAL human-review fixtures; the recognizer does not extract
 * spans or determine vacancy obligation. No Neo4j, LLM, vector model or network.
 *
 * Out-of-catalog labels are counted but never treated as false retrieval
 * negatives: a skill vocabulary cannot retrieve labels it does not contain.
 * Roles are used only to quarantine context/negations, NOT learned or inferred.
 */
export function evaluateSemanticLexicalBaseline(
  corpusJson: string,
  snapshot: EvidenceGraphSnapshot,
) {
  const corpus = corpusSchema.parse(JSON.parse(corpusJson) as unknown);
  const ids = corpus.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('SEMANTIC_LEXICAL_DUPLICATE_CASE_ID');

  const catalog = new Map<string, string>();
  for (const node of snapshot.nodes) {
    if (node.kind !== 'skill') continue;
    const key = normalize(node.label);
    if (catalog.has(key) && catalog.get(key) !== node.id) {
      throw new Error('SEMANTIC_LEXICAL_AMBIGUOUS_SKILL');
    }
    catalog.set(key, node.id);
  }
  const identify = createSnapshotRequirementIdentifier(snapshot);

  let spans = 0;
  let candidateSpans = 0;
  let ambiguousSpans = 0;
  let expectedCatalogHits = 0;
  let outOfCatalogMentions = 0;
  let lexicalTruePositives = 0;
  let lexicalFalsePositives = 0;
  let lexicalFalseNegatives = 0;
  let lexicalTop1Hits = 0;
  let lexicalTop3Hits = 0;
  let quarantinedLexicalMentions = 0;
  let reciprocalRankSum = 0;
  let rankedSpans = 0;

  const cases = corpus.cases.map((item) => {
    const sorted = [...item.annotations].sort((a, b) => a.start - b.start);
    let caseCandidateSpans = 0;
    let caseAmbiguousSpans = 0;
    let caseKnownLabels = 0;
    let caseOutOfCatalog = 0;
    let caseTruePositives = 0;
    let caseFalsePositives = 0;
    let caseFalseNegatives = 0;
    let caseQuarantined = 0;

    for (const [index, annotation] of sorted.entries()) {
      if (
        annotation.end > item.text.length ||
        item.text.slice(annotation.start, annotation.end) !== annotation.text
      ) {
        throw new Error('SEMANTIC_LEXICAL_UNGROUNDED_SPAN');
      }
      if (index > 0 && sorted[index - 1]!.end > annotation.start) {
        throw new Error('SEMANTIC_LEXICAL_OVERLAPPING_SPANS');
      }
      if (annotation.role === 'alternative' && !annotation.alternativeGroup) {
        throw new Error('SEMANTIC_LEXICAL_MISSING_ALTERNATIVE_GROUP');
      }
      spans++;
      const mentions = identify(annotation.text).map((requirement) => requirement.id);
      const isCandidate =
        annotation.relation === 'candidate_requirement' &&
        !['context', 'negated'].includes(annotation.role);
      if (!isCandidate) {
        // Raw keyword spotting would confuse these mentions with requirements.
        quarantinedLexicalMentions += mentions.length;
        caseQuarantined += mentions.length;
        continue;
      }
      candidateSpans++;
      caseCandidateSpans++;
      if (annotation.role === 'uncertain') {
        ambiguousSpans++;
        caseAmbiguousSpans++;
      }
      const expectedIds = new Set<string>();
      for (const label of annotation.candidateLabels) {
        const id = catalog.get(normalize(label));
        if (id) expectedIds.add(id);
        else {
          outOfCatalogMentions++;
          caseOutOfCatalog++;
        }
      }
      expectedCatalogHits += expectedIds.size;
      caseKnownLabels += expectedIds.size;
      const predictedIds = new Set(mentions);
      const tp = [...predictedIds].filter((id) => expectedIds.has(id)).length;
      const fp = [...predictedIds].filter((id) => !expectedIds.has(id)).length;
      const fn = [...expectedIds].filter((id) => !predictedIds.has(id)).length;
      lexicalTruePositives += tp;
      lexicalFalsePositives += fp;
      lexicalFalseNegatives += fn;
      caseTruePositives += tp;
      caseFalsePositives += fp;
      caseFalseNegatives += fn;
      lexicalTop1Hits += mentions.slice(0, 1).filter((id) => expectedIds.has(id)).length;
      lexicalTop3Hits += mentions.slice(0, 3).filter((id) => expectedIds.has(id)).length;
      if (expectedIds.size) {
        rankedSpans++;
        const firstHitIndex = mentions.findIndex((id) => expectedIds.has(id));
        if (firstHitIndex >= 0) reciprocalRankSum += 1 / (firstHitIndex + 1);
      }
    }

    return {
      id: item.id,
      language: item.language,
      spans: sorted.length,
      candidateSpans: caseCandidateSpans,
      ambiguousSpans: caseAmbiguousSpans,
      expectedInCatalog: caseKnownLabels,
      expectedOutOfCatalog: caseOutOfCatalog,
      lexicalTruePositives: caseTruePositives,
      lexicalFalsePositives: caseFalsePositives,
      lexicalFalseNegatives: caseFalseNegatives,
      quarantinedLexicalMentions: caseQuarantined,
    };
  });

  return {
    reportVersion: 'semantic-hybrid-lexical-baseline-v0',
    mode: 'lexical_skill_mention_retrieval_only',
    provenance: corpus.provenance,
    reviewStatus: corpus.reviewStatus,
    sourceCorpusVersion: corpus.schemaVersion,
    baselineComparison: 'not_run',
    modelCalls: 0,
    graphQueries: 0,
    vectorQueries: 0,
    limitations: [
      'Provisional synthetic spans; no human-approved gold labels yet',
      'Inputs are already annotated spans, not whole-vacancy extraction',
      'Roles are oracle annotations; lexical retrieval cannot classify requirement vs context',
      'Rank follows source mention order, not learned semantic similarity',
      'Out-of-catalog expected labels are not counted as retrieval false negatives',
      'No evidence claims or employment attributions are evaluated',
    ],
    totals: {
      cases: cases.length,
      spans,
      candidateSpans,
      ambiguousSpans,
      catalogSkills: catalog.size,
      expectedInCatalog: expectedCatalogHits,
      expectedOutOfCatalog: outOfCatalogMentions,
      lexicalTruePositives,
      lexicalFalsePositives,
      lexicalFalseNegatives,
      lexicalPrecision: ratio(
        lexicalTruePositives,
        lexicalTruePositives + lexicalFalsePositives,
      ),
      lexicalRecall: ratio(
        lexicalTruePositives,
        lexicalTruePositives + lexicalFalseNegatives,
      ),
      lexicalRecallAt1: ratio(lexicalTop1Hits, expectedCatalogHits),
      lexicalRecallAt3: ratio(lexicalTop3Hits, expectedCatalogHits),
      lexicalMrrFirstKnown: ratio(reciprocalRankSum, rankedSpans),
      quarantinedLexicalMentions,
    },
    cases,
  };
}

export async function evaluateStoredSemanticLexicalBaseline() {
  const [corpusJson, snapshot] = await Promise.all([
    readFile('evaluation/semantic-hybrid-corpus-v0.json', 'utf8'),
    projectPpksEvidenceGraph(),
  ]);
  return evaluateSemanticLexicalBaseline(corpusJson, snapshot);
}
