/**
 * Gate 8C LAB-only diagnostic of whole-question lexical skill MENTIONS.
 *
 * Expected labels are assistant-authored provisional annotations and MUST NOT
 * be described as independent ground truth. The recognizer detects phrases,
 * not question intent, negation, seniority, scope, or source provenance.
 * No LLM, graph requests, API, private data, or side effects.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createCatalogRequirementIdentifier } from '../apps/orbe-node/src/application/graph-requirements.js';

const mentionSchema = z.strictObject({
  skill: z.string().min(1),
  text: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  intentRole: z.enum([
    'question_target', 'negative_instruction', 'context_only',
    'comparison_target', 'ambiguous',
  ]),
  requestedScope: z.enum([
    'professional', 'mixed_role', 'personal_project',
    'study', 'any', 'undetermined',
  ]),
  polarity: z.enum(['positive', 'negated', 'uncertain']),
  requestedEvidence: z.array(
    z.enum(['code', 'documentation', 'any', 'none']),
  ).min(1),
});
const draftSchema = z.strictObject({
  schemaVersion: z.literal('hydradb-gate8c-intent-draft-v1'),
  reviewStatus: z.literal('assistant_provisional_not_independently_reviewed'),
  origin: z.literal('synthetic_examples_only'),
  sourceCorpus: z.literal('knowledge/evaluations/hydradb-gate8-recruiter.json'),
  sourceCorpusSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.null(),
  reviewedAt: z.null(),
  cases: z.array(z.strictObject({
    id: z.string().min(1),
    questionType: z.enum(['yes_no', 'compare', 'list_evidence', 'vacancy_fit']),
    mentions: z.array(mentionSchema).min(1),
  })),
});
const corpusSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.literal('draft_requires_independent_review'),
  cases: z.array(z.strictObject({
    id: z.string().min(1),
    origin: z.literal('synthetic'),
    question: z.string().min(1),
    expectedSkills: z.array(z.string().min(1)).min(1),
    riskTags: z.array(z.string().min(1)).min(1),
  })),
  knownClaims: z.record(z.string(), z.unknown()),
  knownSourceEvidence: z.record(z.string(), z.unknown()),
});
type DraftMention = z.infer<typeof mentionSchema>;

function requireGate(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    [...left].sort().join('\u0000') === [...right].sort().join('\u0000');
}
function skillId(label: string): string {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  requireGate(normalized.length > 0, 'GATE8C_BAD_SKILL_ID');
  return 'skill-' + normalized;
}
type ScoredCase = Readonly<{
  id: string;
  expectedSkills: readonly string[];
  detectedSkills: readonly string[];
  missedSkills: readonly string[];
  extraSkills: readonly string[];
  exactMentions: boolean;
  exposedNegatedMentionsAsMandatory: number;
}>;
function ratio(n: number, d: number): number | null {
  return d === 0 ? null : Number((n / d).toFixed(4));
}
function score(
  cases: readonly { id: string; question: string; mentions: readonly DraftMention[] }[],
  labels: readonly string[],
  experimentalTsAlias: boolean,
) {
  const dictionary = labels.map(label => ({
    id: skillId(label), label,
    ...(experimentalTsAlias && label === 'TypeScript'
      ? { aliases: ['TS'] } : {}),
  }));
  const identifier = createCatalogRequirementIdentifier(dictionary);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let exactCases = 0;
  let negatedMentionExposures = 0;
  const results: ScoredCase[] = cases.map(item => {
    const predicted = identifier(item.question);
    // No roles are inferred by identifier; mandatory=true is a fixed
    // schema default and MUST NOT be interpreted as a vacancy obligation.
    requireGate(predicted.every(p => p.mandatory),
      'GATE8C_IDENTIFIER_CONTRACT_CHANGED');
    const detected = predicted.map(p => p.label);
    const expected = item.mentions.map(m => m.skill);
    const missed = expected.filter(x => !detected.includes(x));
    const extra = detected.filter(x => !expected.includes(x));
    tp += expected.length - missed.length;
    fn += missed.length;
    fp += extra.length;
    const exact = missed.length === 0 && extra.length === 0 &&
      detected.length === expected.length;
    if (exact) exactCases++;
    const exposed = item.mentions.filter(m =>
      m.polarity === 'negated' && detected.includes(m.skill)
    ).length;
    negatedMentionExposures += exposed;
    return {
      id: item.id,
      expectedSkills: expected,
      detectedSkills: detected,
      missedSkills: missed,
      extraSkills: extra,
      exactMentions: exact,
      exposedNegatedMentionsAsMandatory: exposed,
    };
  });
  return {
    mode: experimentalTsAlias
      ? 'illustrative_unapproved_TS_alias' : 'existing_explicit_lexical_dictionary',
    counts: {
      cases: cases.length, exactCases, truePositiveMentions: tp,
      falsePositiveMentions: fp, falseNegativeMentions: fn,
      mentionPrecision: ratio(tp, tp + fp),
      mentionRecall: ratio(tp, tp + fn),
      mentionF1: ratio(2 * tp, 2 * tp + fp + fn),
      negatedMentionsRecognizedButMarkedMandatory: negatedMentionExposures,
    },
    cases: results,
  };
}
export function evaluateGate8cIntent(
  rawCorpus: string, rawDraft: string,
) {
  const corpus = corpusSchema.parse(JSON.parse(rawCorpus) as unknown);
  const draft = draftSchema.parse(JSON.parse(rawDraft) as unknown);
  const sha = createHash('sha256').update(rawCorpus).digest('hex');
  requireGate(sha === draft.sourceCorpusSha256,
    'GATE8C_SOURCE_CORPUS_SHA_MISMATCH');
  requireGate(corpus.cases.length === 20 && draft.cases.length === 20,
    'GATE8C_CORPUS_CARDINALITY');
  const ids = corpus.cases.map(c => c.id);
  requireGate(new Set(ids).size === ids.length &&
    new Set(draft.cases.map(c => c.id)).size === draft.cases.length,
  'GATE8C_DUPLICATE_CASE');
  const originalById = new Map(corpus.cases.map(c => [c.id, c]));
  const skills = Object.keys(corpus.knownClaims);
  requireGate(skills.length === 10 &&
    sameMembers(skills, Object.keys(corpus.knownSourceEvidence)),
  'GATE8C_CATALOG_DRIFT');

  let totalMentions = 0;
  let negatedMentions = 0;
  const evaluatedCases: Array<{
    id: string; question: string; mentions: DraftMention[];
  }> = [];
  for (const entry of draft.cases) {
    const source = originalById.get(entry.id);
    requireGate(source !== undefined, 'GATE8C_CASE_ID_DRIFT');
    requireGate(
      sameMembers(entry.mentions.map(m => m.skill), source.expectedSkills),
      'GATE8C_DRAFT_SKILL_SET_MISMATCH',
    );
    const mentions = [...entry.mentions].sort((a, b) => a.start - b.start);
    for (const [i, m] of mentions.entries()) {
      requireGate(skills.includes(m.skill), 'GATE8C_UNKNOWN_SKILL');
      requireGate(m.end > m.start && m.end <= source.question.length &&
        source.question.slice(m.start, m.end) === m.text,
      'GATE8C_SPAN_MISMATCH');
      if (i > 0) requireGate(mentions[i - 1]!.end <= m.start,
        'GATE8C_SPAN_OVERLAP');
      if (m.intentRole === 'negative_instruction') {
        requireGate(m.polarity === 'negated' &&
          m.requestedEvidence.length === 1 &&
          m.requestedEvidence[0] === 'none',
        'GATE8C_NEGATION_ROLE_MISMATCH');
      } else {
        requireGate(m.polarity !== 'negated' &&
          !m.requestedEvidence.includes('none'),
        'GATE8C_NEGATION_ROLE_MISMATCH');
      }
      requireGate(new Set(m.requestedEvidence).size === m.requestedEvidence.length,
        'GATE8C_EVIDENCE_DUPLICATED');
      totalMentions++;
      if (m.polarity === 'negated') negatedMentions++;
    }
    evaluatedCases.push({
      id: entry.id, question: source.question, mentions,
    });
  }
  requireGate(totalMentions === 30 && negatedMentions === 2,
    'GATE8C_DRAFT_COVERAGE_DRIFT');
  const baseline = score(evaluatedCases, skills, false);
  const tsAliasPilot = score(evaluatedCases, skills, true);
  return {
    schemaVersion: 'hydradb-gate8c-diagnostic-v1',
    provenance: 'synthetic_examples_only',
    reviewStatus: draft.reviewStatus,
    goldReviewed: false,
    sourceCorpusSha256: sha,
    modelCalls: 0, graphQueries: 0, vectorQueries: 0,
    questionCount: evaluatedCases.length,
    expectedMentionCount: totalMentions,
    draftNegatedMentionCount: negatedMentions,
    baseline,
    tsAliasPilot,
    roleAccuracy: 'not_measured_identifier_does_not_extract_roles',
    scopeAccuracy: 'not_measured_identifier_does_not_extract_scope',
    mandatoryAccuracy: 'not_measured_identifier_defaults_true',
    incrementalHydraDbSemanticGain: 'not_measured',
    limitations: [
      'Assistant-generated synthetic annotations, not independent gold',
      'Scores measure whole-question explicit skill mention detection only',
      'TS alias pilot is unapproved and not applied to production or catalog',
      'Negated mentions are still marked mandatory=true; role is NOT inferred',
      'No answer generation, evidence retrieval, source fidelity, or HydraDB benchmark',
    ],
  };
}
