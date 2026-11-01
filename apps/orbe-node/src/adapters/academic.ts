import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { KnowledgeDocument } from '../domain/ports.js';
import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';

interface Coursework {
  name: string;
  status: 'approved' | 'curriculum_topic';
  hours: number | null;
  evidence: string;
}
interface Education {
  id: string;
  title: string;
  level: string;
  institution: string;
  issuer: string;
  status: 'completed' | 'in_progress' | 'pending_completion' | 'not_verified';
  completedAt: string | null;
  awardedAt: string | null;
  expectedWindow: string | null;
  statusDetail: string;
  evidence: string;
  coursework: Coursework[];
  competencies: string[];
  limitations: string[];
}
// Individual courses are canonical records, not prose inferred from a track.
const courseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  provider: z.string().min(1),
  status: z.enum(['completed', 'in_progress']),
  verification: z.enum(['owner_confirmed', 'document_verified']),
  hours: z.number().nonnegative().nullable(),
  // Some courses do not have fine-grained skill tags; this is not invalid evidence.
  skills: z.array(z.string().min(1)),
  evidenceVisibility: z.enum(['private', 'public']),
});
const tracksSchema = z.object({
  schemaVersion: z.literal('1.1'),
  tracks: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      focus: z.string().min(1),
      courses: z.array(courseSchema),
    }),
  ),
});
type Course = z.infer<typeof courseSchema>;
type Track = z.infer<typeof tracksSchema>['tracks'][number];
export interface Skill {
  skill: string;
  professional: string[];
  projects: string[];
  education: string[];
  courseTracks: string[];
}

export interface AcademicEvidence {
  educations: ReadonlyMap<string, Education>;
  tracks: ReadonlyMap<string, Track>;
  skills: readonly Skill[];
}

/** Versioned curated data only. No private academic scans, scraping or network access at runtime. */
export async function loadAcademicEvidence(
  root = 'knowledge/ppks/academic',
): Promise<AcademicEvidence> {
  const [e, t, s] = await Promise.all([
    readFile(join(root, 'educations.json'), 'utf8'),
    readFile(join(root, 'tracks.json'), 'utf8'),
    readFile(join(root, 'skills.json'), 'utf8'),
  ]);
  const educations = JSON.parse(e) as { schemaVersion: string; educations: Education[] };
  const tracks = tracksSchema.parse(JSON.parse(t));
  const skills = JSON.parse(s) as { schemaVersion: string; skills: Skill[] };
  if (
    [educations.schemaVersion, tracks.schemaVersion, skills.schemaVersion].some((v) => v !== '1.1')
  )
    throw new Error('PPKS_ACADEMIC_VERSION_INVALID');
  const educationIndex = new Map(educations.educations.map((item) => [item.id, item]));
  const trackIndex = new Map(tracks.tracks.map((item) => [item.id, item]));
  const courseIds = tracks.tracks.flatMap((track) => track.courses.map((course) => course.id));
  if (
    educationIndex.size !== educations.educations.length ||
    trackIndex.size !== tracks.tracks.length ||
    new Set(courseIds).size !== courseIds.length
  )
    throw new Error('PPKS_ACADEMIC_DUPLICATE_ID');
  return { educations: educationIndex, tracks: trackIndex, skills: skills.skills };
}

