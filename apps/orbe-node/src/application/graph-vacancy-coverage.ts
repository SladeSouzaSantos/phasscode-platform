import { z } from 'zod';
import {
  createEvidenceAnchoredVacancyPlanner,
  extractVacancyEvidenceFragments,
  type EvidenceAnchoredVacancyOptions,
  type VacancyEvidenceFragment,
} from './graph-vacancy-text.js';
import type { VacancyRequirementPlan } from './graph-vacancy-plan.js';
import type { RequirementSkill } from './graph-requirements.js';

const vacancySchema = z.string().trim().min(1).max(20_000);
const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const mandatorySections = new Set([
  'requisitos',
  'requisitos obrigatorios',
  'requisitos tecnicos',
  'qualificacoes',
  'qualificacoes obrigatorias',
  'conhecimentos',
  'conhecimentos obrigatorios',
  'habilidades',
  'habilidades obrigatorias',
  'must have',
  'requirements',
  'required skills',
]);
const desirableSections = new Set([
  'desejaveis',
  'desejavel',
  'diferenciais',
  'sera um diferencial',
  'nice to have',
  'preferred qualifications',
  'requisitos desejaveis',
]);
const contextSections = new Set([
  'sobre a vaga',
  'sobre a empresa',
  'quem somos',
  'beneficios',
  'responsabilidades',
  'atividades',
  'atribuicoes',
  'o que oferecemos',
  'local de trabalho',
  'remuneracao',
  'salario',
  'modelo de trabalho',
]);

export interface VacancyCoverageSegment {
  readonly line: number;
  /** Exact source sentence/line, not an LLM paraphrase. */
  readonly excerpt: string;
  readonly kind: 'requirement' | 'uninterpreted' | 'context';
  readonly source: 'explicit' | 'prose' | 'context';
  readonly fragmentIds: readonly string[];
}

export interface VacancyCoverageReport {
  readonly status: 'eligible' | 'needs_review' | 'no_requirements';
  readonly fragments: readonly VacancyEvidenceFragment[];
  readonly segments: readonly VacancyCoverageSegment[];
  readonly uninterpreted: readonly VacancyCoverageSegment[];
}

/**
 * Only recognize a bounded set of candidate-facing formulations. Employer
 * descriptions such as "Nossa empresa usa Go" must not become a candidate
 * requirement. Other plausible clauses are surfaced for review, never
 * silently omitted from an assertion of complete coverage.
 */
function findProseRequirement(sentence: string): { text: string; mandatory: boolean } | undefined {
  if (/^(?:nossa empresa|nosso time|nossa equipe|somos|a empresa)\b/i.test(sentence)) {
    return undefined;
  }
  const candidateFacing =
    /\b(?:buscamos|procuramos|requeremos|exigimos|precisamos|valorizamos|esperamos|necess[aá]ri[oa]s?|obrigat[oó]ri[oa]s?|diferencial|desej[aá]ve(?:l|is)|preferencialmente|deve|precisa)\b/i.test(
      sentence,
    ) ||
    /^(?:ter|possuir|experi[eê]ncia|conhecimentos?|familiaridade|dom[ií]nio|viv[eê]ncia)\b/i.test(
      sentence,
    );
  if (!candidateFacing) return undefined;

  const match =
    /\b(?:experi[eê]ncia|conhecimentos?|familiaridade|dom[ií]nio|viv[eê]ncia)\s+(?:com|em|de)\s+(.+)$/i.exec(
      sentence,
    );
  if (!match) return undefined;
  const text = match[1]!
    .replace(
      /\s+(?:[ée]|s[aã]o|ser[aá]|ser[aã]o)\s+(?:um[ao]?\s+)?(?:diferencial|desej[aá]vel|obrigat[oó]ri[oa]|necess[aá]ri[oa]|requisito)\b.*$/i,
      '',
    )
    .replace(/[.!?]+$/, '')
    .trim();
  if (!text) return undefined;
  const mandatory =
    !/\b(?:diferencial|desej[aá]ve(?:l|is)|valorizamos|preferencialmente|nice to have)\b/i.test(
      sentence,
    );
  return { text, mandatory };
}

function plausibleUnparsedRequirement(sentence: string): boolean {
  return /\b(?:buscamos|procuramos|requeremos|exigimos|precisamos|valorizamos|perfil ideal|requisitos|qualifica[cç][oõ]es|experi[eê]ncia|conhecimentos?|familiaridade|dom[ií]nio|desej[aá]vel|diferencial|imprescind[ií]vel|obrigat[oó]rio)\b/i.test(
    sentence,
  );
}

function stripMarkup(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^[-*•]\s+/, '')
    .trim();
}

