import type {
  EvidenceClaim,
  EvidenceGraphSnapshot,
  EvidenceSource,
} from '../domain/evidence-graph.js';
import type { GenerationResult } from '../domain/ports.js';

type ClaimAuditRule = 'duration' | 'professional_scope' | 'project_scope' | 'degree_status';

export interface GeneratedClaimAudit {
  /** Only known high-risk assertions are audited; this is not universal semantic entailment. */
  readonly answer: string;
  readonly sources: GenerationResult['sources'];
  readonly corrected: number;
  readonly rules: readonly ClaimAuditRule[];
}

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const containsName = (text: string, name: string) => {
  const needle = normalize(name);
  return needle.length >= 2 && (' ' + normalize(text) + ' ').includes(' ' + needle + ' ');
};

const monthLabel = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  const names = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return names[month! - 1] + '/' + year;
};

const monthsInEngagement = (start: string, end: string) => {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey! - sy!) * 12 + em! - sm! + 1;
};

function publicSources(claim: EvidenceClaim, sources: ReadonlyMap<string, EvidenceSource>) {
  if (!claim.sourceIds.length) return [];
  const actual = claim.sourceIds.map((id) => sources.get(id));
  if (
    actual.some(
      (item) => !item || item.visibility !== 'public' || !item.sourceUrl?.startsWith('https://'),
    )
  ) {
    return [];
  }
  return actual as EvidenceSource[];
}

/**
 * Checks only explicitly identifiable, high-risk statements in unconstrained
 * canonical model prose: an employer-specific duration, a claim of professional
 * use of a technology, or a completed degree. The trusted PPKS projection and
 * complete PUBLIC source chains are required for any replacement statement.
 *
 * No arbitrary text is claimed to be semantically verified. Unknown or
 * unsupported phrasing is left to the canonical claim reconciler, and the
 * audited scope is recorded in observability without logging visitor prose.
 */
