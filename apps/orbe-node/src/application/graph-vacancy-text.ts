import { z } from 'zod';
import {
  createStructuredVacancyPlanner,
  type VacancyRequirementPlan,
} from './graph-vacancy-plan.js';
import type { RequirementSkill } from './graph-requirements.js';

const vacancySchema = z.string().trim().min(1).max(20_000);
const fragmentSchema = z.strictObject({
  id: z.string().regex(/^fragment-[0-9]+$/),
  excerpt: z.string().trim().min(1),
  mandatory: z.boolean(),
});
const proposalSchema = z.strictObject({
  id: fragmentSchema.shape.id,
  excerpt: fragmentSchema.shape.excerpt,
  label: z.string().trim().min(1).max(250),
});

export type VacancyEvidenceFragment = z.infer<typeof fragmentSchema>;
export type VacancyLabelProposal = z.infer<typeof proposalSchema>;

export interface EvidenceAnchoredVacancyOptions {
  /**
   * Optional, separately budgeted semantic label selector (LLM or deterministic).
   * It must not be trusted: fragments must be returned exactly once and their
   * evidence quotations must match the vacancy literally.
   */
  proposeLabels?: (
    fragments: readonly VacancyEvidenceFragment[],
  ) => Promise<readonly VacancyLabelProposal[]> | readonly VacancyLabelProposal[];
}

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const requiredHeadings = new Set([
  'requisitos', 'requisitos obrigatorios', 'requisitos tecnicos',
  'qualificacoes', 'qualificacoes obrigatorias',
  'conhecimentos', 'conhecimentos obrigatorios',
  'habilidades', 'habilidades obrigatorias',
  'must have', 'requirements', 'required skills',
]);
const optionalHeadings = new Set([
  'desejaveis', 'desejavel', 'diferenciais', 'sera um diferencial',
  'nice to have', 'preferred qualifications', 'requisitos desejaveis',
]);
const endHeadings = new Set([
  'beneficios', 'sobre a empresa', 'quem somos',
  'responsabilidades', 'atividades', 'atribuicoes', 'o que oferecemos',
  'local de trabalho', 'remuneracao', 'salario', 'modelo de trabalho',
]);
const inlineRequired =
  /^(?:exigimos|precisamos de|requeremos|requisitos para a vaga|buscamos experiencia em|buscamos conhecimento em)\s*:?\s*(.+)$/;
const inlineOptional =
  /^(?:desejavel|ser[aá] um diferencial|diferencial|nice to have|preferencialmente)\s*:?\s*(.+)$/;
const bullet = /^(?:[-*•]\s+|[0-9]+[.)]\s+)/;

