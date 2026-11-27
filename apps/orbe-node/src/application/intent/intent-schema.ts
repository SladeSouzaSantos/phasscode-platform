export type OrbeIntentKind =
  | 'policy'
  | 'meeting'
  | 'experience_duration'
  | 'professional_overview'
  | 'academic_catalog'
  | 'academic_background'
  | 'technology_experience'
  | 'project_information'
  | 'job_match'
  | 'ambiguous'
  | 'portfolio';

export interface OrbeIntent {
  kind: OrbeIntentKind;
  normalizedQuery: string;
  chronologicalOverview: boolean;
  completeCourseCatalog: boolean;
  durationQuestion: boolean;
  broadProfessionalOverview: boolean;
  technologies: string[];
  followUp: boolean;
}
