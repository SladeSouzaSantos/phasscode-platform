import type { OrbeIntent } from './intent-schema.js';

// Retrieval hints are not authorization. ChatService still enforces the
// original policy, verified-answer eligibility and model budget.
export function routeRetrieval(intent: OrbeIntent): 'career' | 'portfolio' {
  return intent.durationQuestion || intent.chronologicalOverview || intent.broadProfessionalOverview
    ? 'career'
    : 'portfolio';
}
