import type { KnowledgeDocument, KnowledgeRepository } from '../../domain/ports.js';
import { buildCompleteAcademicResponse } from '../academic-response.js';

// Only an exact canonical listing can produce a deterministic academic answer.
export function getAcademicBackground(
  knowledge: KnowledgeRepository,
  query: string,
  retrieved: readonly KnowledgeDocument[],
) {
  const listing = knowledge.academicCourseListing?.(query);
  return listing ? buildCompleteAcademicResponse(query, listing, retrieved) : undefined;
}
