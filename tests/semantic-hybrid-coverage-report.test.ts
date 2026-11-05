import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  auditSemanticHybridCoverage,
  auditStoredSemanticHybridCoverage,
} from '../evaluation/semantic-hybrid-coverage-report.js';

async function fixtures() {
  const [original, review] = await Promise.all([
    readFile(new URL('../evaluation/vacancies-ppks-v12.json', import.meta.url), 'utf8'),
    readFile(new URL('../evaluation/semantic-hybrid-ppks-review-v0.json', import.meta.url), 'utf8'),
  ]);
  return { original, review };
}

describe('F3.7 offline review and coverage diagnostic', () => {
  it('compares the nine F3.4 cases against source-anchored provisional spans', async () => {
    const report = await auditStoredSemanticHybridCoverage();
    expect(report).toMatchObject({
      reportVersion: 'semantic-hybrid-coverage-audit-v0',
      reviewStatus: 'assistant_provisional_not_human_validated',
      modelCalls: 0,
      graphQueries: 0,
      comparisonToBaseline: 'not_run',
    });
    expect(report.totals).toMatchObject({
      cases: 9,
      reviewedSpans: 56,
      humanReviewedCases: 0,
    });
    expect(report.cases.filter((item) => item.kind === 'academic_query')).toHaveLength(3);
    expect(report.cases.filter((item) => item.kind === 'recruiter_vacancy')).toHaveLength(6);
    expect(report.cases.every((item) => item.reviewedSpans > 0)).toBe(true);
    expect(report.cases.reduce((total, item) => total + item.uninterpretedSegments, 0)).toBe(
      report.totals.uninterpretedSegments,
    );
    expect(JSON.stringify(report)).not.toContain('Sou recrutador');
    expect(JSON.stringify(report)).not.toContain('Pedro possui graduação');
  });

  it('is deterministic on unchanged fixture inputs', async () => {
    const first = await auditStoredSemanticHybridCoverage();
    const second = await auditStoredSemanticHybridCoverage();
    expect(second).toEqual(first);
  });

  it('fails closed if an annotation is not a literal span of its source prompt', async () => {
    const { original, review } = await fixtures();
    const modified = JSON.parse(review) as {
      cases: Array<{ spans: Array<{ text: string }> }>;
    };
    modified.cases[0]!.spans[0]!.text = 'INVENTED_REQUIREMENT_CANARY';
    await expect(auditSemanticHybridCoverage(original, JSON.stringify(modified))).rejects.toThrow(
      'SEMANTIC_REVIEW_LITERAL_SPAN_MISMATCH',
    );
  });

  it('rejects corpus drift and duplicated case IDs before any coverage claims', async () => {
    const { original, review } = await fixtures();
    const changedVersion = JSON.parse(review) as {
      sourceVersion: string;
    };
    changedVersion.sourceVersion = 'different-version';
    await expect(
      auditSemanticHybridCoverage(original, JSON.stringify(changedVersion)),
    ).rejects.toThrow('SEMANTIC_REVIEW_SOURCE_VERSION_MISMATCH');

    const repeated = JSON.parse(review) as {
      cases: Array<{ id: string }>;
    };
    repeated.cases[1]!.id = repeated.cases[0]!.id;
    await expect(auditSemanticHybridCoverage(original, JSON.stringify(repeated))).rejects.toThrow(
      'SEMANTIC_REVIEW_DUPLICATE_REVIEW_ID',
    );
  });
});
