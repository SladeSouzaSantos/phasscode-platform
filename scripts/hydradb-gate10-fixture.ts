/**
 * Synthetic Gate 10 fixture against the UNMODIFIED domain contract shared by
 * main/dev/experiment. No academic, private, production or personal records.
 */
import {
  evidenceGraphSnapshotSchema,
  type EvidenceGraphSnapshot,
  type EvidenceClaim,
  type EvidenceSource,
  type VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const sources: EvidenceSource[] = [
  { kind: 'source', id: 'source-sig-code', label: 'synthetic Java source file', origin: 'github', visibility: 'public', verificationStatus: 'code_reviewed' },
  { kind: 'source', id: 'source-sig-catalog', label: 'synthetic employer catalog', origin: 'ppks_catalog', visibility: 'public', verificationStatus: 'catalog_only' },
  { kind: 'source', id: 'source-java-study', label: 'synthetic training note', origin: 'ppks_catalog', visibility: 'public', verificationStatus: 'catalog_only' },
  { kind: 'source', id: 'source-flutter-code', label: 'synthetic mobile application file', origin: 'github', visibility: 'public', verificationStatus: 'code_reviewed' },
  { kind: 'source', id: 'source-flutter-catalog', label: 'synthetic engineering catalog', origin: 'ppks_catalog', visibility: 'public', verificationStatus: 'catalog_only' },
  { kind: 'source', id: 'source-flutter-personal', label: 'synthetic study repository', origin: 'github', visibility: 'public', verificationStatus: 'code_reviewed' },
];
const claims: EvidenceClaim[] = [
  { kind: 'claim', id: 'claim-java-prof', label: 'Java in professional role (synthetic)', subjectId: 'record-sig', objectId: 'skill-java', predicate: 'USES_TECHNOLOGY', scope: 'professional', sourceIds: ['source-sig-code','source-sig-catalog'] },
  { kind: 'claim', id: 'claim-java-study', label: 'Java in study project (synthetic)', subjectId: 'project-study', objectId: 'skill-java', predicate: 'USES_TECHNOLOGY', scope: 'study', sourceIds: ['source-java-study'] },
  { kind: 'claim', id: 'claim-flutter-mixed', label: 'Flutter in mixed engineering role (synthetic)', subjectId: 'record-green', objectId: 'skill-flutter', predicate: 'USES_TECHNOLOGY', scope: 'mixed_role', sourceIds: ['source-flutter-code','source-flutter-catalog'] },
  { kind: 'claim', id: 'claim-flutter-personal', label: 'Flutter in personal project (synthetic)', subjectId: 'project-personal', objectId: 'skill-flutter', predicate: 'USES_TECHNOLOGY', scope: 'personal_project', sourceIds: ['source-flutter-personal'] },
];
const nodes: EvidenceGraphSnapshot['nodes'][number][] = [
  { kind: 'candidate', id: 'candidate', label: 'synthetic candidate' },
  { kind: 'company', id: 'company-sig', label: 'synthetic enterprise A' },
  { kind: 'company', id: 'company-green', label: 'synthetic engineering team B' },
  { kind: 'engagement', id: 'record-sig', label: 'synthetic developer', candidateId: 'candidate', companyId: 'company-sig', type: 'employee', softwareWorkScope: 'exclusive', areas: ['software-development'], startedAt: '2016-06', endedAt: '2017-02' },
  { kind: 'engagement', id: 'record-green', label: 'synthetic mixed role', candidateId: 'candidate', companyId: 'company-green', type: 'owner', softwareWorkScope: 'mixed', areas: ['software-development','engineering'], startedAt: '2020-01' },
  { kind: 'project', id: 'project-study', label: 'synthetic training', category: 'study' },
  { kind: 'project', id: 'project-personal', label: 'synthetic personal app', category: 'personal' },
  { kind: 'skill', id: 'skill-java', label: 'Java' },
  { kind: 'skill', id: 'skill-flutter', label: 'Flutter' },
  ...sources, ...claims,
];
const relations: EvidenceGraphSnapshot['relations'][number][] =
  claims.flatMap(claim => [
    { from: claim.subjectId, to: claim.objectId, type: 'USES_TECHNOLOGY' as const, sourceIds: [...claim.sourceIds] },
    ...claim.sourceIds.map(id => ({
      from: claim.id, to: id, type: 'SUPPORTED_BY' as const, sourceIds: [id],
    })),
  ]);

export const gate10Fixture = evidenceGraphSnapshotSchema.parse({
  schemaVersion: '1.0',
  nodes,
  relations,
});
export const gate10Requirements: VacancyRequirement[] = [
  { kind: 'vacancy_requirement', id: 'requirement-java', label: 'Java', mandatory: true },
  { kind: 'vacancy_requirement', id: 'requirement-flutter', label: 'Flutter', mandatory: true },
  { kind: 'vacancy_requirement', id: 'requirement-go', label: 'Go', mandatory: false },
];
export const gate10Claims = claims;
export const gate10Sources = sources;
