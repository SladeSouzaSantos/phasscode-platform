import type { LlmInvocationFactory } from '../domain/llm-invocation.js';
import { MAX_MODEL_CALLS_PER_TURN } from '../domain/llm-limits.js';

export interface GraphTurnLlmCallUsage {
  readonly used: number;
  readonly remaining: number;
  readonly semanticCalls: number;
  readonly answerCalls: number;
}

export interface SharedGraphTurnLlmBudget {
  /** Use only for the optional semantic vacancy parser. */
  readonly semanticFactory: LlmInvocationFactory;
  /** Use for the normal recruiter response, including tool rounds. */
  readonly answerFactory: LlmInvocationFactory;
  /** Call counts, never prompt text or personally identifying data. */
  readonly usage: () => GraphTurnLlmCallUsage;
}

/**
 * Logical model-call admission for a SINGLE prospective GraphRAG chat turn.
 * This is NOT a replacement for the existing Redis global/provider budgets:
 * those still reserve every real provider attempt, including fallbacks.
 *
 * The current public chat allows MAX_MODEL_CALLS_PER_TURN model invocations.
 * Optional semantic parsing may use one of them, but cannot consume the last
 * slot reserved for response generation. Model errors still consume the
 * logical slot, avoiding unbounded retries after malformed responses.
 *
 * Create a new instance per HTTP chat turn; never hold it as a singleton.
 */
export function createSharedGraphTurnLlmBudget(
  invocationFactory: LlmInvocationFactory,
  maxCallsPerTurn: number = MAX_MODEL_CALLS_PER_TURN,
): SharedGraphTurnLlmBudget {
  if (!Number.isSafeInteger(maxCallsPerTurn) || maxCallsPerTurn < 1 || maxCallsPerTurn > 32) {
    throw new Error('GRAPH_TURN_INVALID_MODEL_CALL_LIMIT');
  }

  let used = 0;
  let semanticCalls = 0;
  let answerCalls = 0;

  const wrap = (kind: 'semantic' | 'answer'): LlmInvocationFactory => (tools, signal) => {
    // Underlying fallback controllers and their physical budgets are reused;
    // this wrapper only guards the logical invocation count.
    const invoke = invocationFactory(tools, signal);
    return async (messages) => {
      signal.throwIfAborted();
      // A semantic pre-call is optional. With only one slot, preserve it for
      // the canonical recruiter response instead of consuming it for parsing.
      if (kind === 'semantic' && (semanticCalls >= 1 || used >= maxCallsPerTurn - 1)) {
        throw new Error('GRAPH_TURN_SEMANTIC_BUDGET_UNAVAILABLE');
      }
      if (used >= maxCallsPerTurn) {
        throw new Error('GRAPH_TURN_MODEL_CALL_LIMIT');
      }
      // Synchronous reservation makes concurrent invocations safe within one
      // event loop. No await occurs between checking and decrementing capacity.
      used += 1;
      if (kind === 'semantic') semanticCalls += 1;
      else answerCalls += 1;
      return invoke(messages);
    };
  };

  return {
    semanticFactory: wrap('semantic'),
    answerFactory: wrap('answer'),
    usage: () => ({
      used,
      remaining: maxCallsPerTurn - used,
      semanticCalls,
      answerCalls,
    }),
  };
}
