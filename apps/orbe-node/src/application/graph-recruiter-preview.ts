import { z } from 'zod';
import { createGroundedRecruiterGraph } from './grounded-recruiter-graph.js';
import { PublicGraphEvidenceGateway } from './graph-public-policy.js';
import { renderProfessionalAdvocacy } from './graph-professional-advocacy.js';
import { verifyAndRenderNarrativeSelection } from './graph-narrative-verifier.js';
import { vacancyRequirementSchema } from '../domain/evidence-graph.js';
import type { VacancyRequirementPlan } from './graph-vacancy-plan.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../domain/evidence-graph.js';

/**
 * F3.3 evidence-first evaluation: used by offline tests and the default-OFF
 * DEV shadow observer. Shadow never replaces public chat output or invokes
 * extra LLMs; the caller owns the canonical PPKS response on abstentions.
 */
export interface GraphRecruiterPreviewOptions {
  evidence: EvidenceGraphRepository;
  identifyRequirements(
    question: string,
  ): readonly VacancyRequirement[] | Promise<readonly VacancyRequirement[]>;
  canonicalPpks(question: string): string | Promise<string>;
  /** Optional structured, audited vacancy analysis: never omit unknown items. */
  requirementPlan?: (question: string) => VacancyRequirementPlan | Promise<VacancyRequirementPlan>;
  /** Explicitly approved related skills, never inferred from visitor text. */
  transferableSkills?: Readonly<Record<string, readonly VacancyRequirement[]>>;
}

export type GraphRecruiterPreviewResult = {
  mode: 'verified_graph' | 'transferable_graph' | 'canonical_ppks';
  answer: string;
  reason:
    | 'verified'
    | 'transferable'
    | 'no_requirements'
    | 'unrecognized_requirements'
    | 'unavailable_or_incomplete';
  matchedRequirements: number;
  /** Public evidence actually attached to verified graph claims. */
  sources?: readonly EvidenceSource[];
  unrecognizedRequirements?: readonly string[];
};

export async function evaluateGraphRecruiterPreview(
  question: string,
  options: GraphRecruiterPreviewOptions,
): Promise<GraphRecruiterPreviewResult> {
  const cleanQuestion = z.string().trim().min(1).max(20_000).parse(question);
  const fallback = async (
    reason: 'no_requirements' | 'unrecognized_requirements' | 'unavailable_or_incomplete',
    unrecognized: readonly string[] = [],
  ): Promise<GraphRecruiterPreviewResult> => {
    const raw = await options.canonicalPpks(cleanQuestion);
    const answer = z.string().trim().min(1).parse(raw);
    return {
      mode: 'canonical_ppks',
      answer,
      reason,
      matchedRequirements: 0,
      ...(unrecognized.length ? { unrecognizedRequirements: [...unrecognized] } : {}),
    };
  };

  let plan: VacancyRequirementPlan | undefined;
  if (options.requirementPlan) {
    try {
      const raw = await options.requirementPlan(cleanQuestion);
      plan = z
        .strictObject({
          requirements: z.array(vacancyRequirementSchema),
          unknown: z.array(
            z.strictObject({ label: z.string().trim().min(1), mandatory: z.boolean() }),
          ),
        })
        .parse(raw);
      if (new Set(plan.requirements.map((item) => item.id)).size !== plan.requirements.length) {
        throw new Error('GRAPH_DUPLICATE_PLANNED_REQUIREMENT');
      }
    } catch {
      return fallback('unavailable_or_incomplete');
    }
    if (plan.unknown.length) {
      return fallback(
        'unrecognized_requirements',
        plan.unknown.map((item) => item.label),
      );
    }
  }

  let result;
  try {
    const graph = createGroundedRecruiterGraph({
      evidence: options.evidence,
      identifyRequirements: plan ? () => plan.requirements : options.identifyRequirements,
    });
    result = await graph.invoke({ question: cleanQuestion }, { recursionLimit: 12 });
  } catch {
    // Failed graph lookup is an explicit abstention, not an invented answer.
    return fallback('unavailable_or_incomplete');
  }
  if (!result.requirements.length) return fallback('no_requirements');
  if (result.retrievalFailed || result.matches.length !== result.requirements.length) {
    return fallback('unavailable_or_incomplete');
  }
  if (result.decision === 'verified') {
    // Only claim IDs may be proposed; the final prose is rendered from
    // the source-complete public graph records, never copied from a model.
    const selection = {
      statements: result.requirements.map((item, index) => ({
        requirementId: item.id,
        claimIds: result.matches[index]?.claims.map((claim) => claim.id) ?? [],
      })),
    };
    const answer = verifyAndRenderNarrativeSelection(
      result.requirements,
      result.matches,
      selection,
    );
    if (!answer) return fallback('unavailable_or_incomplete');
    return {
      mode: 'verified_graph',
      answer,
      reason: 'verified',
      matchedRequirements: result.requirements.length,
      sources: [
        ...new Map(
          result.matches
            .flatMap((match) => match.sources)
            .filter((source) =>
              result.matches.some((match) =>
                match.claims.some((claim) => claim.sourceIds.includes(source.id)),
              ),
            )
            .map((source) => [source.id, source]),
        ).values(),
      ],
    };
  }

  // A gap may be presented constructively only when a vetted, explicit
  // transfer rule can retrieve public evidence about an adjacent skill.
  const missing = result.requirements.filter(
    (_requirement, index) => !result.matches[index]?.claims.length,
  );
  const available = options.transferableSkills;
  if (!missing.length || !available) return fallback('unavailable_or_incomplete');
  const anchors = new Map<string, readonly VacancyRequirement[]>();
  for (const item of missing) {
    const related = available[item.id] ?? [];
    if (!related.length || related.some((anchor) => anchor.id === item.id)) {
      return fallback('unavailable_or_incomplete');
    }
    anchors.set(item.id, related);
  }
  const unique = [...new Map([...anchors.values()].flat().map((item) => [item.id, item])).values()];
  let transferMatches;
  try {
    transferMatches = await new PublicGraphEvidenceGateway(options.evidence).findEvidence(unique);
  } catch {
    return fallback('unavailable_or_incomplete');
  }
  const verified = new Map(transferMatches.map((match) => [match.requirementId, match]));
  const usable = new Map(
    [...anchors].map(([id, related]) => [
      id,
      related
        .map((anchor) => verified.get(anchor.id))
        .filter((match): match is NonNullable<typeof match> => Boolean(match?.claims.length)),
    ]),
  );
  const answer = renderProfessionalAdvocacy(result.requirements, result.matches, usable);
  if (!answer) return fallback('unavailable_or_incomplete');
  return {
    mode: 'transferable_graph',
    answer,
    reason: 'transferable',
    matchedRequirements: result.requirements.length,
  };
}
