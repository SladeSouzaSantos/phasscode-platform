import { END, START, StateGraph } from '@langchain/langgraph';
import type { KnowledgeRepository } from '../../domain/ports.js';
import { resolveTurnContext } from '../intent/context-resolver.js';
import { resolveIntent } from '../intent/intent-resolver.js';
import { routeRetrieval } from '../intent/intent-router.js';
import { retrieveCareerEvidence } from '../tools/calculate-experience.tool.js';
import { OrbeState } from './orbe-state.js';

// First-stage orchestration: understand the turn before selecting retrieval.
// No LLM calls, writes, checkpointing or external tracing occur in this graph.
export function createOrbeGraph(knowledge: KnowledgeRepository) {
  return new StateGraph(OrbeState)
    .addNode('resolveContext', (state) => ({
      context: resolveTurnContext(state.message, state.history),
    }))
    .addNode('resolveIntent', (state) => ({
      intent: resolveIntent(state.message, state.context),
    }))
    .addNode('retrieveCareerEvidence', (state) =>
      retrieveCareerEvidence(knowledge, state.context.query, state.intent),
    )
    .addNode('retrievePortfolioEvidence', (state) => ({
      retrieved: knowledge.search(state.context.query),
      experienceDocuments: [],
    }))
    .addEdge(START, 'resolveContext')
    .addEdge('resolveContext', 'resolveIntent')
    .addConditionalEdges('resolveIntent', (state) => routeRetrieval(state.intent), {
      career: 'retrieveCareerEvidence',
      portfolio: 'retrievePortfolioEvidence',
    })
    .addEdge('retrieveCareerEvidence', END)
    .addEdge('retrievePortfolioEvidence', END)
    .compile();
}
