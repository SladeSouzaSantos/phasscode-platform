import { z } from 'zod';

/**
 * F3.7/#44: pure, model-independent contract. This module does NOT run models,
 * call GraphRAG, or authorize a public answer.
 *
 * A suggestion is NOT evidence of a candidate's experience.
 */
const idSchema = z.string().regex(/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/);
const anchorSchema = z.strictObject({
  id: idSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1).max(2_000),
});

export const semanticPlannerRequestSchema = z.strictObject({
  schemaVersion: z.literal('semantic-planner-v1'),
  sourceText: z.string().min(1).max(20_000),
  anchors: z.array(anchorSchema).min(1).max(256),
  publicCatalogSkillIds: z.array(idSchema).max(4_096),
});

const roleSchema = z.enum([
  'mandatory',
  'desirable',
  'alternative',
  'context',
  'negated',
  'uncertain',
]);
const relationSchema = z.enum([
  'candidate_requirement',
  'company_stack',
  'future_stack',
  'project_claim',
  'unrelated',
]);

const candidateSchema = z.strictObject({
  skillId: idSchema,
  score: z.number().finite().min(0).max(1),
  method: z.enum(['lexical', 'embedding']),
});

const semanticSuggestionSchema = z.strictObject({
  anchor: anchorSchema,
  status: z.enum(['suggested', 'abstained']),
  role: roleSchema,
  relation: relationSchema.nullable(),
  priority: z.enum(['mandatory', 'desirable', 'none']),
  origin: z.enum(['literal_rules', 'existing_budgeted_llm']).nullable(),
  alternativeGroup: idSchema.optional(),
  candidates: z.array(candidateSchema).max(10),
});

export const semanticPlannerProposalSchema = z.strictObject({
  schemaVersion: z.literal('semantic-planner-v1'),
  mode: z.literal('diagnostic_only'),
  suggestions: z.array(semanticSuggestionSchema).min(1).max(256),
});

export type SemanticPlannerRequest = z.infer<typeof semanticPlannerRequestSchema>;
export type SemanticPlannerProposal = z.infer<typeof semanticPlannerProposalSchema>;

/**
 * A future adapter may apply lexical rules, optionally rank public catalog
 * labels using an ONNX embedding model, or ask Orbe's EXISTING budgeted LLM
 * to suggest a classification when truly ambiguous. None are mandatory.
 *
 * The port is intentionally disconnected from the public application.
 */
export interface SemanticPlannerPort {
  propose(request: SemanticPlannerRequest): Promise<unknown>;
}

function reject(reason: string): never {
  throw new Error(`SEMANTIC_PLANNER_${reason}`);
}

/**
 * Validate model/rule *suggestions*, never factual candidate claims.
 * Output is traceable, complete relative to supplied anchors, and remains
 * diagnostic until independent coverage and evidence checks approve a path.
 */
export function validateSemanticPlannerProposal(
  request: unknown,
  proposal: unknown,
): SemanticPlannerProposal {
  const input = semanticPlannerRequestSchema.safeParse(request);
  if (!input.success) reject('INVALID_REQUEST');
  const result = semanticPlannerProposalSchema.safeParse(proposal);
  if (!result.success) reject('INVALID_PROPOSAL');

  const source = input.data.sourceText;
  const ordered = [...input.data.anchors].sort((a, b) => a.start - b.start);
  const anchorIds = new Set<string>();
  let lastEnd = 0;
  for (const anchor of ordered) {
    if (
      anchorIds.has(anchor.id) ||
      anchor.start < lastEnd ||
      anchor.start >= anchor.end ||
      source.slice(anchor.start, anchor.end) !== anchor.text
    ) {
      reject('UNGROUNDED_ANCHOR');
    }
    anchorIds.add(anchor.id);
    lastEnd = anchor.end;
  }

  const catalog = new Set(input.data.publicCatalogSkillIds);
  if (catalog.size !== input.data.publicCatalogSkillIds.length) {
    reject('DUPLICATE_CATALOG_SKILL');
  }
  if (result.data.suggestions.length !== input.data.anchors.length) {
    reject('INCOMPLETE_COVERAGE');
  }

  const byAnchor = new Map(input.data.anchors.map((a) => [a.id, a]));
  const seen = new Set<string>();
  for (const decision of result.data.suggestions) {
    const span = byAnchor.get(decision.anchor.id);
    if (
      !span ||
      seen.has(span.id) ||
      span.start !== decision.anchor.start ||
      span.end !== decision.anchor.end ||
      span.text !== decision.anchor.text
    ) {
      reject('SPAN_MISMATCH');
    }
    seen.add(span.id);

    const candidates = new Set<string>();
    for (const candidate of decision.candidates) {
      if (!catalog.has(candidate.skillId) || candidates.has(candidate.skillId)) {
        reject('UNTRUSTED_CANDIDATE');
      }
      candidates.add(candidate.skillId);
    }

    if (decision.status === 'abstained') {
      if (
        decision.role !== 'uncertain' ||
        decision.relation !== null ||
        decision.priority !== 'none' ||
        decision.origin !== null ||
        decision.alternativeGroup !== undefined ||
        decision.candidates.length > 0
      ) {
        reject('INVALID_ABSTENTION');
      }
      continue;
    }

    if (decision.role === 'uncertain' || decision.relation === null || !decision.origin) {
      reject('UNSAFE_SUGGESTION');
    }

    const isRequirement = decision.relation === 'candidate_requirement';
    if (
      (['mandatory', 'desirable', 'alternative'].includes(decision.role) && !isRequirement) ||
      (['context', 'negated'].includes(decision.role) && decision.priority !== 'none') ||
      (!isRequirement && decision.priority !== 'none') ||
      (decision.role === 'mandatory' && decision.priority !== 'mandatory') ||
      (decision.role === 'desirable' && decision.priority !== 'desirable') ||
      (decision.role === 'alternative' && decision.priority === 'none')
    ) {
      reject('ROLE_PRIORITY_CONFLICT');
    }
    if (
      (decision.role === 'alternative' && !decision.alternativeGroup) ||
      (decision.role !== 'alternative' && decision.alternativeGroup !== undefined)
    ) {
      reject('INVALID_ALTERNATIVE_GROUP');
    }
  }

  return result.data;
}
