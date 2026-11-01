import type { CanonicalAcademicFacts } from '../domain/ports.js';

export interface CanonicalClaimsResult {
  answer: string;
  rules: string[];
  sourceIds: string[];
}

/**
 * Narrow post-generation guardrail: repair unambiguous academic contradictions
 * against the versioned PPKS, not against remembered text or a second LLM.
 * Do not rewrite uncertain/subset counts, negated statements or job matrices.
 */
export function reconcileCanonicalAcademicClaims(
  answer: string,
  facts: CanonicalAcademicFacts | undefined,
): CanonicalClaimsResult {
  if (!facts) return { answer, rules: [], sourceIds: [] };

  const unisul = facts.educations.find(
    (degree) =>
      degree.id === 'formacao-computacao' &&
      degree.institution.toLowerCase() === 'unisul' &&
      /ciência da computação/i.test(degree.title),
  );
  const java = facts.tracks.find((track) => track.id === 'cursos-java-arquitetura');
  const rules = new Set<string>();
  const sourceIds = new Set<string>();

  // Preserve paragraphs and punctuation while examining one sentence/line at
  // a time. Do not alter Markdown table rows or URLs.
  const output = answer
    .split(/(\n|(?<=[.!?])\s+)/)
    .map((part) => {
      if (!part.trim() || part.trimStart().startsWith('|')) return part;
      let updated = part;

      if (unisul && /\bUNISUL\b/i.test(updated)) {
        const correctCourse = unisul.title.replace(/^Bacharelado em\s+/i, '');
        const wrongProgram = /Sistemas de Informação/i;
        const claimedProgram = /\b(?:graduação|bacharelado|formação|Pedro|cursa|cursou)\b/i;
        const explicitlyNegated =
          /\b(?:n[aã]o|nem|nunca|sem)\b[^.!?]{0,50}\bSistemas de Informação\b/i.test(updated);
        if (
          wrongProgram.test(updated) &&
          claimedProgram.test(updated) &&
          !explicitlyNegated &&
          !new RegExp(correctCourse, 'i').test(updated)
        ) {
          updated = updated.replace(wrongProgram, correctCourse);
          rules.add('unisul_degree_title');
          sourceIds.add(unisul.id);
        }

        // Only change an explicit affirmative status for this same degree;
        // "não concluída", other universities and other diplomas are untouched.
        const isDegreeContext =
          new RegExp(correctCourse, 'i').test(updated) &&
          /\b(?:graduação|bacharelado|ciência da computação)\b/i.test(updated);
        if (unisul.status === 'pending_completion' && isDegreeContext) {
          const status =
            /\b(?:foi|está)\s+conclu[ií]d[ao]\b/i;
          const negativeStatus =
            /\b(?:n[aã]o|nem|nunca)\b[^.!?]{0,25}\b(?:foi|está)\s+conclu[ií]d[ao]\b/i;
          if (status.test(updated) && !negativeStatus.test(updated)) {
            updated = updated.replace(status, 'ainda não foi concluída');
            rules.add('unisul_degree_status');
            sourceIds.add(unisul.id);
          }
        }
      }

      if (java && java.completedCount === java.totalCount) {
        const countWord = java.completedCount === 9 ? 'nove' : String(java.completedCount);
        const forward =
          /\b(8|oito)\s+cursos?\s+(?:livres?\s+)?conclu[ií]dos?\s+(?:na|da|de)\s+trilha\s+(?:de\s+)?Java\s*(?:&|e)\s*Arquitetura\b/gi;
        const reverse =
          /\btrilha\s+(?:de\s+)?Java\s*(?:&|e)\s*Arquitetura\b[^.!?\n]{0,45}\b(8|oito)\s+cursos?\s+(?:livres?\s+)?conclu[ií]dos?\b/gi;
        const replaceCount = (matched: string, count: string) =>
          matched.replace(/\b(?:8|oito)\b/i, count === '8' ? String(java.completedCount) : countWord);
        updated = updated.replace(forward, (matched, count: string) => {
          if (java.completedCount === 8) return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          return replaceCount(matched, count);
        });
        updated = updated.replace(reverse, (matched, count: string) => {
          if (java.completedCount === 8) return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          return replaceCount(matched, count);
        });
      }
      return updated;
    })
    .join('');
  return { answer: output, rules: [...rules], sourceIds: [...sourceIds] };
}