/** Add only source-qualified academic details to already selected catalog records. */
export function enrichAcademicDocument(
  document: KnowledgeDocument,
  query: string,
  evidence: AcademicEvidence | null,
): KnowledgeDocument {
  if (!evidence || document.type !== 'profile') return document;
  const education = evidence.educations.get(document.id);
  const track = evidence.tracks.get(document.id);
  const phrase = knowledgePhrase(query);
  // Preserve the complete seven-record course catalog without extra context.
  const completeCourseRequest =
    mentionedTechnologies(query).size === 0 &&
    (phrase.includes('42 cursos') ||
      phrase.includes('todos os cursos') ||
      phrase.includes('lista completa') ||
      phrase.includes('cursos por trilha'));
  if (track && completeCourseRequest) return document;
  // Select individual structured courses before any context truncation.
  // SQL Server does not imply every course whose only skill is generic SQL.
  if (track) {
    const requested = new Set(knowledgePhrase(query).split(' ').filter(Boolean));
    const normalized = knowledgePhrase(query);
    const requestedSqlServer = /\bsql server\b/.test(normalized);
    const explicitGenericSql = /\bsql\b/.test(normalized.replace(/\bsql server\b/g, ''));
    const matchCourse = (course: Course) => {
      const labels = course.skills.map(knowledgePhrase);
      if (requestedSqlServer && labels.includes('sql server')) return true;
      if (requestedSqlServer && !explicitGenericSql && labels.includes('sql')) return false;
      return (
        labels.some((label) => {
          if (label === 'sql') return requested.has('sql');
          if (!label) return false;
          return normalized.includes(label);
        }) ||
        (normalized.includes(knowledgePhrase(course.title)) &&
          knowledgePhrase(course.title).length > 8)
      );
    };
    const matched = track.courses.filter(matchCourse);
    if (matched.length) {
      // Emit complete, individually attributable records. Never cut a course
      // title in half or equate a private proof with a public certificate.
      const heading = `Cursos da trilha ${track.name}: ${matched.length} correspondência(s) exata(s); estudo livre, não emprego. Evidência declarada pelo titular, comprovante não necessariamente público.`;
      const lines = matched.map(
        (course) =>
          `Curso [${course.id}]: ${course.title} — ${course.provider}; status ${course.status}; comprovação ${course.verification}; competências ${course.skills.join(', ')}.`,
      );
      const selected = [heading];
      for (const line of lines) {
        if (selected.join('\n').length + line.length + 1 > 6000) break;
        selected.push(line);
      }
      return { ...document, content: selected.join('\n') };
    }
  }
  const lines: string[] = [];
  if (education) {
    lines.push(
      `PPKS acadêmico: ${education.title}; instituição indicada: ${education.institution}; emissor: ${education.issuer}.`,
    );
    lines.push(
      `Situação ${education.status}; conclusão ${education.completedAt ?? 'não confirmada'}; colação ${education.awardedAt ?? 'não informada'}; previsão ${education.expectedWindow ?? 'não se aplica'}.`,
    );
    lines.push(
      `Proveniência: ${education.evidence} (documentos privados não publicados). ${education.statusDetail}`,
    );
    const matching = education.coursework.filter((c) =>
      phrase.split(' ').some((word) => word.length > 4 && knowledgePhrase(c.name).includes(word)),
    );
    const selected = matching.length ? matching : education.coursework.slice(0, 9);
    lines.push(
      `Disciplinas: ${selected.map((c) => `${c.name} [${c.status}; ${c.evidence}]`).join('; ') || 'não detalhadas'}.`,
    );
    lines.push(
      `Competências acadêmicas: ${education.competencies.join(', ')}. Restrições: ${education.limitations.join('; ') || 'nenhuma adicional'}.`,
    );
  }
  if (track) {
    const matched = track.courses.filter(
      (c) =>
        c.skills.some((s) => phrase.includes(knowledgePhrase(s))) ||
        knowledgePhrase(c.title)
          .split(' ')
          .some((word) => word.length > 5 && phrase.includes(word)),
    );
    const selected = matched.length ? matched : track.courses.slice(0, 4);
    lines.push(
      `PPKS trilha ${track.name}: ${track.courses.length} cursos concluídos conforme registros separados; formação livre não é emprego nem certificação de fabricante.`,
    );
    lines.push(
      ...selected.map(
        (c) =>
          `Curso: ${c.title} — ${c.provider}; status ${c.status}; comprovação ${c.verification}; carga ${c.hours ?? 'não informada'}h; competências ${c.skills.join(', ') || 'não detalhadas'}.`,
      ),
    );
  }
  if (!lines.length) return document;
  const available = Math.max(0, Math.min(550, 6000 - document.content.length - 1));
  if (!available) return document;
  return { ...document, content: `${document.content}\n${lines.join('\n').slice(0, available)}` };
}
