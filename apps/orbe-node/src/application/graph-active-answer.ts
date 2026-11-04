import { evaluateGraphRecruiterPreview } from './graph-recruiter-preview.js';
import { createCoverageAwareVacancyPlanner } from './graph-vacancy-coverage.js';
import { createSnapshotRequirementIdentifier } from './graph-requirements.js';
import type { EvidenceGraphRepository, EvidenceGraphSnapshot } from '../domain/evidence-graph.js';
import type { GenerationResult } from '../domain/ports.js';

/** Only fully grounded graph output is eligible to replace a canonical answer. */
export interface GraphActivePort {
  answer(question: string): Promise<GenerationResult | undefined>;
}

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// An explicit single-technology question may be answered from its claims.
// Broader career, project-listing and multi-skill questions stay with PPKS
// until coverage is established by the separate vacancy planner.
const questionWords = new Set([
  'pedro',
  'santos',
  'tem',
  'possui',
  'experiencia',
  'profissional',
  'com',
  'em',
  'de',
  'o',
  'a',
  'do',
  'da',
  'e',
  'sobre',
  'sabe',
  'conhece',
  'conhecimento',
  'dominio',
  'domina',
  'trabalhou',
  'trabalha',
  'pratica',
  'comprovada',
  'comprovado',
]);

function isFocusedQuestion(
  question: string,
  identify: ReturnType<typeof createSnapshotRequirementIdentifier>,
): boolean {
  if (question.length > 180) return false;
  const skills = identify(question);
  if (skills.length !== 1) return false;
  const normalizedQuestion = normalize(question);
  const label = normalize(skills[0]!.label);
  const at = normalizedQuestion.indexOf(label);
  if (at < 0) return false;
  const before = normalizedQuestion.slice(0, at).trim();
  const after = normalizedQuestion.slice(at + label.length).trim();
  return [...before.split(' '), ...after.split(' ')]
    .filter(Boolean)
    .every((word) => questionWords.has(word));
}

/**
 * F3.3 DEV-only active composition. Existing LangGraph nodes and the
 * PublicGraphEvidenceGateway make the eligibility decision. No unverified
 * LLM prose, unknown requirements or source-less claims enter the answer.
 * This adapter never calls the canonical model; ChatService owns fallback.
 */
export function createGraphRagActive(
  snapshot: EvidenceGraphSnapshot,
  evidence: EvidenceGraphRepository,
): GraphActivePort {
  const identifyRequirements = createSnapshotRequirementIdentifier(snapshot);
  const catalog = snapshot.nodes
    .filter((node): node is Extract<typeof node, { kind: 'skill' }> => node.kind === 'skill')
    .map((node) => ({ id: node.id, label: node.label }));
  const structured = createCoverageAwareVacancyPlanner(catalog);

  return {
    async answer(question) {
      const signposted =
        /(?:^|\n)\s*(?:requisitos?|diferenciais|desej[aá]veis|must have|required skills)\s*:/i.test(
          question,
        );
      if (!signposted && !isFocusedQuestion(question, identifyRequirements)) {
        return undefined;
      }
      const result = await evaluateGraphRecruiterPreview(question, {
        evidence,
        identifyRequirements,
        canonicalPpks: () => 'PPKS_FALLBACK_NOT_FOR_DISPLAY',
        ...(signposted ? { requirementPlan: structured.plan } : {}),
      });
      if (result.mode !== 'verified_graph' || !result.sources?.length) return undefined;
      // The public chat contract permits up to ten source references. Never
      // claim complete coverage when citations cannot be returned in full.
      if (result.sources.length > 10) return undefined;
      if (
        result.sources.some(
          (source) =>
            source.visibility !== 'public' ||
            !source.sourceUrl ||
            !source.sourceUrl.startsWith('https://'),
        )
      ) {
        return undefined;
      }
      return {
        answer: result.answer,
        sources: result.sources.map((source) => ({
          type: source.origin === 'github' ? ('project' as const) : ('profile' as const),
          id: source.id,
          title: source.label,
          url: source.sourceUrl!,
        })),
      };
    },
  };
}
