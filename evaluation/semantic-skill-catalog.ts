import { z } from 'zod';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const skillSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const semanticSkillCatalogSchema = z.strictObject({
  schemaVersion: z.literal('semantic-skill-catalog-v0'),
  origin: z.literal('ppks_public_project_and_engagement_technology_labels'),
  skills: z.array(skillSchema).min(1),
});

/**
 * Only output public-facing technology names, NEVER the PPKS evidence graph,
 * employment claims, private academic nodes, courses or sources.
 * Skill labels alone cannot establish personal experience with that skill.
 */
export function makeSemanticSkillCatalog(snapshot: EvidenceGraphSnapshot) {
  const skills = snapshot.nodes
    .filter((node): node is Extract<EvidenceGraphSnapshot['nodes'][number], { kind: 'skill' }> =>
      node.kind === 'skill',
    )
    .map(({ id, label }) => ({ id, label }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(skills.map((s) => s.id)).size !== skills.length) {
    throw new Error('SEMANTIC_DUPLICATE_CATALOG_SKILL');
  }
  return semanticSkillCatalogSchema.parse({
    schemaVersion: 'semantic-skill-catalog-v0',
    origin: 'ppks_public_project_and_engagement_technology_labels',
    skills,
  });
}
