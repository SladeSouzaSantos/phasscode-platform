import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { analyzeVacancyEvidenceCoverage } from '../apps/orbe-node/src/application/graph-vacancy-coverage.js';

const originalCorpus = z.object({
  version: z.string().min(1),
  cases: z.array(
    z.object({
      id: z.string().min(1),
      turns: z.array(z.object({ message: z.string().min(1) })).min(1),
    }),
  ),
});

const reviewCorpus = z.object({
  schemaVersion: z.literal('semantic-hybrid-ppks-review-v0'),
  sourceCorpus: z.literal('evaluation/vacancies-ppks-v12.json'),
  sourceVersion: z.string().min(1),
  reviewStatus: z.literal('assistant_provisional_not_human_validated'),
  cases: z.array(
    z.object({
      id: z.string().min(1),
      turnIndex: z.number().int().nonnegative(),
      kind: z.enum(['recruiter_vacancy', 'academic_query']),
      reviewStatus: z.literal('assistant_provisional_not_human_validated'),
      coverageClaim: z.literal('partial_annotations_only'),
      spans: z.array(
        z.object({
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          text: z.string().min(1),
          role: z.enum([
            'mandatory',
            'desirable',
            'alternative',
            'context',
            'negated',
            'uncertain',
          ]),
          relation: z.enum(['candidate_requirement', 'academic_question']),
          reviewStatus: z.literal('assistant_provisional_not_human_validated'),
          uncertainty: z.string().optional(),
        }),
      ),
    }),
  ),
});

export async function auditSemanticHybridCoverage(originalJson: string, reviewJson: string) {
  const original = originalCorpus.parse(JSON.parse(originalJson) as unknown);
  const review = reviewCorpus.parse(JSON.parse(reviewJson) as unknown);
  if (review.sourceVersion !== original.version)
    throw new Error('SEMANTIC_REVIEW_SOURCE_VERSION_MISMATCH');
  if (review.cases.length !== original.cases.length)
    throw new Error('SEMANTIC_REVIEW_CASE_COUNT_MISMATCH');
  const originalById = new Map(original.cases.map((item) => [item.id, item]));
  if (originalById.size !== original.cases.length)
    throw new Error('SEMANTIC_REVIEW_DUPLICATE_ORIGINAL_ID');
  if (new Set(review.cases.map((item) => item.id)).size !== review.cases.length) {
    throw new Error('SEMANTIC_REVIEW_DUPLICATE_REVIEW_ID');
  }

  let reviewedSpans = 0;
  let ambiguousSpans = 0;
  let uninterpretedSegments = 0;
  let extractedFragments = 0;
  const cases: Array<{
    id: string;
    kind: 'recruiter_vacancy' | 'academic_query';
    reviewStatus: 'assistant_provisional_not_human_validated';
    reviewedSpans: number;
    ambiguousSpans: number;
    coverage: 'eligible' | 'needs_review' | 'no_requirements';
    extractedFragments: number;
    uninterpretedSegments: number;
    uninterpretedDigests: Array<{ line: number; sha256_12: string }>;
  }> = [];

  for (const item of review.cases) {
    const originalCase = originalById.get(item.id);
    if (!originalCase) throw new Error('SEMANTIC_REVIEW_UNEXPECTED_CASE_ID');
    const source = originalCase.turns[item.turnIndex]?.message;
    if (!source) throw new Error('SEMANTIC_REVIEW_MISSING_SOURCE_TURN');
    const spans = [...item.spans].sort((a, b) => a.start - b.start);
    for (const [index, span] of spans.entries()) {
      if (span.end > source.length || source.slice(span.start, span.end) !== span.text) {
        throw new Error('SEMANTIC_REVIEW_LITERAL_SPAN_MISMATCH');
      }
      if (index > 0 && spans[index - 1]!.end > span.start) {
        throw new Error('SEMANTIC_REVIEW_OVERLAPPING_SPANS');
      }
      if (span.role === 'uncertain' && !span.uncertainty) {
        throw new Error('SEMANTIC_REVIEW_UNCERTAINTY_REASON_REQUIRED');
      }
      if (item.kind === 'academic_query' && span.relation !== 'academic_question') {
        throw new Error('SEMANTIC_REVIEW_ACADEMIC_RELATION_MISMATCH');
      }
    }
    const coverage = analyzeVacancyEvidenceCoverage(source);
    reviewedSpans += spans.length;
    ambiguousSpans += spans.filter((span) => span.role === 'uncertain').length;
    uninterpretedSegments += coverage.uninterpreted.length;
    extractedFragments += coverage.fragments.length;
    cases.push({
      id: item.id,
      kind: item.kind,
      reviewStatus: item.reviewStatus,
      reviewedSpans: spans.length,
      ambiguousSpans: spans.filter((span) => span.role === 'uncertain').length,
      coverage: coverage.status,
      extractedFragments: coverage.fragments.length,
      uninterpretedSegments: coverage.uninterpreted.length,
      uninterpretedDigests: coverage.uninterpreted.map((segment) => ({
        line: segment.line,
        sha256_12: createHash('sha256').update(segment.excerpt).digest('hex').slice(0, 12),
      })),
    });
  }
  return {
    reportVersion: 'semantic-hybrid-coverage-audit-v0',
    sourceCorpusVersion: original.version,
    reviewStatus: review.reviewStatus,
    modelCalls: 0,
    graphQueries: 0,
    comparisonToBaseline: 'not_run',
    limitations: [
      'Partial assistant-authored annotations; not human-validated ground truth',
      'Uninterpreted segments are parser signals, not measured model failures',
      'Counts are diagnostic only; no span-level precision or recall is asserted',
    ],
    totals: {
      cases: cases.length,
      reviewedSpans,
      ambiguousSpans,
      extractedFragments,
      uninterpretedSegments,
      humanReviewedCases: 0,
    },
    cases,
  };
}

export async function auditStoredSemanticHybridCoverage() {
  const [original, review] = await Promise.all([
    readFile('evaluation/vacancies-ppks-v12.json', 'utf8'),
    readFile('evaluation/semantic-hybrid-ppks-review-v0.json', 'utf8'),
  ]);
  return auditSemanticHybridCoverage(original, review);
}
