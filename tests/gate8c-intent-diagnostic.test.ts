import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateGate8cIntent } from '../evaluation/hydradb-gate8c-intent-diagnostic.js';

const original = readFileSync(
  'knowledge/evaluations/hydradb-gate8-recruiter.json', 'utf8',
);
const provisional = readFileSync(
  'knowledge/evaluations/hydradb-gate8c-intent-draft.json', 'utf8',
);
type MutableDraft = {
  reviewStatus: string;
  cases: Array<{
    id: string;
    mentions: Array<{
      start: number;
      end: number;
      skill: string;
      polarity: string;
      intentRole: string;
      requestedEvidence: string[];
    }>;
  }>;
};
function changeDraft(edit: (draft: MutableDraft) => void): string {
  const data = JSON.parse(provisional) as MutableDraft;
  edit(data);
  return JSON.stringify(data);
}

describe('HydraDB Gate 8C — provisional whole-question lexical diagnostic', () => {
  it('counts 20 draft cases, 30 mentions, 2 negative instructions without claiming gold', () => {
    const report = evaluateGate8cIntent(original, provisional);
    expect(report.questionCount).toBe(20);
    expect(report.expectedMentionCount).toBe(30);
    expect(report.draftNegatedMentionCount).toBe(2);
    expect(report.goldReviewed).toBe(false);
    expect(report.roleAccuracy).toMatch(/^not_measured_/);
    expect(report.scopeAccuracy).toMatch(/^not_measured_/);
    expect(report.modelCalls).toBe(0);
    expect(report.graphQueries).toBe(0);
    expect(report.incrementalHydraDbSemanticGain).toBe('not_measured');
  });

  it('documents the raw lexical miss on TS and the unapproved alias pilot', () => {
    const report = evaluateGate8cIntent(original, provisional);
    expect(report.baseline.counts.truePositiveMentions).toBe(29);
    expect(report.baseline.counts.falseNegativeMentions).toBe(1);
    expect(report.baseline.counts.falsePositiveMentions).toBe(0);
    expect(report.baseline.counts.exactCases).toBe(19);
    const shorthand = report.baseline.cases.find(x => x.id === 'typescript-parafrase');
    expect(shorthand?.missedSkills).toEqual(['TypeScript']);
    expect(report.tsAliasPilot.counts.truePositiveMentions).toBe(30);
    expect(report.tsAliasPilot.counts.exactCases).toBe(20);
    expect(report.tsAliasPilot.counts.falsePositiveMentions).toBe(0);
    expect(report.tsAliasPilot.mode).toBe('illustrative_unapproved_TS_alias');
  });

  it('exposes that negative mentions are still returned as mandatory by the lexical recognizer', () => {
    const report = evaluateGate8cIntent(original, provisional);
    expect(report.baseline.counts.negatedMentionsRecognizedButMarkedMandatory).toBe(2);
    expect(report.tsAliasPilot.counts.negatedMentionsRecognizedButMarkedMandatory).toBe(2);
    expect(report.mandatoryAccuracy).toBe('not_measured_identifier_defaults_true');
    const mention = report.baseline.cases.find(x => x.id === 'negacao-django');
    expect(mention?.detectedSkills).toContain('Django');
  });

  it('fails closed on a drifted source corpus instead of silently approving labels', () => {
    const changed = original.replace('Pedro já trabalhou', 'Pedro nunca trabalhou');
    expect(() => evaluateGate8cIntent(changed, provisional))
      .toThrow('GATE8C_SOURCE_CORPUS_SHA_MISMATCH');
  });

  it('rejects a span no longer matching the source question exactly', () => {
    const changed = changeDraft(d => { d.cases[0]!.mentions[0]!.start += 1; });
    expect(() => evaluateGate8cIntent(original, changed))
      .toThrow('GATE8C_SPAN_MISMATCH');
  });

  it('rejects contradicting negation role and polarity', () => {
    const changed = changeDraft(d => {
      const item = d.cases.find(c => c.id === 'sem-go-mas-java');
      if (!item) throw new Error('TEST_CASE_MISSING');
      item.mentions[0]!.polarity = 'positive';
    });
    expect(() => evaluateGate8cIntent(original, changed))
      .toThrow('GATE8C_NEGATION_ROLE_MISMATCH');
  });

  it('refuses unsupported promotion to human-approved gold', () => {
    const changed = changeDraft(d => {
      d.reviewStatus = 'human_approved';
    });
    expect(() => evaluateGate8cIntent(original, changed)).toThrow();
  });

  it('rejects a technology identity drift even when its literal span remains valid', () => {
    const changed = changeDraft(d => {
      d.cases[0]!.mentions[0]!.skill = 'Go';
    });
    expect(() => evaluateGate8cIntent(original, changed))
      .toThrow('GATE8C_DRAFT_SKILL_SET_MISMATCH');
  });

  it('rejects duplicate IDs that would otherwise skew the aggregate metrics', () => {
    const changed = changeDraft(d => {
      d.cases[1]!.id = d.cases[0]!.id;
    });
    expect(() => evaluateGate8cIntent(original, changed))
      .toThrow('GATE8C_DUPLICATE_CASE');
  });
});
