import type {
  EvidenceGraphMatch,
  EvidenceClaim,
  VacancyRequirement,
} from '../domain/evidence-graph.js';

export interface ProfessionalRenderOptions {
  /** Curated PPKS entity names, never IDs shown to the visitor. */
  readonly labels?: ReadonlyMap<string, string>;
  /** Preserve must-have vs nice-to-have classification in parsed vacancies. */
  readonly showPriority?: boolean;
}

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

function supportingFacts(
  match: EvidenceGraphMatch,
  maxClaims = 3,
  options: ProfessionalRenderOptions = {},
): string[] {
  const publicIds = new Set(
    match.sources.filter((source) => source.visibility === 'public').map((source) => source.id),
  );
  return [...match.claims]
    .filter(
      (claim) =>
        claim.sourceIds.length > 0 && claim.sourceIds.every((sourceId) => publicIds.has(sourceId)),
    )
    .sort((a, b) => rank[a.scope] - rank[b.scope] || a.id.localeCompare(b.id))
    .slice(0, maxClaims)
    .map((claim) => {
      // Source text is evidence data, not executable instructions or Markdown markup.
      const label = claim.label
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 300);
      const technicalPrefix = claim.subjectId + ': ';
      const fact = label.startsWith(technicalPrefix)
        ? label.slice(technicalPrefix.length)
        : label;
      const subject = options.labels?.get(claim.subjectId);
      const skill = options.labels?.get(claim.objectId);
      // Human readable employer/project name comes from typed PPKS identity,
      // not from the technical source ID or an LLM inference.
      const description =
        subject && skill && label.startsWith(technicalPrefix)
          ? `${subject}: ${skill}`
          : fact;
      // Source identifiers remain only in the structured HTTP sources array.
      return `${description} (${scopeLabels[claim.scope]})`;
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
  options: ProfessionalRenderOptions = {},
): string | undefined {
  if (requirements.length !== directMatches.length) return undefined;
  const positive: string[] = [];
  const adaptation: string[] = [];

  for (const [index, requirement] of requirements.entries()) {
    const direct = directMatches[index];
    if (direct?.requirementId !== requirement.id) return undefined;
    const facts = supportingFacts(direct, 3, options);
    if (facts.length > 0) {
      const heading = options.showPriority
        ? `${requirement.mandatory ? 'Requisito obrigatório' : 'Diferencial'} — ${requirement.label}`
        : requirement.label;
      positive.push(
        `**${heading}:** Pedro apresenta evidências documentadas: ${facts.join('; ')}.`,
      );
      continue;
    }
    const related = transferable.get(requirement.id) ?? [];
    const anchors = related.flatMap((match) =>
      supportingFacts(match, 2, options).map((fact) => fact),
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
