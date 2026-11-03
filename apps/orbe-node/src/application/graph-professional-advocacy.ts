import type {
  EvidenceGraphMatch,
  EvidenceClaim,
  VacancyRequirement,
} from '../domain/evidence-graph.js';

const scopeLabels: Readonly<Record<EvidenceClaim['scope'], string>> = {
  professional: 'experiência profissional',
  mixed_role: 'atuação profissional com responsabilidades mistas',
  professional_project: 'projeto profissional',
  personal_project: 'projeto autoral',
  study: 'projeto ou atividade de estudo',
  unknown: 'escopo não confirmado',
};
const rank: Readonly<Record<EvidenceClaim['scope'], number>> = {
  professional: 0,
  mixed_role: 1,
  professional_project: 2,
  personal_project: 3,
  study: 4,
  unknown: 5,
};

function supportingFacts(match: EvidenceGraphMatch, maxClaims = 3): string[] {
  const publicIds = new Set(
    match.sources.filter((source) => source.visibility === 'public').map((source) => source.id),
  );
  return [...match.claims]
    .filter(
      (claim) =>
        claim.sourceIds.length > 0 &&
        claim.sourceIds.every((sourceId) => publicIds.has(sourceId)),
    )
    .sort((a, b) => rank[a.scope] - rank[b.scope] || a.id.localeCompare(b.id))
    .slice(0, maxClaims)
    .map((claim) => {
      // Source text is evidence data, not executable instructions or Markdown markup.
      const label = claim.label.replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
      return `${label} (${scopeLabels[claim.scope]}; fontes: ${claim.sourceIds.join(', ')})`;
    });
}

/**
 * Source-scoped, affirmative first; unproven direct skills are never promoted
 * from transferable knowledge. The reader has already enforced public-only
 * provenance, but the renderer checks each claim's source set again.
 */
export function renderProfessionalAdvocacy(
  requirements: readonly VacancyRequirement[],
  directMatches: readonly EvidenceGraphMatch[],
  transferable: ReadonlyMap<string, readonly EvidenceGraphMatch[]> = new Map(),
): string | undefined {
  if (requirements.length !== directMatches.length) return undefined;
  const positive: string[] = [];
  const adaptation: string[] = [];

  for (const [index, requirement] of requirements.entries()) {
    const direct = directMatches[index];
    if (direct?.requirementId !== requirement.id) return undefined;
    const facts = supportingFacts(direct);
    if (facts.length > 0) {
      positive.push(
        `**${requirement.label}:** Pedro possui evidências documentadas: ${facts.join('; ')}.`,
      );
      continue;
    }
    const related = transferable.get(requirement.id) ?? [];
    const anchors = related.flatMap((match) =>
      supportingFacts(match, 2).map((fact) => `${match.requirementId}: ${fact}`),
    );
    if (anchors.length === 0) return undefined;
    adaptation.push(
      `**${requirement.label}:** Não consta atuação direta com essa tecnologia nas fontes consultadas. ` +
        `Em contrapartida, Pedro tem experiências documentadas que podem facilitar a adaptação: ${anchors.join('; ')}. ` +
        'São competências transferíveis, não comprovação de domínio ou experiência prévia na tecnologia solicitada.',
    );
  }
  if (!positive.length && !adaptation.length) return undefined;
  return [...positive, ...adaptation].join('\n\n');
}
