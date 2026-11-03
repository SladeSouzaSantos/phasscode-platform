import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import {
  vacancyRequirementSchema,
  type EvidenceGraphMatch,
  type EvidenceGraphRepository,
  type VacancyRequirement,
} from '../domain/evidence-graph.js';
import { PublicGraphEvidenceGateway } from './graph-public-policy.js';

/**
 * F3.3 off-line LangGraph prototype. No API route, LLM invocation, checkpoint,
 * external tracing or Neo4j credentials are attached to this workflow.
 */
const GraphState = Annotation.Root({
  question: Annotation<string>,
  requirements: Annotation<VacancyRequirement[]>,
  matches: Annotation<EvidenceGraphMatch[]>,
  retrievalFailed: Annotation<boolean>,
  draft: Annotation<string>,
  answer: Annotation<string>,
  decision: Annotation<'verified' | 'abstain'>,
});

export interface GroundedRecruiterGraphOptions {
  identifyRequirements(
    question: string,
  ): readonly VacancyRequirement[] | Promise<readonly VacancyRequirement[]>;
  evidence: EvidenceGraphRepository;
}

const refusal = 'Evidências públicas insuficientes para confirmar os requisitos informados.';

function renderVerifiedMatches(matches: readonly EvidenceGraphMatch[]): string {
  const rows: string[] = [];
  for (const match of matches) {
    for (const claim of match.claims) {
      rows.push(`- ${claim.label} (escopo: ${claim.scope}; fontes: ${claim.sourceIds.join(', ')})`);
    }
  }
  return rows.length ? rows.join('\n') : refusal;
}

function hasCompletePublicProvenance(matches: readonly EvidenceGraphMatch[]): boolean {
  for (const match of matches) {
    const publicIds = new Set(
      match.sources.filter((source) => source.visibility === 'public').map((source) => source.id),
    );
    for (const claim of match.claims) {
      if (
        !claim.sourceIds.length ||
        !claim.sourceIds.every((sourceId) => publicIds.has(sourceId))
      ) {
        return false;
      }
    }
  }
  return true;
}

export function createGroundedRecruiterGraph(options: GroundedRecruiterGraphOptions) {
  const publicEvidence = new PublicGraphEvidenceGateway(options.evidence);
  return new StateGraph(GraphState)
    .addNode('parseQuestion', (state) => ({
      question: z.string().trim().min(1).max(20_000).parse(state.question),
    }))
    .addNode('identifyRequirements', async (state) => ({
      requirements: z
        .array(vacancyRequirementSchema)
        .parse(await options.identifyRequirements(state.question)),
    }))
    .addNode('retrieveGraphEvidence', async (state) => {
      try {
        const matches = await publicEvidence.findEvidence(state.requirements);
        return { matches: [...matches], retrievalFailed: false };
      } catch {
        // Do not log private graph details or invent evidence on outages.
        return { matches: [], retrievalFailed: true };
      }
    })
    .addNode('generateGroundedAnswer', (state) => ({
      // Deterministic initial candidate; no unbudgeted second LLM call.
      draft: renderVerifiedMatches(state.matches),
    }))
    .addNode('verifyClaims', (state) => {
      const verified =
        !state.retrievalFailed &&
        state.requirements.length > 0 &&
        state.matches.length === state.requirements.length &&
        state.matches.every((match) => match.claims.length > 0) &&
        hasCompletePublicProvenance(state.matches) &&
        state.draft === renderVerifiedMatches(state.matches) &&
        state.draft !== refusal;
      return {
        decision: verified ? ('verified' as const) : ('abstain' as const),
        answer: verified ? state.draft : refusal,
      };
    })
    .addNode('respond', (state) => ({ answer: state.answer }))
    .addEdge(START, 'parseQuestion')
    .addEdge('parseQuestion', 'identifyRequirements')
    .addEdge('identifyRequirements', 'retrieveGraphEvidence')
    .addEdge('retrieveGraphEvidence', 'generateGroundedAnswer')
    .addEdge('generateGroundedAnswer', 'verifyClaims')
    .addEdge('verifyClaims', 'respond')
    .addEdge('respond', END)
    .compile();
}
