import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { createSharedGraphTurnLlmBudget } from '../apps/orbe-node/src/application/graph-turn-llm-budget.js';
import { MAX_MODEL_CALLS_PER_TURN } from '../apps/orbe-node/src/domain/llm-limits.js';
import { createBudgetedSemanticVacancyProposer } from '../apps/orbe-node/src/application/graph-semantic-vacancy.js';
import { createCoverageAwareVacancyPlanner } from '../apps/orbe-node/src/application/graph-vacancy-coverage.js';
import type { LlmInvocationFactory } from '../apps/orbe-node/src/domain/llm-invocation.js';

const skills = [
  { id: 'skill-java', label: 'Java' },
  { id: 'skill-react', label: 'React' },
];

function stub() {
  const rawInvoke = vi.fn(async (messages: readonly unknown[]) => {
    const data = messages[1];
    if (data instanceof HumanMessage && typeof data.content === 'string') {
      try {
        const payload = JSON.parse(data.content) as {
          task?: string;
          fragments?: { id: string; excerpt: string }[];
        };
        if (payload.task === 'normalize_labels_only' && payload.fragments) {
          return new AIMessage(
            JSON.stringify({
              proposals: payload.fragments.map(({ id, excerpt }) => ({
                id,
                excerpt,
                label: excerpt,
              })),
            }),
          );
        }
      } catch {
        // An answer transcript is plain text; it is not a parser request.
      }
    }
    return new AIMessage('Resposta baseada nas evidências disponíveis.');
  });
  const factory: LlmInvocationFactory = () => async (messages) => rawInvoke(messages);
  return { rawInvoke, factory };
}

const answer = (factory: LlmInvocationFactory) =>
  factory([], new AbortController().signal)([new HumanMessage('Responda ao recrutador.')]);

describe('F3.3 shared logical model budget across vacancy parser and response', () => {
  it('reserves one semantic call and leaves the other two slots for the answer', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory);
    expect(MAX_MODEL_CALLS_PER_TURN).toBe(3);
    const proposer = createBudgetedSemanticVacancyProposer({
      invocationFactory: turn.semanticFactory,
      signal: new AbortController().signal,
      maxContextChars: 12_000,
    });
    const planner = createCoverageAwareVacancyPlanner(skills, { proposeLabels: proposer });
    const plan = await planner.plan('Requisitos: Java, React');
    expect(plan.requirements.map((r) => r.id)).toEqual(['skill-java', 'skill-react']);
    expect(turn.usage()).toEqual({
      used: 1,
      remaining: 2,
      semanticCalls: 1,
      answerCalls: 0,
    });
    await answer(turn.answerFactory);
    await answer(turn.answerFactory);
    expect(turn.usage()).toEqual({
      used: 3,
      remaining: 0,
      semanticCalls: 1,
      answerCalls: 2,
    });
    await expect(answer(turn.answerFactory)).rejects.toThrow('GRAPH_TURN_MODEL_CALL_LIMIT');
    expect(rawInvoke).toHaveBeenCalledTimes(3);
  });

  it('does not consume parser budget for an ambiguous vacancy rejected before model invocation', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory);
    const proposer = createBudgetedSemanticVacancyProposer({
      invocationFactory: turn.semanticFactory,
      signal: new AbortController().signal,
      maxContextChars: 12_000,
    });
    const planner = createCoverageAwareVacancyPlanner(skills, { proposeLabels: proposer });
    await expect(
      planner.plan(
        'Requisitos: Java\nBenefícios: seguro saúde\n' +
          'Buscamos quem saiba trabalhar com sistemas muito complexos.',
      ),
    ).rejects.toThrow('GRAPH_VACANCY_UNINTERPRETED_TEXT');
    expect(turn.usage().used).toBe(0);
    await answer(turn.answerFactory);
    await answer(turn.answerFactory);
    await answer(turn.answerFactory);
    expect(rawInvoke).toHaveBeenCalledTimes(3);
  });

  it('does not let a parser run twice or consume the final answer slot', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory);
    const parser = turn.semanticFactory([], new AbortController().signal);
    await parser([new HumanMessage('One normalization')]);
    await expect(parser([new HumanMessage('Retry normalization')])).rejects.toThrow(
      'GRAPH_TURN_SEMANTIC_BUDGET_UNAVAILABLE',
    );
    await answer(turn.answerFactory);
    await answer(turn.answerFactory);
    expect(rawInvoke).toHaveBeenCalledTimes(3);
  });

  it('allows the answer when only a single model call can be made', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory, 1);
    const parser = turn.semanticFactory([], new AbortController().signal);
    await expect(parser([new HumanMessage('Parser')])).rejects.toThrow(
      'GRAPH_TURN_SEMANTIC_BUDGET_UNAVAILABLE',
    );
    await answer(turn.answerFactory);
    expect(rawInvoke).toHaveBeenCalledOnce();
    expect(turn.usage()).toMatchObject({ semanticCalls: 0, answerCalls: 1, remaining: 0 });
  });

  it('counts failing model calls so malformed provider responses cannot trigger unlimited retries', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('synthetic-provider-failure');
    });
    const factory: LlmInvocationFactory = () => invoke;
    const turn = createSharedGraphTurnLlmBudget(factory, 2);
    await expect(answer(turn.answerFactory)).rejects.toThrow('synthetic-provider-failure');
    await expect(answer(turn.answerFactory)).rejects.toThrow('synthetic-provider-failure');
    await expect(answer(turn.answerFactory)).rejects.toThrow('GRAPH_TURN_MODEL_CALL_LIMIT');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(turn.usage()).toMatchObject({ used: 2, answerCalls: 2, remaining: 0 });
  });

  it('makes synchronous reservations safe for concurrent calls', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory, 2);
    const results = await Promise.allSettled([
      answer(turn.answerFactory),
      answer(turn.answerFactory),
      answer(turn.answerFactory),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect(rawInvoke).toHaveBeenCalledTimes(2);
    expect(turn.usage().remaining).toBe(0);
  });

  it('aborted requests do not consume a slot and new turn instances start fresh', async () => {
    const { factory, rawInvoke } = stub();
    const turn = createSharedGraphTurnLlmBudget(factory);
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(
      turn.answerFactory([], cancellation.signal)([new HumanMessage('Canceled')]),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(turn.usage().used).toBe(0);
    await answer(turn.answerFactory);
    const next = createSharedGraphTurnLlmBudget(factory);
    expect(next.usage().used).toBe(0);
    await answer(next.answerFactory);
    expect(rawInvoke).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, 33, Infinity])('rejects invalid per-turn call limits %s', (limit) => {
    const { factory } = stub();
    expect(() => createSharedGraphTurnLlmBudget(factory, limit)).toThrow(
      'GRAPH_TURN_INVALID_MODEL_CALL_LIMIT',
    );
  });
});