export function auditGeneratedRecruiterProse(
  answer: string,
  snapshot: EvidenceGraphSnapshot,
): GeneratedClaimAudit {
  const sourceById = new Map<string, EvidenceSource>();
  for (const node of snapshot.nodes) if (node.kind === 'source') sourceById.set(node.id, node);
  const supportedClaims = snapshot.nodes.filter(
    (node): node is EvidenceClaim =>
      node.kind === 'claim' && publicSources(node, sourceById).length > 0,
  );
  const engagements = snapshot.nodes.filter((node) => node.kind === 'engagement');
  const degrees = snapshot.nodes.filter((node) => node.kind === 'degree');
  const projects = snapshot.nodes.filter((node) => node.kind === 'project');
  const skills = snapshot.nodes.filter((node) => node.kind === 'skill');
  const companies = new Map(
    snapshot.nodes.filter((node) => node.kind === 'company').map((node) => [node.id, node.label]),
  );
  const replacementSources = new Map<string, GenerationResult['sources'][number]>();
  const rules: ClaimAuditRule[] = [];
  const cite = (claims: readonly EvidenceClaim[]) => {
    for (const claim of claims) {
      for (const source of publicSources(claim, sourceById)) {
        replacementSources.set(source.id, {
          id: source.id,
          type: source.origin === 'github' ? 'project' : 'profile',
          title: source.label,
          url: source.sourceUrl!,
        });
      }
    }
  };

  // Retain the paragraph boundaries. A flagged bullet/sentence is replaced in
  // full, preventing a trailing unsupported clause from escaping the check.
  const segments = answer.split(/(\n+|(?<=[.!?])\s+(?=[\p{Lu}*•-]))/u);
  const output: string[] = [];
  for (const original of segments) {
    if (!original.trim() || /^\s+$/.test(original)) {
      output.push(original);
      continue;
    }
    let correction: string | undefined;
    const namedEngagements = engagements.filter((engagement) => {
      const company = companies.get(engagement.companyId) ?? '';
      const acronyms = engagement.label.match(/\b[A-Z]{4,}\b/g) ?? [];
      return (
        containsName(original, company) || acronyms.some((item) => containsName(original, item))
      );
    });

    // A duration can be asserted only for ONE named employment engagement.
    // If the sentence mentions two employers, do not attribute the combined
    // duration to either one.
    const duration = /\b(\d{1,3})\s*(anos?|meses?)\b/i.exec(original);
    if (duration) {
      if (namedEngagements.length === 1 && namedEngagements[0]!.endedAt) {
        const engagement = namedEngagements[0]!;
        const expected = monthsInEngagement(engagement.startedAt, engagement.endedAt!);
        const asserted = Number(duration[1]) * (/^ano/i.test(duration[2]!) ? 12 : 1);
        const evidence = supportedClaims.filter((claim) => claim.subjectId === engagement.id);
        if (Math.abs(expected - asserted) > 1) {
          if (evidence.length) {
            const name = companies.get(engagement.companyId) ?? engagement.label;
            correction =
              'Na ' +
              name +
              ', o vínculo documentado vai de ' +
              monthLabel(engagement.startedAt) +
              ' a ' +
              monthLabel(engagement.endedAt!) +
              '.';
            cite(evidence);
          } else {
            correction =
              'A duração específica desse vínculo não pôde ser validada em fontes públicas.';
          }
          rules.push('duration');
        }
      }
    }

    // "Professional experience with X" needs a professional/mixed-role claim,
    // not just a study/personal project mentioning X.
    const explicitlyProfessional =
      /\b(?:experi[eê]ncia profissional|atuou profissionalmente|trabalhou profissionalmente|emprego|em produ[cç][aã]o)\b/i.test(
        original,
      ) &&
      !/\b(?:n[aã]o (?:h[aá]|tem|possui|trabalhou|atuou)|sem experi[eê]ncia)\b/i.test(original);
    if (!correction && explicitlyProfessional) {
      const matchedSkills = skills
        .filter((skill) => containsName(original, skill.label))
        .filter(
          (skill) =>
            !skills.some(
              (other) =>
                other.id !== skill.id &&
                normalize(other.label).includes(normalize(skill.label)) &&
                containsName(original, other.label),
            ),
        );
      for (const skill of matchedSkills) {
        const strong = supportedClaims.filter(
          (claim) =>
            claim.objectId === skill.id &&
            (claim.scope === 'professional' || claim.scope === 'mixed_role'),
        );
        if (strong.length && namedEngagements.length !== 1) continue;
        if (strong.length && strong.some((claim) => claim.subjectId === namedEngagements[0]?.id)) {
          continue;
        }
        if (strong.length && namedEngagements.length === 1) {
          correction =
            'A documentação pública sustenta atuação profissional com ' +
            skill.label +
            ', mas não a atribui a esse vínculo específico.';
          cite(strong);
          rules.push('professional_scope');
          break;
        }
        const studied = supportedClaims.filter((claim) => claim.objectId === skill.id);
        correction = studied.length
          ? 'Pedro possui atividade documentada com ' +
            skill.label +
            ' em escopo de projeto ou estudo; isso não comprova vínculo profissional nessa tecnologia.'
          : 'A documentação pública consultada não confirma atuação profissional em ' +
            skill.label +
            '.';
        cite(studied);
        rules.push('professional_scope');
        break;
      }
    }

    // A technology attributed to a named project must have an explicit
    // public claim linking THAT project to THAT technology. A claim about a
    // different project, or about the candidate generally, is not sufficient.
    if (!correction) {
      const projectAttributions = projects.filter((project) =>
        containsName(original, project.label),
      );
      const technologyAssertion =
        /\b(?:usa|utiliza|integra|implementa|adota|emprega|configura|suporta)\b/i.test(original) &&
        !/\b(?:n[aã]o|nunca|sem)\s+(?:usa|utiliza|integra|implementa|adota|emprega|configura|suporta)\b/i.test(
          original,
        );
      if (projectAttributions.length === 1 && technologyAssertion) {
        const project = projectAttributions[0]!;
        const namedSkills = skills.filter((skill) => containsName(original, skill.label));
        const unsupported = namedSkills.filter(
          (skill) =>
            !supportedClaims.some(
              (claim) =>
                claim.subjectId === project.id &&
                claim.objectId === skill.id &&
                claim.predicate === 'USES_TECHNOLOGY',
            ),
        );
        if (unsupported.length) {
          const supported = supportedClaims.filter(
            (claim) =>
              claim.subjectId === project.id &&
              claim.predicate === 'USES_TECHNOLOGY' &&
              namedSkills.some((skill) => skill.id === claim.objectId),
          );
          correction =
            'A atribuição de ' +
            unsupported.map((skill) => skill.label).join(', ') +
            ' ao projeto ' +
            project.label +
            ' não está comprovada pelas fontes públicas disponíveis.';
          cite(supported);
          rules.push('project_scope');
        }
      }
    }

    // Completed academic status is verified from a degree node whose public
    // enrolment/completion claim has a complete provenance chain.
    if (
      !correction &&
      /\b(?:concluiu|graduou-se|formado em|gradua[cç][aã]o conclu[ií]da)\b/i.test(original) &&
      !/\b(?:n[aã]o concluiu|ainda n[aã]o|sem conclus[aã]o)\b/i.test(original)
    ) {
      for (const degree of degrees) {
        if (!containsName(original, degree.label) || degree.status === 'completed') continue;
        const evidence = supportedClaims.filter((claim) => claim.objectId === degree.id);
        if (!evidence.length) {
          correction = 'A conclusão da graduação mencionada não foi confirmada por fonte pública.';
          rules.push('degree_status');
          break;
        }
        const status =
          degree.status === 'pending_completion'
            ? 'com conclusão pendente'
            : degree.status === 'in_progress'
              ? 'em andamento'
              : 'não verificada';
        correction =
          'A graduação ' + degree.label + ' consta ' + status + ' nas fontes disponíveis.';
        cite(evidence);
        rules.push('degree_status');
        break;
      }
    }
    output.push(correction ?? original);
  }

  return {
    answer: output.join(''),
    sources: [...replacementSources.values()],
    corrected: rules.length,
    rules,
  };
}
