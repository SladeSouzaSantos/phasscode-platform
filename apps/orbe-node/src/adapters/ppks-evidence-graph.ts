import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  evidenceGraphSnapshotSchema,
  type EvidenceGraphSnapshot,
  type EvidenceSource,
} from '../domain/evidence-graph.js';
import { loadAcademicEvidence } from './academic.js';

/**
 * Read-only PPKS -> graph projection for F3.1.
 * No LLM calls, database writes, network requests or private document ingestion.
 * The source files remain canonical. Neo4j in F3.2 will only cache this projection.
 */
const indexSchema = z.object({
  projects: z.array(z.object({ id: z.string(), path: z.string() })),
  experiences: z.array(z.object({ id: z.string(), path: z.string() })),
});
const evidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string().url().nullable(),
});
const recordSchema = z.object({
  id: z.string(),
  kind: z.enum(['project', 'experience']),
  identity: z
    .object({
      name: z.string(),
      nature: z.string(),
    })
    .optional(),
  organization: z.string().optional(),
  role: z.string().optional(),
  start: z.string().optional(),
  end: z.string().nullable().optional(),
  areas: z.array(z.enum(['software-development', 'engineering'])).optional(),
  stack: z.array(
    z.object({
      name: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  evidence: z.array(evidenceSchema),
  sync: z.object({
    sourceCommit: z.string().nullable(),
    lastModifiedAt: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    verificationStatus: z.string(),
  }),
});
type PpksRecord = z.infer<typeof recordSchema>;
type Node = EvidenceGraphSnapshot['nodes'][number];
type Relation = EvidenceGraphSnapshot['relations'][number];

const skillId = (name: string) =>
  'skill-' +
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const sourceId = (recordId: string, evidenceId: string) =>
  'source-' + recordId + '-' + evidenceId;

function isGitHubEvidence(record: PpksRecord, evidenceId: string): boolean {
  const evidence = record.evidence.find((item) => item.id === evidenceId);
  return Boolean(
    record.sync.verificationStatus === 'code_reviewed' &&
      evidence &&
      ['source_code', 'test', 'documentation'].includes(evidence.type),
  );
}

/**
 * A verified repository has source-specific proof; a catalog row never inherits
 * verified status or sourceCommit merely because another source was reviewed.
 */
function sourceFromRecord(record: PpksRecord, evidence: PpksRecord['evidence'][number]): EvidenceSource {
  const reviewed = isGitHubEvidence(record, evidence.id);
  const candidate: EvidenceSource = {
    kind: 'source',
    id: sourceId(record.id, evidence.id),
    label: record.id + ': ' + evidence.id,
    origin: reviewed ? 'github' : 'ppks_catalog',
    visibility: 'public',
    verificationStatus: reviewed ? 'code_reviewed' : 'catalog_only',
    ...(evidence.url ? { sourceUrl: evidence.url } : {}),
    ...(reviewed && record.sync.sourceCommit
      ? { sourceCommit: record.sync.sourceCommit }
      : {}),
    ...(reviewed && record.sync.lastModifiedAt
      ? { lastModified: record.sync.lastModifiedAt }
      : {}),
    ...(reviewed && record.sync.reviewedAt
      ? { verifiedAt: record.sync.reviewedAt }
      : {}),
  };
  return candidate;
}

async function readRecord(
  root: string,
  entry: { id: string; path: string },
  directory: 'projects' | 'experiences',
): Promise<PpksRecord> {
  // The index is checked by ppks:check, but never trust paths from data as arbitrary file paths.
  if (!new RegExp('^' + directory + '/[a-z0-9-]+\\.json$').test(entry.path)) {
    throw new Error('PPKS_GRAPH_INVALID_PATH');
  }
  const record = recordSchema.parse(JSON.parse(await readFile(join(root, entry.path), 'utf8')));
  if (record.id !== entry.id || record.kind !== directory.slice(0, -1)) {
    throw new Error('PPKS_GRAPH_INVALID_RECORD');
  }
  return record;
}

/** A deterministic graph snapshot with qualified claim-level evidence. */
export async function projectPpksEvidenceGraph(
  root = 'knowledge/ppks',
): Promise<EvidenceGraphSnapshot> {
  const academic = await loadAcademicEvidence(join(root, 'academic'));
  const index = indexSchema.parse(JSON.parse(await readFile(join(root, 'index.json'), 'utf8')));
  const nodes: Node[] = [{ kind: 'candidate', id: 'candidate', label: 'Perfil PPKS' }];
  const relations: Relation[] = [];
  const ids = new Set<string>(['candidate']);
  const skillNames = new Map<string, string>();

  const add = (node: Node) => {
    if (ids.has(node.id)) throw new Error('PPKS_GRAPH_DUPLICATE_NODE');
    ids.add(node.id);
    nodes.push(node);
  };

  const addSkill = (name: string): string => {
    const id = skillId(name);
    if (id === 'skill-' || (skillNames.has(id) && skillNames.get(id) !== name)) {
      throw new Error('PPKS_GRAPH_SKILL_COLLISION');
    }
    if (!skillNames.has(id)) {
      add({ kind: 'skill', id, label: name });
      skillNames.set(id, name);
    }
    return id;
  };

  for (const degree of academic.educations.values()) {
    const source: EvidenceSource = {
      kind: 'source',
      id: 'source-' + degree.id,
      label: 'PPKS acadêmico: ' + degree.id,
      origin: degree.evidence.includes('owner') ? 'owner_declaration' : 'academic_record',
      visibility: 'private',
      verificationStatus: degree.evidence.includes('owner') ? 'owner_confirmed' : 'document_verified',
    };
    add(source);
    add({ kind: 'degree', id: degree.id, label: degree.title, status: degree.status });
    relations.push({ from: degree.id, to: source.id, type: 'SUPPORTED_BY', sourceIds: [source.id] });
    // "pending_completion" does not establish current enrollment or graduation.
  }

  for (const track of academic.tracks.values()) {
    add({ kind: 'course_track', id: track.id, label: track.name });
    for (const course of track.courses) {
      const source: EvidenceSource = {
        kind: 'source',
        id: 'source-' + course.id,
        label: course.id + ': ' + course.provider,
        origin: course.verification === 'owner_confirmed' ? 'owner_declaration' : 'academic_record',
        visibility: course.evidenceVisibility,
        verificationStatus: course.verification,
      };
      add(source);
      add({ kind: 'course', id: course.id, label: course.title, status: course.status });
      relations.push(
        { from: course.id, to: track.id, type: 'IN_TRACK', sourceIds: [source.id] },
        { from: course.id, to: source.id, type: 'SUPPORTED_BY', sourceIds: [source.id] },
      );
      if (course.status === 'completed') {
        add({
          kind: 'claim',
          id: 'claim-completed-' + course.id,
          label: 'Curso concluído declarado: ' + course.title,
          subjectId: 'candidate',
          predicate: 'COMPLETED_COURSE',
          objectId: course.id,
          scope: 'study',
          sourceIds: [source.id],
        });
        relations.push({
          from: 'candidate',
          to: course.id,
          type: 'COMPLETED_COURSE',
          sourceIds: [source.id],
        });
      }
    }
  }

  const processStack = (
    record: PpksRecord,
    subjectId: string,
    scope: 'professional' | 'mixed_role' | 'professional_project' | 'personal_project' | 'study' | 'unknown',
  ) => {
    const available = new Map(record.evidence.map((item) => [item.id, item]));
    for (const entry of record.stack) {
      if (entry.evidenceIds.length === 0) continue; // Do not assert without evidence.
      const sourceIds = entry.evidenceIds.map((id) => {
        if (!available.has(id)) throw new Error('PPKS_GRAPH_UNKNOWN_EVIDENCE');
        return sourceId(record.id, id);
      });
      const target = addSkill(entry.name);
      add({
        kind: 'claim',
        id: 'claim-' + subjectId + '-' + target,
        label: subjectId + ': ' + entry.name,
        subjectId,
        predicate: 'USES_TECHNOLOGY',
        objectId: target,
        scope,
        sourceIds,
      });
      relations.push({
        from: subjectId,
        to: target,
        type: 'USES_TECHNOLOGY',
        sourceIds,
      });
    }
  };

  for (const entry of index.experiences) {
    const record = await readRecord(root, entry, 'experiences');
    if (!record.organization || !record.role || !record.start || !record.areas?.length)
      throw new Error('PPKS_GRAPH_INCOMPLETE_ENGAGEMENT');
    for (const evidence of record.evidence) add(sourceFromRecord(record, evidence));
    const companyId = skillId(record.organization).replace(/^skill-/, 'company-');
    if (!ids.has(companyId)) add({ kind: 'company', id: companyId, label: record.organization });
    const mixed = record.areas.includes('engineering');
    const evidenceIds = record.evidence.map((item) => sourceId(record.id, item.id));
    if (!evidenceIds.length) throw new Error('PPKS_GRAPH_NO_ENGAGEMENT_SOURCE');
    add({
      kind: 'engagement',
      id: record.id,
      label: record.role,
      candidateId: 'candidate',
      companyId,
      type: /estagi[aá]ri/i.test(record.role) ? 'intern' : 'not_documented',
      softwareWorkScope: mixed ? 'mixed' : 'exclusive',
      areas: record.areas,
      startedAt: record.start,
      ...(record.end ? { endedAt: record.end } : {}),
    });
    relations.push(
      { from: 'candidate', to: record.id, type: 'HAS_ENGAGEMENT', sourceIds: evidenceIds },
      { from: record.id, to: companyId, type: 'AT_COMPANY', sourceIds: evidenceIds },
    );
    processStack(record, record.id, mixed ? 'mixed_role' : 'professional');
  }

  for (const entry of index.projects) {
    const record = await readRecord(root, entry, 'projects');
    if (!record.identity) throw new Error('PPKS_GRAPH_MISSING_IDENTITY');
    for (const evidence of record.evidence) add(sourceFromRecord(record, evidence));
    const nature = record.identity.nature;
    const category =
      nature === 'professional' || nature === 'personal' || nature === 'study' ? nature : 'unknown';
    add({ kind: 'project', id: record.id, label: record.identity.name, category });
    const scope = category === 'professional' ? 'professional_project'
      : category === 'personal' ? 'personal_project' : category;
    processStack(record, record.id, scope);
  }

  return evidenceGraphSnapshotSchema.parse({ schemaVersion: '1.0', nodes, relations });
}
