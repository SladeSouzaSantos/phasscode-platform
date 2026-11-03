import { z } from 'zod';
import { vacancyRequirementSchema, type VacancyRequirement } from '../domain/evidence-graph.js';

/**
 * F3.3: a catalog-driven explicit requirement recognizer, NOT an LLM.
 * Synonyms may be added only from an approved PPKS/skill taxonomy; a
 * taxonomic relation never establishes experience with a related skill.
 */
const skillEntrySchema = z.strictObject({
  id: vacancyRequirementSchema.shape.id,
  label: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(2)).optional(),
});
export type RequirementSkill = z.infer<typeof skillEntrySchema>;

const normalized = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface Pattern {
  id: string;
  label: string;
  phrase: string;
  length: number;
}

export function createCatalogRequirementIdentifier(skills: readonly RequirementSkill[]) {
  const parsed = z.array(skillEntrySchema).parse(skills);
  const ids = new Set<string>();
  const patterns: Pattern[] = [];
  const aliases = new Map<string, string>();
  for (const skill of parsed) {
    if (ids.has(skill.id)) throw new Error('GRAPH_DUPLICATE_SKILL_ID');
    ids.add(skill.id);
    for (const value of [skill.label, ...(skill.aliases ?? [])]) {
      const phrase = normalized(value);
      if (!phrase || phrase.length < 2) throw new Error('GRAPH_INVALID_SKILL_ALIAS');
      const previous = aliases.get(phrase);
      if (previous && previous !== skill.id) {
        throw new Error('GRAPH_AMBIGUOUS_SKILL_ALIAS');
      }
      aliases.set(phrase, skill.id);
      patterns.push({ id: skill.id, label: skill.label, phrase, length: phrase.length });
    }
  }
  // Longest explicit expression wins (SQL Server > SQL, JavaScript > Java).
  const sorted = patterns.sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));

  return (question: string): VacancyRequirement[] => {
    const query = normalized(z.string().trim().min(1).max(20_000).parse(question));
    const occupied: Array<{ start: number; end: number }> = [];
    const found: Array<{ start: number; item: VacancyRequirement }> = [];
    const seen = new Set<string>();
    for (const pattern of sorted) {
      const bounded = ' ' + query + ' ';
      const needle = ' ' + pattern.phrase + ' ';
      let offset = 0;
      while (offset < bounded.length) {
        const at = bounded.indexOf(needle, offset);
        if (at === -1) break;
        // Space padding and canonical punctuation establish true word boundaries.
        const start = at;
        const end = at + needle.length - 1;
        if (
          !seen.has(pattern.id) &&
          !occupied.some((span) => start < span.end && end > span.start)
        ) {
          occupied.push({ start, end });
          found.push({
            start,
            item: {
              kind: 'vacancy_requirement',
              id: pattern.id,
              label: pattern.label,
              mandatory: true,
            },
          });
          seen.add(pattern.id);
        }
        offset = at + 1;
      }
    }
    return found.sort((a, b) => a.start - b.start).map(({ item }) => item);
  };
}


/**
 * Build the explicit vocabulary from the real PPKS graph projection. Records
 * identify skills, not personal competency or proof of employment.
 */
export function createSnapshotRequirementIdentifier(
  snapshot: import('../domain/evidence-graph.js').EvidenceGraphSnapshot,
  approvedAliases: Readonly<Record<string, readonly string[]>> = {},
) {
  const catalog = snapshot.nodes
    .filter((node): node is Extract<typeof node, { kind: 'skill' }> => node.kind === 'skill')
    .map((skill) => ({
      id: skill.id,
      label: skill.label,
      ...(approvedAliases[skill.id] ? { aliases: [...approvedAliases[skill.id]] } : {}),
    }));
  const ids = new Set(catalog.map((entry) => entry.id));
  if (Object.keys(approvedAliases).some((id) => !ids.has(id))) {
    throw new Error('GRAPH_UNKNOWN_SKILL_ALIAS_TARGET');
  }
  return createCatalogRequirementIdentifier(catalog);
}
