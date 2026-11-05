import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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
  cases: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        language: z.enum(['pt', 'en']),
        text: z.string().min(1),
        annotations: z.array(annotationSchema).min(1),
      }),
    )
    .min(1),
});

describe('F3.7 provisional synthetic semantic corpus integrity', () => {
  it('keeps literal spans aligned without silently accepting invented requirements', async () => {
    const text = await readFile(
      new URL('../evaluation/semantic-hybrid-corpus-v0.json', import.meta.url),
      'utf8',
    );
    const corpus = corpusSchema.parse(JSON.parse(text) as unknown);
    expect(corpus.reviewStatus).toBe('draft_not_human_approved');
    expect(corpus.cases).toHaveLength(16);
    expect(corpus.cases.reduce((sum, item) => sum + item.annotations.length, 0)).toBe(31);
    expect(new Set(corpus.cases.map((item) => item.id)).size).toBe(corpus.cases.length);

    for (const item of corpus.cases) {
      for (const span of item.annotations) {
        expect(span.start).toBeLessThan(span.end);
        expect(span.end).toBeLessThanOrEqual(item.text.length);
        expect(item.text.slice(span.start, span.end)).toBe(span.text);
        if (span.role === 'alternative') {
          expect(span.alternativeGroup).toBeTruthy();
          expect(span.candidateLabels.length).toBeGreaterThan(1);
        }
      }
      const sorted = [...item.annotations].sort((a, b) => a.start - b.start);
      for (let index = 1; index < sorted.length; index++) {
        expect(sorted[index - 1]!.end).toBeLessThanOrEqual(sorted[index]!.start);
      }
    }
  });

  it('includes adversarial contrasts before any classifier is considered safe', async () => {
    const text = await readFile(
      new URL('../evaluation/semantic-hybrid-corpus-v0.json', import.meta.url),
      'utf8',
    );
    const corpus = corpusSchema.parse(JSON.parse(text) as unknown);
    const all = corpus.cases.flatMap((item) => item.annotations);
    expect(all.some((item) => item.role === 'negated')).toBe(true);
    expect(all.some((item) => item.role === 'alternative')).toBe(true);
    expect(all.some((item) => item.relation === 'future_stack')).toBe(true);
    expect(all.some((item) => item.relation === 'project_claim')).toBe(true);
    expect(corpus.cases.some((item) => item.language === 'en')).toBe(true);
  });
});