/**
 * Audit all lines, and candidate-facing sentences outside explicit headings.
 * This report is scoped to a conservative grammar, not a guarantee that
 * arbitrary natural-language vacancy text has been exhaustively understood.
 */
export function analyzeVacancyEvidenceCoverage(input: string): VacancyCoverageReport {
  const source = vacancySchema.parse(input);
  const fragments: VacancyEvidenceFragment[] = [];
  const segments: VacancyCoverageSegment[] = [];
  let section: 'mandatory' | 'desirable' | undefined;

  const record = (
    line: number,
    excerpt: string,
    kind: VacancyCoverageSegment['kind'],
    origin: VacancyCoverageSegment['source'],
    extracted: readonly VacancyEvidenceFragment[] = [],
  ) => {
    const fragmentIds: string[] = [];
    for (const item of extracted) {
      const id = 'fragment-' + fragments.length;
      fragmentIds.push(id);
      fragments.push({ id, excerpt: item.excerpt, mandatory: item.mandatory });
    }
    segments.push({ line, excerpt, kind, source: origin, fragmentIds });
  };

  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = stripMarkup(original.trim());
    if (!line) continue;
    const colon = line.indexOf(':');
    const heading = normalize(colon >= 0 ? line.slice(0, colon) : line);
    if (contextSections.has(heading)) {
      section = undefined;
      record(index + 1, line, 'context', 'context');
      continue;
    }
    const mandatory = mandatorySections.has(heading);
    const desirable = desirableSections.has(heading);
    if (mandatory || desirable) {
      section = mandatory ? 'mandatory' : 'desirable';
      const extracted = extractVacancyEvidenceFragments(line);
      record(
        index + 1,
        line,
        extracted.length ? 'requirement' : 'context',
        extracted.length ? 'explicit' : 'context',
        extracted,
      );
      continue;
    }

    // Existing signposted-line parser remains the source of truth.
    const inline = extractVacancyEvidenceFragments(line);
    if (inline.length) {
      record(index + 1, line, 'requirement', 'explicit', inline);
      continue;
    }
    if (section) {
      const extracted = extractVacancyEvidenceFragments(
        (section === 'mandatory' ? 'Requisitos:' : 'Diferenciais:') + '\n' + line,
      );
      record(index + 1, line, 'requirement', 'explicit', extracted);
      continue;
    }

    // Split only at sentence boundaries, never within "Node.js" or "C#".
    const sentences = line.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9])/u);
    for (const sentence of sentences) {
      const requirement = findProseRequirement(sentence);
      if (requirement) {
        const extracted = extractVacancyEvidenceFragments(
          (requirement.mandatory ? 'Requisitos: ' : 'Diferenciais: ') + requirement.text,
        );
        record(index + 1, sentence, 'requirement', 'prose', extracted);
      } else if (plausibleUnparsedRequirement(sentence)) {
        record(index + 1, sentence, 'uninterpreted', 'prose');
      } else {
        record(index + 1, sentence, 'context', 'context');
      }
    }
  }

  const uninterpreted = segments.filter((item) => item.kind === 'uninterpreted');
  return {
    status: uninterpreted.length
      ? 'needs_review'
      : fragments.length
        ? 'eligible'
        : 'no_requirements',
    fragments,
    segments,
    uninterpreted,
  };
}

/**
 * Offline-only adapter for the existing anchored planner. Every candidate
 * requirement keeps its exact source wording and classification. No Neo4j
 * lookup or LLM call is allowed if an unresolved clause remains.
 */
export function createCoverageAwareVacancyPlanner(
  skills: readonly RequirementSkill[],
  options: EvidenceAnchoredVacancyOptions = {},
): {
  inspect(text: string): VacancyCoverageReport;
  plan(text: string): Promise<VacancyRequirementPlan>;
} {
  const anchored = createEvidenceAnchoredVacancyPlanner(skills, options);
  return {
    inspect: analyzeVacancyEvidenceCoverage,
    async plan(text) {
      const report = analyzeVacancyEvidenceCoverage(text);
      if (report.status === 'needs_review') {
        throw new Error('GRAPH_VACANCY_UNINTERPRETED_TEXT');
      }
      if (report.status === 'no_requirements') {
        throw new Error('GRAPH_VACANCY_NO_EXPLICIT_REQUIREMENTS');
      }
      // Reconstruct only previously extracted, exact snippets. The existing
      // Zod, source-anchor, composite and unknown-skill gates still run.
      const explicit = report.fragments
        .map((item) => (item.mandatory ? 'Requisitos: ' : 'Diferenciais: ') + item.excerpt)
        .join('\n');
      return anchored(explicit);
    },
  };
}
