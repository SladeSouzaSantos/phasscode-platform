import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import { createBudgetedSemanticVacancyProposer } from '../apps/orbe-node/src/application/graph-semantic-vacancy.js';
import { createEvidenceAnchoredVacancyPlanner } from '../apps/orbe-node/src/application/graph-vacancy-text.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import { createFallbackInvocationFactory } from '../apps/orbe-node/src/adapters/fallback-llm.js';
import type { BoundModelPort } from '../apps/orbe-node/src/adapters/llm-model-factory.js';
import type { LlmFallbackProviderId } from '../packages/shared-config/src/llm-fallback.js';
import type { LlmInvocationFactory } from '../apps/orbe-node/src/domain/llm-invocation.js';
import type { EvidenceGraphRepository } from '../apps/orbe-node/src/domain/evidence-graph.js';

const skills = [
  { id: 'skill-java', label: 'Java' },
  { id: 'skill-javascript', label: 'JavaScript' },
  { id: 'skill-sql', label: 'SQL' },
  { id: 'skill-sql-server', label: 'SQL Server' },
  { id: 'skill-react', label: 'React' },
  { id: 'skill-python', label: 'Python' },
];
const sourceText = [
  'Requisitos obrigatórios:',
  '- experiência em Java',
  '- SQL Server',
  '- Go',
  'Diferenciais:',
  '- React',
].join('\n');

const normalise = (messages: readonly BaseMessage[]) => {
  const human = messages[1];
  if (!human || typeof human.content !== 'string') throw Error('NO_HUMAN_CONTENT');
  const parsed = JSON.parse(human.content) as {
    fragments: Array<{ id: string; excerpt: string; mandatory: boolean }>;
  };
  return {
    proposals: parsed.fragments.map((fragment) => ({
      id: fragment.id,
      excerpt: fragment.excerpt,
      label: fragment.excerpt === 'experiência em Java' ? 'Java' : fragment.excerpt,
    })),
  };
};

function modelFactory(response: (messages: readonly BaseMessage[]) => unknown): {
  factory: LlmInvocationFactory;
  invoke: ReturnType<typeof vi.fn>;
} {
  const invoke = vi.fn(async (messages: BaseMessage[]) => new AIMessage(JSON.stringify(response(messages))));
  const factory: LlmInvocationFactory = (tools, signal) => {
    if (tools.length) throw new Error('GRAPH_SEMANTIC_FORBIDS_TOOLS');
    return async (messages) => {
      signal.throwIfAborted();
      return invoke(messages);
    };
  };
  return { factory, invoke };
}

const options = (factory: LlmInvocationFactory) => ({
  invocationFactory: factory,
  signal: new AbortController().signal,
  maxContextChars: 12_000,
});

