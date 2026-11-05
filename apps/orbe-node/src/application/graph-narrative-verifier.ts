import { z } from 'zod';
import type { EvidenceGraphMatch, VacancyRequirement } from '../domain/evidence-graph.js';
import {
  renderProfessionalAdvocacy,
  type ProfessionalRenderOptions,
} from './graph-professional-advocacy.js';

const narrativePlanSchema = z.strictObject({
  statements: z.array(
    z.strictObject({
      requirementId: z.string().min(1),
      claimIds: z.array(z.string().min(1)).min(1),
    }),
  ),
});

export type GroundedNarrativeSelection = z.input<typeof narrativePlanSchema>;

/**
 * Fail-closed factual gate for a proposed answer plan. An LLM may propose
 * claim IDs, but never directly inject unchecked free-prose assertions into
 * the recruiter response. The only output text is rendered from supported
 * public claims with complete provenance and verified scope.
 *
 * This does NOT claim to semantically verify arbitrary natural-language text.
 */
export function verifyAndRenderNarrativeSelection(
  requirements: readonly VacancyRequirement[],
  matches: readonly EvidenceGraphMatch[],
  input: GroundedNarrativeSelection,
  renderOptions: ProfessionalRenderOptions = {},
): string | undefined {
  const result = narrativePlanSchema.safeParse(input);
  if (!result.success || matches.length !== requirements.length) return undefined;
  if (result.data.statements.length !== requirements.length) return undefined;

  const proposals = new Map<string, readonly string[]>();
  for (const statement of result.data.statements) {
    if (proposals.has(statement.requirementId)) return undefined;
    if (new Set(statement.claimIds).size !== statement.claimIds.length) return undefined;
    proposals.set(statement.requirementId, statement.claimIds);
  }

  const selected: EvidenceGraphMatch[] = [];
  for (const [index, requirement] of requirements.entries()) {
    const match = matches[index];
    const requestedIds = proposals.get(requirement.id);
    if (!match || match.requirementId !== requirement.id || !requestedIds) return undefined;

    const publicSources = new Map(
      match.sources
        .filter((source) => source.visibility === 'public')
        .map((source) => [source.id, source]),
    );
    const available = new Map(match.claims.map((claim) => [claim.id, claim]));
    const claims = [];
    for (const id of requestedIds) {
      const claim = available.get(id);
      if (
        !claim ||
        claim.scope === 'unknown' ||
        claim.sourceIds.length === 0 ||
        !claim.sourceIds.every((sourceId) => publicSources.has(sourceId))
      ) {
        return undefined;
      }
      claims.push(claim);
    }

    const cited = new Set(claims.flatMap((claim) => claim.sourceIds));
    selected.push({
      requirementId: match.requirementId,
      claims,
      sources: [...publicSources.values()].filter((source) => cited.has(source.id)),
    });
  }

  return renderProfessionalAdvocacy(requirements, selected, new Map(), renderOptions);
}
