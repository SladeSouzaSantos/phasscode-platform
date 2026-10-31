import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeDocument } from '../domain/ports.js';
import { knowledgePhrase } from '../knowledge-matching.js';

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
interface Course {
  id: string;
  title: string;
  provider: string;
  status: string;
  verification: string;
  hours: number | null;
  skills: string[];
}
interface Track {
  id: string;
  name: string;
  focus: string;
  courses: Course[];
}
interface Skill {
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
  const tracks = JSON.parse(t) as { schemaVersion: string; tracks: Track[] };
  const skills = JSON.parse(s) as { schemaVersion: string; skills: Skill[] };
  if (
    [educations.schemaVersion, tracks.schemaVersion, skills.schemaVersion].some((v) => v !== '1.1')
  )
    throw new Error('PPKS_ACADEMIC_VERSION_INVALID');
  const educationIndex = new Map(educations.educations.map((item) => [item.id, item]));
  const trackIndex = new Map(tracks.tracks.map((item) => [item.id, item]));
  if (
    educationIndex.size !== educations.educations.length ||
    trackIndex.size !== tracks.tracks.length
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
  const available = Math.max(0, Math.min(1500, 6000 - document.content.length - 1));
  if (!available) return document;
  return { ...document, content: `${document.content}\n${lines.join('\n').slice(0, available)}` };
}
