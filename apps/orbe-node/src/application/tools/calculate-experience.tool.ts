import type { KnowledgeDocument, KnowledgeRepository } from '../../domain/ports.js';
import type { OrbeIntent } from '../intent/intent-schema.js';

// Internal deterministic capability, not a model-selected Tool.
export function retrieveCareerEvidence(
  knowledge: KnowledgeRepository,
  query: string,
  intent: OrbeIntent,
): { retrieved: KnowledgeDocument[]; experienceDocuments: KnowledgeDocument[] } {
  let retrieved = knowledge.search(query);
  const { normalizedQuery, chronologicalOverview, durationQuestion } = intent;
  const experienceDocuments = (knowledge.experienceDocuments?.() ?? []).sort((a, b) =>
    (a.experiencePeriod?.start ?? '').localeCompare(b.experiencePeriod?.start ?? ''),
  );
  if (experienceDocuments.length) {
    const broadProgrammingQuestion = /\b(?:programa\w*|desenvolv\w*|software)\b/.test(
      normalizedQuery,
    );
    // The SDGP is a canonical mixed-role project, not a ranked fallback.
    // Keep this optional lookup compatible with test knowledge adapters.
    const sdgp = knowledge.getDocument?.('greencity-sdgp');
    const mixedRoleProject = broadProgrammingQuestion && sdgp ? [sdgp] : [];
    const ordered = chronologicalOverview
      ? [...experienceDocuments, ...retrieved]
      : [
          // Durations must prioritize concise original employment records.
          // Project evidence must not be discarded after enriched texts fill the budget.
          ...experienceDocuments,
          ...mixedRoleProject,
          ...retrieved,
        ];
    retrieved = [...new Map(ordered.map((doc) => [doc.id, doc])).values()];
    // Duration answers use structured periods, not long prose. Reserve
    // room for all four employment records plus the mixed-role SDGP proof.
    if (durationQuestion && broadProgrammingQuestion) {
      retrieved = retrieved.map((doc) => ({
        ...doc,
        content: doc.content.slice(0, 550),
      }));
    }
  }
  return { retrieved, experienceDocuments };
}

export {
  buildVerifiedExperienceDurationResponse as calculateExperience,
  buildVerifiedProfessionalOverviewResponse as summarizeProfessionalExperience,
} from '../experience-response.js';
