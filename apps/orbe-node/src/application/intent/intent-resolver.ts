import { knowledgePhrase, mentionedTechnologies } from '../../knowledge-matching.js';
import {
  isContextualFollowUp,
  isGreeting,
  isInjection,
  isMeetingRequest,
  isOffTopicTask,
  isPersonalLifeQuestion,
  isSimpleTest,
} from '../../domain/security.js';
import { isCareerDurationEllipsis, isExperienceDurationQuestion } from '../experience-context.js';
import { isBroadProfessionalExperienceQuestion } from '../experience-response.js';
import type { ResolvedTurnContext } from './context-resolver.js';
import type { OrbeIntent, OrbeIntentKind } from './intent-schema.js';
import { ellipticalTechnology } from '../technology-follow-up.js';

export function resolveIntent(message: string, context: ResolvedTurnContext): OrbeIntent {
  const { query } = context;
  const normalizedQuery = knowledgePhrase(query);
  // Recruiters asking for the complete chronological career need every
  // verified employer, not just the 5 best lexical search matches.
  const chronologicalOverview =
    /\b(?:trajetoria|historico profissional|experiencias profissionais|todas as experiencias|ordem cronologica|empresas em ordem|cada empresa)\b/.test(
      normalizedQuery,
    );
  const completeCourseCatalog =
    /\b(?:todos os cursos|todos os 42 cursos|42 cursos|lista completa de cursos|cursos por trilha|liste todos os cursos)\b/.test(
      normalizedQuery,
    );
  const durationQuestion = isExperienceDurationQuestion(query);
  const broadProfessionalOverview = isBroadProfessionalExperienceQuestion(query);
  const technologies = [...mentionedTechnologies(query)];
  let kind: OrbeIntentKind = 'portfolio';
  if (
    isInjection(message) ||
    isGreeting(message) ||
    isSimpleTest(message) ||
    isOffTopicTask(message) ||
    isPersonalLifeQuestion(message)
  )
    kind = 'policy';
  else if (isMeetingRequest(message)) kind = 'meeting';
  else if (durationQuestion) kind = 'experience_duration';
  else if (broadProfessionalOverview || chronologicalOverview) kind = 'professional_overview';
  else if (completeCourseCatalog) kind = 'academic_catalog';
  else if (
    !context.previous &&
    (isContextualFollowUp(message) ||
      isCareerDurationEllipsis(message) ||
      ellipticalTechnology(message))
  )
    kind = 'ambiguous';
  else if (/\b(?:vaga|requisitos da vaga|aderencia|job match)\b/.test(normalizedQuery))
    kind = 'job_match';
  else if (/\b(?:projetos?|repositorios?|aplicativos?)\b/.test(normalizedQuery))
    kind = 'project_information';
  else if (/\b(?:formacao|cursos?|graduacao|pos graduacao|certificacoes?)\b/.test(normalizedQuery))
    kind = 'academic_background';
  else if (
    (technologies.length > 0 || context.technologyFollowUp) &&
    /\b(?:experienc\w*|profission\w*|trabalh\w*|conhec\w*|domina|sabe)\b/.test(normalizedQuery)
  )
    kind = 'technology_experience';
  return {
    kind,
    normalizedQuery,
    chronologicalOverview,
    completeCourseCatalog,
    durationQuestion,
    broadProfessionalOverview,
    technologies,
    followUp: context.followUp,
  };
}