function splitRequirements(raw: string): string[] {
  // Alternatives ("Java ou C#"), slash groups and qualifiers are kept together
  // and thus stay unknown unless separately and safely interpreted.
  return raw
    .replace(/[.!?]+$/g, '')
    .split(/\s*[,;]\s*|\s+e\s+(?=[\p{L}#])/iu)
    .map((part) => part.trim().replace(/[.!?]+$/g, '').trim())
    .filter(Boolean);
}

/**
 * Only explicitly signposted requirement sections and statements are covered.
 * A free-form paragraph outside such a section is NOT assumed to be fully
 * interpreted; do not claim exhaustive extraction from arbitrary prose.
 */
export function extractVacancyEvidenceFragments(input: string): VacancyEvidenceFragment[] {
  const text = vacancySchema.parse(input);
  const fragments: VacancyEvidenceFragment[] = [];
  let section: 'required' | 'optional' | undefined;

  const add = (raw: string, mandatory: boolean) => {
    for (const excerpt of splitRequirements(raw)) {
      fragments.push({
        id: `fragment-${fragments.length}`,
        excerpt,
        mandatory,
      });
    }
  };

  for (const original of text.split(/\r?\n/)) {
    const trimmed = original.trim();
    if (!trimmed) continue;
    const line = trimmed.replace(bullet, '').trim();
    const colon = line.indexOf(':');
    const heading = normalize(colon >= 0 ? line.slice(0, colon) : line);
    if (endHeadings.has(heading)) {
      section = undefined;
      continue;
    }
    const required = requiredHeadings.has(heading);
    const optional = optionalHeadings.has(heading);
    if (required || optional) {
      section = optional ? 'optional' : 'required';
      // An inline list is parsed from original text, never a normalized paraphrase.
      if (colon >= 0) add(line.slice(colon + 1), required);
      continue;
    }

    const explicitOptional = inlineOptional.exec(line);
    const explicitRequired = inlineRequired.exec(line);
    if (explicitOptional || explicitRequired) {
      add((explicitOptional ?? explicitRequired)![1]!, Boolean(explicitRequired));
      continue;
    }
    if (section) {
      add(line, section === 'required');
    }
  }
  return fragments;
}

// Only these non-technical modifiers may be stripped around a proposed
// skill name. Anything substantive left unaccounted for is preserved as
// an UNKNOWN requirement (e.g. SQL Server proposed as "SQL").
const modifierWords = new Set(
  [
    'conhecimento', 'conhecimentos', 'em', 'de', 'com', 'experiencia',
    'profissional', 'previa', 'solida', 'pratica', 'dominio', 'familiaridade',
    'bons', 'boas', 'nivel', 'basico', 'intermediario', 'avancado',
    'requerido', 'requerida', 'obrigatorio', 'obrigatoria', 'desejavel',
    'vivencia', 'utilizacao', 'uso', 'da', 'do', 'na', 'no',
  ],
);

function proposalCoversFragment(excerpt: string, label: string): boolean {
  const full = normalize(excerpt);
  const selected = normalize(label);
  if (!selected) return false;
  const bounded = ' ' + full + ' ';
  const at = bounded.indexOf(' ' + selected + ' ');
  if (at < 0) return false;
  const remainder =
    (bounded.slice(0, at) + ' ' + bounded.slice(at + selected.length + 2)).trim();
  return remainder.split(/\s+/).every((word) => !word || modifierWords.has(word));
}

function defaultLabel(fragment: VacancyEvidenceFragment): string {
  return fragment.excerpt
    .replace(
      /^(?:experi[eê]ncia(?:\s+(?:profissional|pr[eé]via|s[oó]lida))?\s+com|conhecimentos?\s+(?:em|de)|dom[ií]nio\s+de|familiaridade\s+com|viv[eê]ncia\s+(?:em|com)|uso\s+de)\s+/i,
      '',
    )
    .trim();
}

/**
 * F3.3 offline, budget-neutral bridge from signposted job prose to a
 * structured plan. An optional model may select labels, but cannot add
 * claims, invent vacancies, omit unknown terms or change required status.
 */
export function createEvidenceAnchoredVacancyPlanner(
  skills: readonly RequirementSkill[],
  options: EvidenceAnchoredVacancyOptions = {},
) {
  const planStructured = createStructuredVacancyPlanner(skills);
  return async (vacancyText: string): Promise<VacancyRequirementPlan> => {
    const fragments = extractVacancyEvidenceFragments(vacancyText);
    if (fragments.length === 0) throw new Error('GRAPH_VACANCY_NO_EXPLICIT_REQUIREMENTS');

    const proposed: readonly VacancyLabelProposal[] = options.proposeLabels
      ? await options.proposeLabels(fragments)
      : fragments.map((fragment) => ({
          id: fragment.id,
          excerpt: fragment.excerpt,
          label: defaultLabel(fragment),
        }));
    const proposals = z.array(proposalSchema).parse(proposed);
    if (proposals.length !== fragments.length) throw new Error('GRAPH_VACANCY_PROPOSAL_OMISSION');

    const byId = new Map<string, VacancyLabelProposal>();
    for (const item of proposals) {
      if (byId.has(item.id)) throw new Error('GRAPH_VACANCY_DUPLICATE_PROPOSAL');
      byId.set(item.id, item);
    }
    const items = fragments.map((fragment) => {
      const item = byId.get(fragment.id);
      if (!item || item.excerpt !== fragment.excerpt) {
        throw new Error('GRAPH_VACANCY_UNGROUNDED_PROPOSAL');
      }
      // Reject invented claims before checking the PPKS catalog. If the model
      // tries to shorten an inseparable composite, keep ALL of it unknown.
      const label = proposalCoversFragment(fragment.excerpt, item.label)
        ? item.label
        : fragment.excerpt;
      // A hallucinated label not even in the source is a hard fail.
      const selected = normalize(item.label);
      const excerpt = normalize(fragment.excerpt);
      if (!(' ' + excerpt + ' ').includes(' ' + selected + ' ')) {
        throw new Error('GRAPH_VACANCY_HALLUCINATED_LABEL');
      }
      return { label, mandatory: fragment.mandatory };
    });
    return planStructured(items);
  };
}
