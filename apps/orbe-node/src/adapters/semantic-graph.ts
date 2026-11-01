import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { KnowledgeDocument } from '../domain/ports.js';
import { knowledgePhrase } from '../knowledge-matching.js';
import type { Skill } from './academic.js';

const nodeSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().min(1),
  kind: z.enum(['concept', 'database', 'language', 'framework', 'platform']),
  aliases: z.array(z.string().min(2)),
  skill: z.string().min(2).optional(),
});
const edgeSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  relation: z.enum([
    'is_a', 'uses_language', 'offers_service', 'uses_concept',
    'supports_concept', 'compatible_with', 'transferable_foundation',
  ]),
  description: z.string().min(15),
});
const graphSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  nodes: z.array(nodeSchema).min(1),
  edges: z.array(edgeSchema),
});
type Graph = z.infer<typeof graphSchema>;
type Node = Graph['nodes'][number];

/** Small, versioned knowledge graph; no database or external runtime requests. */
export class SemanticKnowledgeGraph {
  constructor(
    private readonly graph: Graph,
    private readonly skills: readonly Skill[],
  ) {
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (ids.size !== graph.nodes.length) throw new Error('PPKS_GRAPH_DUPLICATE_NODE');
    if (graph.edges.some(({ from, to }) => !ids.has(from) || !ids.has(to)))
      throw new Error('PPKS_GRAPH_DANGLING_EDGE');
    const knownSkills = new Set(this.skills.map((entry) => entry.skill));
    if (graph.nodes.some(({ skill }) => skill && !knownSkills.has(skill)))
      throw new Error('PPKS_GRAPH_UNKNOWN_SKILL');
  }

  static async load(
    skills: readonly Skill[],
    path = 'knowledge/ppks/semantic-relations.json',
  ): Promise<SemanticKnowledgeGraph> {
    const input: unknown = JSON.parse(await readFile(path, 'utf8'));
    return new SemanticKnowledgeGraph(graphSchema.parse(input), skills);
  }

  private matches(query: string): Node[] {
    const phrase = ' ' + knowledgePhrase(query) + ' ';
    return this.graph.nodes.filter((node) =>
      [node.label, ...node.aliases].some((alias) =>
        phrase.includes(' ' + knowledgePhrase(alias) + ' '),
      ),
    );
  }

  // Explicit sources only. Relationships are not evidence of professional use.
  private directSources(node: Node, documents: readonly KnowledgeDocument[]): string[] {
    const skill = this.skills.find((item) => item.skill === node.skill);
    if (!skill) return [];
    const relevantIds = new Set([
      ...skill.professional, ...skill.projects, ...skill.education, ...skill.courseTracks,
    ]);
    return documents
      .filter((document) => relevantIds.has(document.id))
      .map((document) => {
        const scope = skill.professional.includes(document.id)
          ? 'experiência profissional declarada'
          : skill.projects.includes(document.id)
            ? 'projeto'
            : skill.education.includes(document.id)
              ? 'formação'
              : 'curso';
        return document.id + ' (' + scope + ')';
      });
  }

  /**
   * Only documents surviving context compaction may substantiate a personal claim.
   * Taxonomic links never establish implementation, employment or mastery.
   */
  describe(query: string, documents: readonly KnowledgeDocument[]): string {
    const matched = this.matches(query);
    if (!matched.length || !documents.length) return '';
    const requested = new Set(matched.map((node) => node.id));
    const both = (edge: Graph['edges'][number]) =>
      Number(requested.has(edge.from) && requested.has(edge.to));
    const linked = this.graph.edges
      .filter(({ from, to }) => requested.has(from) || requested.has(to))
      .sort((a, b) =>
        both(b) - both(a) ||
        Number(b.relation === 'transferable_foundation') -
          Number(a.relation === 'transferable_foundation'),
      )
      .slice(0, 3);
    const facts = linked.map((edge) => edge.description);
    const sourceFacts = matched
      .flatMap((node) => {
        const sources = this.directSources(node, documents);
        return sources.length ? [node.label + ': ' + sources.join(', ')] : [];
      })
      .slice(0, 3);
    const items = [
      ...facts,
      ...(sourceFacts.length ? ['Evidências diretas: ' + sourceFacts.join('; ') + '.'] : []),
    ];
    if (!items.length) return '';
    const description = items.join(' ');
    const bounded = description.length > 740 ? description.slice(0, 736) + '...' : description;
    return '\nGrafo semântico (relações técnicas, NÃO comprovação de emprego, ' +
      'uso ou proficiência): ' + bounded;
  }
}
