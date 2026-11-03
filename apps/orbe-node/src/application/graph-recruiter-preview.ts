import { z } from 'zod';
import { createGroundedRecruiterGraph } from './grounded-recruiter-graph.js';
import { PublicGraphEvidenceGateway } from './graph-public-policy.js';
import { renderProfessionalAdvocacy } from './graph-professional-advocacy.js';
import type { EvidenceGraphRepository, VacancyRequirement } from '../domain/evidence-graph.js';

/**
 * F3.3 offline orchestration preview. This adapter is intentionally not wired
 * into chat/main.ts or any HTTP route, and cannot initiate extra LLM calls.
 * The caller owns the canonical PPKS response on all abstentions/failures.
 */
export interface GraphRecruiterPreviewOptions {
  evidence: EvidenceGraphRepository;
  identifyRequirements(
    question: string,
  ): readonly VacancyRequirement[] | Promise<readonly VacancyRequirement[]>;
  canonicalPpks(question: string): string | Promise<string>;
  /** Explicitly approved related skills, never inferred from visitor text. */
  transferableSkills?: Readonly<Record<string, readonly VacancyRequirement[]>>;
}

export type GraphRecruiterPreviewResult = {
  mode: 'verified_graph' | 'transferable_graph' | 'canonical_ppks';
  answer: string;
  reason: 'verified' | 'transferable' | 'no_requirements' | 'unavailable_or_incomplete';
  matchedRequirements: number;
};

export async function evaluateGraphRecruiterPreview(
  question: string,
  options: GraphRecruiterPreviewOptions,
): Promise<GraphRecruiterPreviewResult> {
  const cleanQuestion = z.string().trim().min(1).max(20_000).parse(question);
  const fallback = async (
    reason: 'no_requirements' | 'unavailable_or_incomplete',
  ): Promise<GraphRecruiterPreviewResult> => {
    const raw = await options.canonicalPpks(cleanQuestion);
    const answer = z.string().trim().min(1).parse(raw);
    return { mode: 'canonical_ppks', answer, reason, matchedRequirements: 0 };
  };
  let result;
  try {
    const graph = createGroundedRecruiterGraph({
      evidence: options.evidence,
      identifyRequirements: options.identifyRequirements,
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
    const answer = renderProfessionalAdvocacy(result.requirements, result.matches);
    if (!answer) return fallback('unavailable_or_incomplete');
    return {
      mode: 'verified_graph',
      answer,
      reason: 'verified',
      matchedRequirements: result.requirements.length,
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
