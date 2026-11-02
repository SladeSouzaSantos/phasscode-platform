import { z } from 'zod';

/**
 * GraphRAG F3.1: database-neutral, evidence-first contracts.
 * PPKS is the source of truth; Neo4j will be a rebuildable projection.
 * No graph relation alone is proof of employment, mastery or certification.
 */
const nodeId = z.string().regex(/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/);
const label = z.string().trim().min(1);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const timestamp = z.string().datetime({ offset: true });
const sourceRefs = z.array(nodeId).min(1);

const candidate = z.strictObject({
  kind: z.literal('candidate'),
  id: nodeId,
  label,
});
const company = z.strictObject({
  kind: z.literal('company'),
  id: nodeId,
  label,
});
const engagement = z.strictObject({
  kind: z.literal('engagement'),
  id: nodeId,
  label,
  candidateId: nodeId,
  companyId: nodeId,
  type: z.enum(['employee', 'intern', 'owner', 'contractor', 'other', 'not_documented']),
  softwareWorkScope: z.enum(['exclusive', 'mixed', 'not_documented']),
  areas: z.array(z.enum(['software-development', 'engineering', 'other'])).min(1),
  startedAt: month,
  endedAt: month.optional(),
});
const project = z.strictObject({
  kind: z.literal('project'),
  id: nodeId,
  label,
  category: z.enum(['professional', 'personal', 'study']),
});
const skill = z.strictObject({
  kind: z.literal('skill'),
  id: nodeId,
  label,
});
const degree = z.strictObject({
  kind: z.literal('degree'),
  id: nodeId,
  label,
  status: z.enum(['completed', 'in_progress', 'pending_completion', 'not_verified']),
});
const course = z.strictObject({
  kind: z.literal('course'),
  id: nodeId,
  label,
  status: z.enum(['completed', 'in_progress', 'not_verified']),
});
const courseTrack = z.strictObject({
  kind: z.literal('course_track'),
  id: nodeId,
  label,
});
export const evidenceSourceSchema = z.strictObject({
  kind: z.literal('source'),
  id: nodeId,
  label,
  origin: z.enum(['ppks_catalog', 'academic_record', 'github', 'owner_declaration']),
  visibility: z.enum(['public', 'private', 'third_party']),
  verificationStatus: z.enum([
    'catalog_only',
    'owner_confirmed',
    'document_verified',
    'code_reviewed',
    'pending_review',
  ]),
  sourceUrl: z.string().url().optional(),
  sourceCommit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  lastModified: timestamp.optional(),
  verifiedAt: timestamp.optional(),
});
export const evidenceClaimSchema = z.strictObject({
  kind: z.literal('claim'),
  id: nodeId,
  label,
  subjectId: nodeId,
  predicate: z.enum([
    'HAS_ENGAGEMENT',
    'AT_COMPANY',
    'DEVELOPED',
    'USES_TECHNOLOGY',
    'COMPLETED_COURSE',
    'ENROLLED_IN',
    'SUPPORTED_BY',
    'MATCHES_REQUIREMENT',
  ]),
  objectId: nodeId,
  scope: z.enum(['professional', 'mixed_role', 'personal_project', 'study', 'unknown']),
  sourceIds: sourceRefs,
});
export const vacancyRequirementSchema = z.strictObject({
  kind: z.literal('vacancy_requirement'),
  id: nodeId,
  label,
  mandatory: z.boolean(),
});
export const evidenceNodeSchema = z.discriminatedUnion('kind', [
  candidate,
  company,
  engagement,
  project,
  skill,
  degree,
  course,
  courseTrack,
  evidenceClaimSchema,
  evidenceSourceSchema,
  vacancyRequirementSchema,
]);
export const evidenceRelationSchema = z.strictObject({
  from: nodeId,
  to: nodeId,
  type: z.enum([
    'HAS_ENGAGEMENT',
    'AT_COMPANY',
    'DEVELOPED',
    'USES_TECHNOLOGY',
    'COMPLETED_COURSE',
    'ENROLLED_IN',
    'SUPPORTED_BY',
    'MATCHES_REQUIREMENT',
  ]),
  sourceIds: sourceRefs,
});

/** Reject unsupported claims and dangling edges before graph import or answer generation. */
export const evidenceGraphSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal('1.0'),
    nodes: z.array(evidenceNodeSchema),
    relations: z.array(evidenceRelationSchema),
  })
  .superRefine((graph, context) => {
    const ids = new Set<string>();
    const nodeKinds = new Map<string, string>();
    for (const [index, node] of graph.nodes.entries()) {
      if (ids.has(node.id)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: 'GRAPH_DUPLICATE_NODE',
        });
      }
      ids.add(node.id);
      nodeKinds.set(node.id, node.kind);
    }
    const hasSources = (refs: readonly string[], path: (string | number)[]) => {
      for (const sourceId of refs) {
        if (nodeKinds.get(sourceId) !== 'source') {
          context.addIssue({ code: 'custom', path, message: 'GRAPH_UNKNOWN_SOURCE' });
        }
      }
    };
    for (const [index, node] of graph.nodes.entries()) {
      if (node.kind === 'claim') {
        if (!ids.has(node.subjectId) || !ids.has(node.objectId)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index],
            message: 'GRAPH_DANGLING_CLAIM',
          });
        }
        hasSources(node.sourceIds, ['nodes', index, 'sourceIds']);
      }
      if (node.kind === 'engagement') {
        if (
          nodeKinds.get(node.candidateId) !== 'candidate' ||
          nodeKinds.get(node.companyId) !== 'company'
        ) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index],
            message: 'GRAPH_INVALID_ENGAGEMENT',
          });
        }
        if (node.softwareWorkScope === 'exclusive' && node.areas.includes('engineering')) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', index, 'softwareWorkScope'],
            message: 'GRAPH_MIXED_ENGAGEMENT',
          });
        }
      }
    }
    for (const [index, relation] of graph.relations.entries()) {
      if (!ids.has(relation.from) || !ids.has(relation.to)) {
        context.addIssue({
          code: 'custom',
          path: ['relations', index],
          message: 'GRAPH_DANGLING_RELATION',
        });
      }
      hasSources(relation.sourceIds, ['relations', index, 'sourceIds']);
    }
  });

export type EvidenceGraphSnapshot = z.infer<typeof evidenceGraphSnapshotSchema>;
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
export type VacancyRequirement = z.infer<typeof vacancyRequirementSchema>;

export interface EvidenceGraphMatch {
  requirementId: string;
  claims: readonly EvidenceClaim[];
  sources: readonly EvidenceSource[];
}

/**
 * F3.2 will implement this port in a read-only Neo4j adapter.
 * F3.3 will validate claim/source scope before citing or rendering answers.
 */
export interface EvidenceGraphRepository {
  findEvidence(
    requirements: readonly VacancyRequirement[],
    options?: { maxClaimsPerRequirement?: number },
  ): Promise<readonly EvidenceGraphMatch[]>;
  getSource(sourceId: string): Promise<EvidenceSource | undefined>;
}
