import { evaluateGraphRecruiterPreview } from './graph-recruiter-preview.js';
import {
  analyzeVacancyEvidenceCoverage,
  createCoverageAwareVacancyPlanner,
} from './graph-vacancy-coverage.js';
import { createBudgetedSemanticVacancyProposer } from './graph-semantic-vacancy.js';
import type { LlmInvocationFactory } from '../domain/llm-invocation.js';
import {
  auditGeneratedRecruiterProse,
  type GeneratedClaimAudit,
} from './graph-generated-prose-audit.js';
import { createSnapshotRequirementIdentifier } from './graph-requirements.js';
import type { EvidenceGraphRepository, EvidenceGraphSnapshot } from '../domain/evidence-graph.js';
import type { GenerationResult } from '../domain/ports.js';

/** A per-turn factory shares Redis quotas and logical model-call limits with PPKS. */
export interface GraphActiveTurn {
  semanticFactory?: LlmInvocationFactory;
  signal?: AbortSignal;
  maxContextChars?: number;
}

/** Only fully grounded graph output is eligible to replace a canonical answer. */
export interface GraphActivePort {
  answer(question: string, turn?: GraphActiveTurn): Promise<GenerationResult | undefined>;
  auditGenerated?(answer: string): GeneratedClaimAudit;
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
  const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const labels = new Map<string, string>(
    snapshot.nodes
      .filter((node) => node.kind !== 'claim' && node.kind !== 'source')
      .map((node): [string, string] => {
        if (node.kind !== 'engagement') return [node.id, node.label];
        const company = byId.get(node.companyId);
        const organization = company?.kind === 'company' ? company.label : node.label;
        return [node.id, `${organization} — ${node.label}`];
      }),
  );
  // A claim is eligible only if ALL its cited public sources have real
  // HTTPS URLs. Do not discard individual source IDs from the same claim:
  // losing one source would make its provenance misleading.
  const linkedEvidence: EvidenceGraphRepository = {
    async findEvidence(requirements, options) {
      const matches = await evidence.findEvidence(requirements, options);
      return matches.map((match) => {
        const linkedIds = new Set(
          match.sources
            .filter(
              (source) =>
                source.visibility === 'public' && source.sourceUrl?.startsWith('https://'),
            )
            .map((source) => source.id),
        );
        const claims = match.claims.filter(
          (claim) =>
            claim.scope !== 'unknown' &&
            claim.sourceIds.length > 0 &&
            claim.sourceIds.every((id) => linkedIds.has(id)),
        );
        const citedIds = new Set(claims.flatMap((claim) => claim.sourceIds));
        return {
          requirementId: match.requirementId,
          claims,
          sources: match.sources.filter((source) => citedIds.has(source.id)),
        };
      });
    },
    async getSource(id) {
      const source = await evidence.getSource(id);
      return source?.visibility === 'public' && source.sourceUrl?.startsWith('https://')
        ? source
        : undefined;
    },
  };

  return {
    auditGenerated(answer) {
      return auditGeneratedRecruiterProse(answer, snapshot);
    },
    async answer(question, turn) {
      const signposted =
        /(?:^|\n)\s*(?:requisitos?|diferenciais|desej[aá]veis|must have|required skills)\s*:/i.test(
          question,
        );
      // A free-prose vacancy is eligible only when every candidate-facing
      // clause has been audited by the bounded coverage grammar. An
      // uninterpreted clause abstains; do not silently drop it.
      const focused = !signposted && isFocusedQuestion(question, identifyRequirements);
      const report = !signposted && !focused ? analyzeVacancyEvidenceCoverage(question) : undefined;
      const vacancy = signposted || (report !== undefined && report.status !== 'no_requirements');
      if (!focused && !vacancy) return undefined;

      const requirementPlan = vacancy
        ? async (text: string) => {
            const deterministic = await structured.plan(text);
            if (!deterministic.unknown.length || !turn?.semanticFactory) return deterministic;
            // A SINGLE budgeted normalization is used only for unknown labels;
            // it cannot resolve unknown clauses or add unsupported skills.
            // If its validated plan is not strictly better, keep the original.
            try {
              const proposer = createBudgetedSemanticVacancyProposer({
                invocationFactory: turn.semanticFactory,
                signal: turn.signal ?? new AbortController().signal,
                maxContextChars: turn.maxContextChars ?? 12_000,
              });
              const semantic = await createCoverageAwareVacancyPlanner(catalog, {
                proposeLabels: proposer,
              }).plan(text);
              return semantic.unknown.length < deterministic.unknown.length
                ? semantic
                : deterministic;
            } catch {
              return deterministic;
            }
          }
        : undefined;
      const result = await evaluateGraphRecruiterPreview(question, {
        evidence: linkedEvidence,
        identifyRequirements,
        canonicalPpks: () => 'PPKS_FALLBACK_NOT_FOR_DISPLAY',
        ...(requirementPlan ? { requirementPlan } : {}),
        renderOptions: { labels },
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