describe('F3.3 budget-aware semantic vacancy label normalizer', () => {
  it('normalizes only verifiable technical labels; unknown Go and desirable React remain accurate', async () => {
    const { factory, invoke } = modelFactory(normalise);
    const proposer = createBudgetedSemanticVacancyProposer(options(factory));
    const planner = createEvidenceAnchoredVacancyPlanner(skills, { proposeLabels: proposer });
    const result = await planner(sourceText);
    expect(result.requirements.map((r) => [r.id, r.mandatory])).toEqual([
      ['skill-java', true],
      ['skill-sql-server', true],
      ['skill-react', false],
    ]);
    expect(result.unknown).toEqual([{ label: 'Go', mandatory: true }]);
    expect(invoke).toHaveBeenCalledOnce();
    const sent = invoke.mock.calls[0]![0] as BaseMessage[];
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBeInstanceOf(SystemMessage);
    expect(sent[1]).toBeInstanceOf(HumanMessage);
    expect(JSON.stringify(sent)).not.toMatch(/api_key|neo4j_auth|postgres_password/i);
  });

  it('rejects model proposals that invent a technology or manipulate the source excerpt', async () => {
    const invented = modelFactory((messages) => {
      const result = normalise(messages);
      return { proposals: result.proposals.map((p) =>
        p.excerpt === 'Go' ? { ...p, label: 'Java' } : p,
      ) };
    });
    const planner = createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(invented.factory)),
    });
    await expect(planner(sourceText)).rejects.toThrow('GRAPH_VACANCY_HALLUCINATED_LABEL');

    const tampered = modelFactory((messages) => {
      const result = normalise(messages);
      return { proposals: result.proposals.map((p) =>
        p.excerpt === 'Go' ? { ...p, excerpt: 'Java' } : p,
      ) };
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(tampered.factory)),
    })(sourceText)).rejects.toThrow('GRAPH_VACANCY_UNGROUNDED_PROPOSAL');
  });

  it('keeps SQL Server unknown if an LLM deceptively chooses generic SQL', async () => {
    const { factory } = modelFactory((messages) => ({
      proposals: normalise(messages).proposals.map((p) =>
        p.excerpt === 'SQL Server' ? { ...p, label: 'SQL' } : p,
      ),
    }));
    const planner = createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(factory)),
    });
    const result = await planner(sourceText);
    expect(result.requirements.map((x) => x.id)).not.toContain('skill-sql');
    expect(result.requirements.map((x) => x.id)).toContain('skill-sql-server');
    expect(result.unknown).toEqual([{ label: 'Go', mandatory: true }]);
  });

  it('rejects missing, duplicated and extra model labels rather than accepting partial vacancy coverage', async () => {
    const omit = modelFactory((messages) => ({ proposals: normalise(messages).proposals.slice(1) }));
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(omit.factory)),
    })(sourceText)).rejects.toThrow('GRAPH_VACANCY_PROPOSAL_OMISSION');

    const duplicate = modelFactory((messages) => {
      const { proposals } = normalise(messages);
      return { proposals: proposals.map((p) => ({ ...p, id: proposals[0]!.id })) };
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(duplicate.factory)),
    })(sourceText)).rejects.toThrow('GRAPH_VACANCY_DUPLICATE_PROPOSAL');

    const extra = modelFactory((messages) => ({
      proposals: normalise(messages).proposals.map((p) => ({ ...p, experienceYears: 10 })),
    }));
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(extra.factory)),
    })(sourceText)).rejects.toThrow('GRAPH_SEMANTIC_INVALID_RESPONSE');
  });

  it('refuses non-JSON, markdown fences and model tool calls', async () => {
    const bad = modelFactory(() => 'not json');
    // Return an AIMessage with literal non-JSON text, not a JSON encoded string.
    const badFactory: LlmInvocationFactory = () => async () => new AIMessage('not json');
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(badFactory)),
    })(sourceText)).rejects.toThrow('GRAPH_SEMANTIC_INVALID_JSON');
    expect(bad.invoke).not.toHaveBeenCalled();

    const toolFactory: LlmInvocationFactory = () => async () => new AIMessage({
      content: JSON.stringify({ proposals: [] }),
      tool_calls: [{ id: 'call_1', name: 'shell', args: { command: 'rm -rf /' } }],
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(toolFactory)),
    })(sourceText)).rejects.toThrow('GRAPH_SEMANTIC_INVALID_RESPONSE');
  });

  it('blocks context overflow before any provider or global budget reservation', async () => {
    const { factory, invoke } = modelFactory(normalise);
    const proposer = createBudgetedSemanticVacancyProposer({
      ...options(factory), maxContextChars: 2_000,
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: proposer,
    })('Requisitos:\n' + '- experiência sólida com Java\n'.repeat(100))).rejects.toThrow(
      'GRAPH_SEMANTIC_CONTEXT_LIMIT',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('uses the real fallback factory: provider and global quotas are each reserved once', async () => {
    const globalReserve = vi.fn(async () => {});
    const providerReserve = vi.fn(async () => {});
    const invoke = vi.fn(async (messages: BaseMessage[]) =>
      new AIMessage(JSON.stringify(normalise(messages))),
    );
    const factory = createFallbackInvocationFactory({
      config: {
        enabled: true,
        providers: [{
          id: 'gemini',
          apiKey: 'synthetic-never-sent',
          model: 'local-unit-model',
          timeoutMs: 1_500,
          maxCalls: 10,
          windowMs: 60_000,
        }],
        cooldownMs: 100,
        maxCooldownMs: 1_000,
        maxAttemptsPerTurn: 1,
      },
      models: {
        bindTools: () => new Map<LlmFallbackProviderId, BoundModelPort>([
          ['gemini', { invoke }],
        ]),
      },
      globalBudget: { reserve: globalReserve },
      providerBudgets: new Map([['gemini', { reserve: providerReserve }]]),
      cooldownStore: {
        remainingMs: async () => 0,
        block: async () => {},
      },
      maxContextChars: 12_000,
    });
    const proposer = createBudgetedSemanticVacancyProposer(options(factory));
    const planner = createEvidenceAnchoredVacancyPlanner(skills, { proposeLabels: proposer });
    const result = await planner('Requisitos: Java, Go');
    expect(result.requirements).toHaveLength(1);
    expect(result.unknown).toEqual([{ label: 'Go', mandatory: true }]);
    expect(invoke).toHaveBeenCalledOnce();
    expect(globalReserve).toHaveBeenCalledOnce();
    expect(providerReserve).toHaveBeenCalledOnce();
  });

  it('does not issue a model request when no eligible vacancy evidence fragments exist', async () => {
    const { factory, invoke } = modelFactory(normalise);
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(factory)),
    })('Nossa equipe utiliza Java e React.')).rejects.toThrow(
      'GRAPH_VACANCY_NO_EXPLICIT_REQUIREMENTS',
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falls back to canonical PPKS exactly once when model labels are unavailable', async () => {
    const { factory } = modelFactory(() => ({ proposals: [] }));
    const findEvidence = vi.fn(async () => []);
    const canonical = vi.fn(async () => 'PPKS com fatos comprovados');
    const evidence: EvidenceGraphRepository = { findEvidence, getSource: vi.fn() };
    const result = await evaluateGraphRecruiterPreview('Vaga Java e Go', {
      evidence,
      identifyRequirements: () => [],
      requirementPlan: () =>
        createEvidenceAnchoredVacancyPlanner(skills, {
          proposeLabels: createBudgetedSemanticVacancyProposer(options(factory)),
        })('Requisitos: Java, Go'),
      canonicalPpks: canonical,
    });
    expect(result).toMatchObject({
      mode: 'canonical_ppks',
      reason: 'unavailable_or_incomplete',
      answer: 'PPKS com fatos comprovados',
    });
    expect(canonical).toHaveBeenCalledOnce();
    expect(findEvidence).not.toHaveBeenCalled();
  });

  it('rejects oversized responses or absent model output, without exposing private content', async () => {
    const oversize: LlmInvocationFactory = () => async () => new AIMessage(
      'x'.repeat(1_100),
    );
    const proposer = createBudgetedSemanticVacancyProposer({
      ...options(oversize),
      maxResponseChars: 1_000,
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, { proposeLabels: proposer })(
      'Requisitos: Java',
    )).rejects.toThrow('GRAPH_SEMANTIC_INVALID_RESPONSE');

    const invalid: LlmInvocationFactory = () => async () => new AIMessage({
      content: [{ type: 'text', text: 'private-prompt-canary' }],
    });
    await expect(createEvidenceAnchoredVacancyPlanner(skills, {
      proposeLabels: createBudgetedSemanticVacancyProposer(options(invalid)),
    })('Requisitos: Java')).rejects.toThrow('GRAPH_SEMANTIC_INVALID_RESPONSE');
  });
});
