import { z } from 'zod';
import type { EvidenceGraphSnapshot, VacancyRequirement } from '../domain/evidence-graph.js';

const relationSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      skill: z.string().min(1).optional(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      relation: z.enum([
        'is_a',
        'uses_language',
        'offers_service',
        'uses_concept',
        'supports_concept',
        'compatible_with',
        'transferable_foundation',
      ]),
    }),
  ),
});

export type CuratedSemanticRelations = z.input<typeof relationSchema>;

const skillKey = (label: string): string =>
  label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Map ONLY explicit directional transferable_foundation edges to matching
 * skills in the current PPKS projection. An edge indicates useful learning
 * foundations, never experience in its target technology.
 *
 * No transitive traversal, generic "is_a" inference or arbitrary Go rules.
 */
export function deriveCuratedTransferableSkills(
  snapshot: EvidenceGraphSnapshot,
  input: CuratedSemanticRelations,
): Readonly<Record<string, readonly VacancyRequirement[]>> {
  const relations = relationSchema.parse(input);
  const skills = new Map<string, VacancyRequirement>();
  for (const node of snapshot.nodes) {
    if (node.kind !== 'skill') continue;
    const key = skillKey(node.label);
    if (skills.has(key)) throw new Error('GRAPH_TRANSFER_DUPLICATE_PPKS_SKILL');
    skills.set(key, {
      kind: 'vacancy_requirement',
      id: node.id,
      label: node.label,
      mandatory: true,
    });
  }

  const nodes = new Map<string, (typeof relations.nodes)[number]>();
  for (const node of relations.nodes) {
    if (nodes.has(node.id)) throw new Error('GRAPH_TRANSFER_DUPLICATE_SEMANTIC_NODE');
    nodes.set(node.id, node);
  }

  const mapping = new Map<string, Map<string, VacancyRequirement>>();
  for (const edge of relations.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error('GRAPH_TRANSFER_DANGLING_EDGE');
    }
    if (edge.relation !== 'transferable_foundation') continue;

    const sourceName = nodes.get(edge.from)?.skill;
    const targetName = nodes.get(edge.to)?.skill;
    if (!sourceName || !targetName) throw new Error('GRAPH_TRANSFER_UNMAPPED_ENDPOINT');

    const source = skills.get(skillKey(sourceName));
    const target = skills.get(skillKey(targetName));
    if (!source || !target || source.id === target.id) {
      throw new Error('GRAPH_TRANSFER_UNMAPPED_ENDPOINT');
    }

    const anchors = mapping.get(target.id) ?? new Map<string, VacancyRequirement>();
    anchors.set(source.id, source);
    mapping.set(target.id, anchors);
  }

  return Object.fromEntries(
    [...mapping.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([target, anchors]) => [
        target,
        [...anchors.values()].sort((a, b) => a.id.localeCompare(b.id)),
      ]),
  );
}
