import { z } from 'zod';
import type { VacancyRequirement } from '../domain/evidence-graph.js';
import type { RequirementSkill } from './graph-requirements.js';

const itemSchema = z.strictObject({
  label: z.string().trim().min(1).max(250),
  mandatory: z.boolean(),
});
const catalogSchema = z.array(
  z.strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/),
    label: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(2)).optional(),
  }),
);

export type VacancyItem = z.infer<typeof itemSchema>;
export interface VacancyRequirementPlan {
  readonly requirements: readonly VacancyRequirement[];
  readonly unknown: readonly VacancyItem[];
}

const normalized = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Exact item-by-item matching for a trusted structured vacancy extraction.
 * Unlike substring matching, unknown Go, Rust, certification or framework
 * requirements are never discarded nor silently marked as covered.
 *
 * A separate, untrusted vacancy-text extractor must produce explicit items;
 * this function does not pretend to interpret arbitrary free-form postings.
 */
export function createStructuredVacancyPlanner(skills: readonly RequirementSkill[]) {
  const catalog = catalogSchema.parse(skills);
  const aliases = new Map<string, (typeof catalog)[number]>();
  const skillIds = new Set<string>();

  for (const skill of catalog) {
    if (skillIds.has(skill.id)) throw new Error('GRAPH_VACANCY_DUPLICATE_SKILL');
    skillIds.add(skill.id);
    for (const name of [skill.label, ...(skill.aliases ?? [])]) {
      const key = normalized(name);
      if (key.length < 2) throw new Error('GRAPH_VACANCY_INVALID_ALIAS');
      const previous = aliases.get(key);
      if (previous && previous.id !== skill.id) throw new Error('GRAPH_VACANCY_AMBIGUOUS_ALIAS');
      aliases.set(key, skill);
    }
  }

  return (items: readonly VacancyItem[]): VacancyRequirementPlan => {
    const parsed = z.array(itemSchema).parse(items);
    const known = new Map<string, VacancyRequirement>();
    const unknown = new Map<string, VacancyItem>();

    for (const item of parsed) {
      const key = normalized(item.label);
      const skill = aliases.get(key);
      if (skill) {
        const previous = known.get(skill.id);
        known.set(skill.id, {
          kind: 'vacancy_requirement',
          id: skill.id,
          label: skill.label,
          mandatory: item.mandatory || previous?.mandatory === true,
        });
      } else {
        const previous = unknown.get(key);
        unknown.set(key, {
          label: previous?.label ?? item.label,
          mandatory: item.mandatory || previous?.mandatory === true,
        });
      }
    }
    return { requirements: [...known.values()], unknown: [...unknown.values()] };
  };
}
