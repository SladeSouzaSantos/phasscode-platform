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
  query?: string,
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
        // Link the degree to UNISUL directly. A reference such as "estudou
        // Sistemas de Informação em outra instituição, diferente da UNISUL"
        // must never be rewritten as a UNISUL qualification.
        const degreeLinkedToUnisul =
          /Sistemas de Informação\s*(?:\(\s*UNISUL\s*\)|(?:na|da|pela)\s+UNISUL\b)/i.test(
            updated,
          ) || /\bUNISUL\b\s*(?:\)|,|-|\s)*(?:em\s+)?Sistemas de Informação\b/i.test(updated);
        const claimedProgram = /\b(?:graduação|bacharelado|formação|curso|Pedro|cursa|cursou)\b/i;
        const explicitlyNegated =
          /\b(?:n[aã]o|nem|nunca|sem)\b[^.!?]{0,50}\bSistemas de Informação\b/i.test(updated);
        if (
          wrongProgram.test(updated) &&
          degreeLinkedToUnisul &&
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
          const status = /\b(?:foi|está)\s+conclu[ií]d[ao]\b/i;
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
          matched.replace(
            /\b(?:8|oito)\b/i,
            count === '8' ? String(java.completedCount) : countWord,
          );
        // Do not change a quoted false premise that the answer explicitly
        // rejects: "não são oito cursos..." must not become "não são nove".
        const rejectedCount = (sentence: string, matched: string): boolean => {
          const index = sentence.indexOf(matched);
          const prefix = sentence.slice(Math.max(0, index - 40), index);
          const suffix = sentence.slice(index + matched.length, index + matched.length + 45);
          return (
            /\b(?:n[aã]o\s+(?:s[aã]o|tem|possui|foram)|nem|nunca)\b/i.test(prefix) ||
            /\b(?:est[aá]|[ée]|seria)\s+(?:incorret[oa]|errad[oa]|fals[oa]|equivocad[oa])\b/i.test(
              suffix,
            )
          );
        };
        updated = updated.replace(forward, (matched, count: string) => {
          if (java.completedCount === 8 || rejectedCount(updated, matched)) return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          return replaceCount(matched, count);
        });
        updated = updated.replace(reverse, (matched, count: string) => {
          if (java.completedCount === 8 || rejectedCount(updated, matched)) return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          return replaceCount(matched, count);
        });
        // Covers "declarou a conclusão de oito cursos da trilha..." and
        // "concluiu oito cursos na trilha..." when claiming a completed total.
        // Merely presenting eight selected courses is not a total-count claim.
        const totalVariant =
          /\b(8|oito)\s+cursos?\s+(?:livres?\s+)?(?:conclu[ií]dos?\s+)?(?:na|da|de)\s+trilha\s+(?:de\s+)?Java\s*(?:&|e)\s*Arquitetura\b/gi;
        updated = updated.replace(totalVariant, (matched, count: string, offset: number) => {
          if (java.completedCount === 8 || rejectedCount(updated, matched)) return matched;
          const prefix = updated.slice(Math.max(0, offset - 90), offset);
          const claimsCompletion =
            /\b(?:conclus[aã]o|concluiu|conclu[ií]ram|completou|finalizou|totalizou)\b/i.test(
              prefix,
            );
          const denial =
            /\b(?:n[aã]o|nem|nunca)\b[^.!?]{0,30}\b(?:conclus[aã]o|concluiu|completou|finalizou)\b/i;
          if (!claimsCompletion || denial.test(prefix)) return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          return replaceCount(matched, count);
        });
        // A total can be expressed as "Os oito cursos da trilha ...
        // estão concluídos", not just "oito cursos concluídos na trilha".
        // Check semantic context on both sides of the count and require an
        // affirmative completion claim. Selected subsets are not totals.
        const courseCount = /\b(\d{1,2}|um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+cursos?\b/gi;
        const wordCounts: Record<string, number> = {
          um: 1,
          dois: 2,
          tres: 3,
          quatro: 4,
          cinco: 5,
          seis: 6,
          sete: 7,
          oito: 8,
          nove: 9,
          dez: 10,
          onze: 11,
          doze: 12,
        };
        updated = updated.replace(courseCount, (matched, count: string, offset: number) => {
          const actualCount = /^\d+$/.test(count)
            ? Number(count)
            : wordCounts[count.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
          if (actualCount === java.completedCount) return matched;
          const prefix = updated.slice(Math.max(0, offset - 100), offset);
          const suffix = updated.slice(offset + matched.length, offset + matched.length + 130);
          const trackAfter =
            /^\s+(?:livres?\s+)?(?:conclu[ií]dos?\s+)?(?:na|da|de)\s+trilha\s+(?:de\s+)?Java\s*(?:&|e)\s*Arquitetura\b/i.test(
              suffix,
            );
          const completedBefore =
            /\b(?:conclus[aã]o|concluiu|conclu[ií]ram|completou|finalizou|totalizou)\b/i.test(
              prefix,
            );
          const completedAfter =
            /^\s+(?:livres?\s+)?conclu[ií]dos?\b/i.test(suffix) ||
            /\b(?:est[aã]o|foram|ficaram)\s+conclu[ií]dos?\b/i.test(suffix);
          const deniedCompletion =
            /\b(?:n[aã]o|nem|nunca)\b[^.!?]{0,30}\b(?:conclus[aã]o|concluiu|completou|finalizou)\b/i.test(
              prefix,
            ) ||
            /\b(?:n[aã]o|nem|nunca)\s+(?:est[aã]o|foram|ficaram)\s+conclu[ií]dos?\b/i.test(
              suffix,
            );
          if (
            !trackAfter ||
            !(completedBefore || completedAfter) ||
            deniedCompletion ||
            rejectedCount(updated, matched)
          )
            return matched;
          rules.add('java_track_completed_count');
          sourceIds.add(java.id);
          const canonicalCount = /^\d+$/.test(count) ? String(java.completedCount) : countWord;
          return matched.replace(count, canonicalCount);
        });
      }
      return updated;
    })
    .join('');
  // A recruiter may ask to verify a false degree title. If the model merely
  // says "UNISUL is pending" without naming the program, supply the missing
  // canonical qualification instead of treating an incomplete answer as valid.
  const degreeCheck =
    unisul &&
    query &&
    /\bUNISUL\b/i.test(query) &&
    /Sistemas de Informação/i.test(query) &&
    !/Ciência da Computação/i.test(output);
  if (degreeCheck) {
    rules.add('unisul_degree_explicit_answer');
    sourceIds.add(unisul.id);
  }
  const degreeNote = degreeCheck
    ? `**Formação na UNISUL:** ${unisul.title} — ainda não concluído.\n\n`
    : '';
  return { answer: degreeNote + output, rules: [...rules], sourceIds: [...sourceIds] };
}
