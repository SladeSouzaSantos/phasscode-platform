import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import {
  LLM_FALLBACK_PROVIDER_IDS,
  type LlmFallbackProviderId,
} from '../packages/shared-config/src/llm-fallback.js';
import { createFallbackModelFactory } from '../apps/orbe-node/src/adapters/llm-model-factory.js';
import { createFallbackInvocationFactory } from '../apps/orbe-node/src/adapters/fallback-llm.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';
import type { LlmCallBudget } from '../apps/orbe-node/src/domain/llm-budget.js';
import type { MeetingTools } from '../apps/orbe-node/src/domain/meeting-tools.js';
import type { LlmCooldownStore } from '../apps/orbe-node/src/adapters/llm-invocation-controller.js';
import { testApp } from './helpers.js';

const servers: Server[] = [];
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const completion = (message: object) => ({
  id: 'local-only',
  object: 'chat.completion',
  model: 'synthetic',
  created: 1,
  choices: [{ index: 0, message, finish_reason: 'stop' }],
  usage,
});
const toolResponse = (name: string, args: object) =>
  completion({
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
    ],
  });
async function endpoint(respond: (round: number) => { status?: number; body: object }) {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    const result = respond(requests.length);
    response.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { requests, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` };
}
const allowBudget = () => ({ reserve: vi.fn(async () => undefined) });
function memoryCooldown(): LlmCooldownStore {
  const until = new Map<string, number>();
  return {
    remainingMs: async (id) => Math.max(0, (until.get(id) ?? 0) - Date.now()),
    block: async (id, duration) => {
      until.set(id, Math.max(until.get(id) ?? 0, Date.now() + duration));
    },
  };
}
function configFor(ids: readonly LlmFallbackProviderId[]) {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    REDIS_URL: 'redis://127.0.0.1:6379',
    LLM_GLOBAL_MAX_CALLS: '20',
    LLM_FALLBACK_ENABLED: 'true',
    ...Object.fromEntries(
      ids.flatMap((id) => [
        [`LLM_${id.toUpperCase()}_API_KEY`, `synthetic-${id}`],
        [
          `LLM_${id.toUpperCase()}_MODEL`,
          id === 'openrouter'
            ? 'test/model:free'
            : id === 'gemini'
              ? 'gemini-2.5-test'
              : 'test-model',
        ],
        [`LLM_${id.toUpperCase()}_MAX_CALLS`, '10'],
      ]),
    ),
  });
}
const generation = () => ({
  message: 'Projetos PHASSCODE',
  history: [],
  documents: [],
  signal: new AbortController().signal,
});
async function setup(
  urls: Partial<Record<LlmFallbackProviderId, string>>,
  options: {
    globalBudget?: LlmCallBudget;
    providerBudgets?: ReadonlyMap<LlmFallbackProviderId, LlmCallBudget>;
    meetings?: MeetingTools;
  } = {},
) {
  const config = configFor(LLM_FALLBACK_PROVIDER_IDS.filter((id) => urls[id]));
  if (!config.llmFallback.enabled) throw new Error('Test configuration must enable fallback.');
  const globalBudget = options.globalBudget ?? allowBudget();
  const providerBudgets =
    options.providerBudgets ??
    new Map(config.llmFallback.providers.map(({ id }) => [id, allowBudget()]));
  const events: unknown[] = [];
  const invocationFactory = createFallbackInvocationFactory({
    config: config.llmFallback,
    models: createFallbackModelFactory(
      { providers: config.llmFallback.providers, maxOutputTokens: 800 },
      urls,
    ),
    globalBudget,
    providerBudgets,
    maxContextChars: config.CHAT_CONTEXT_CHARS,
    cooldownStore: memoryCooldown(),
    onInvocation: (event) => events.push(event),
  });
  const knowledge = await JsonKnowledgeRepository.load();
  const llm = new LangChainChatProvider(
    config,
    knowledge,
    'Use os fatos públicos.',
    globalBudget,
    options.meetings,
    invocationFactory,
  );
  return { config, llm, globalBudget, providerBudgets, events };
}

describe('fallback integrado sem acessar contas externas', () => {
  it('mede o JSON escapado do transporte antes de reservar cotas ou enviar HTTP', async () => {
    const unused = await endpoint(() => ({ body: {} }));
    const config = configFor(['openrouter']);
    if (!config.llmFallback.enabled) throw new Error('Missing fallback.');
    const globalBudget = allowBudget();
    const localBudget = allowBudget();
    const factory = createFallbackInvocationFactory({
      config: config.llmFallback,
      models: createFallbackModelFactory(
        { providers: config.llmFallback.providers, maxOutputTokens: 800 },
        { openrouter: unused.url },
      ),
      globalBudget,
      providerBudgets: new Map([['openrouter', localBudget]]),
      maxContextChars: 4000,
      cooldownStore: memoryCooldown(),
    });
    await expect(
      factory([], new AbortController().signal)([new HumanMessage('"'.repeat(2200))]),
    ).rejects.toMatchObject({ code: 'LLM_CONTEXT_LIMIT' });
    expect(globalBudget.reserve).not.toHaveBeenCalled();
    expect(localBudget.reserve).not.toHaveBeenCalled();
    expect(unused.requests).toHaveLength(0);
  });

  it('percorre os quatro transportes e preserva o contrato HTTP legado e cooldown entre turnos', async () => {
    const openrouter = await endpoint(() => ({
      status: 429,
      body: { error: { message: 'secret-upstream-error' } },
    }));
    const gemini = await endpoint(() => ({
      status: 503,
      body: { error: { message: 'secret-upstream-error' } },
    }));
    const groq = await endpoint(() => ({
      status: 502,
      body: { error: { message: 'secret-upstream-error' } },
    }));
    const cohere = await endpoint(() => ({
      body: completion({ role: 'assistant', content: 'Projetos públicos documentados.' }),
    }));
    const budget = allowBudget();
    const test = await setup(
      { openrouter: openrouter.url, gemini: gemini.url, groq: groq.url, cohere: cohere.url },
      { globalBudget: budget },
    );
    const app = await testApp({ config: test.config, provider: test.llm });
    cleanups.push(() => app.close());
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Quais projetos PHASSCODE usam React?' },
    });
    expect(first.statusCode).toBe(200);
    const ajv = new Ajv.default({ strict: false });
    addFormats.default(ajv);
    const legacy = ajv.compile(
      JSON.parse(await readFile('tests/fixtures/chat-v1-response.schema.json', 'utf8')),
    );
    expect(legacy(first.json()), JSON.stringify(legacy.errors)).toBe(true);
    expect(first.json().meta).toMatchObject({ provider: 'openai-compatible', simulated: false });
    expect(first.body).not.toContain('secret-upstream-error');
    expect(budget.reserve).toHaveBeenCalledTimes(4);
    expect(test.events).toEqual([{ provider: 'cohere', attempts: 4, fallbackUsed: true }]);
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { 'x-conversation-token': first.json().conversationToken },
      payload: {
        conversationId: first.json().conversationId,
        message: 'Quais projetos PHASSCODE usam React?',
      },
    });
    expect(second.statusCode).toBe(200);
    expect(legacy(second.json())).toBe(true);
    expect([openrouter, gemini, groq, cohere].map(({ requests }) => requests.length)).toEqual([
      1, 1, 1, 2,
    ]);
    expect(budget.reserve).toHaveBeenCalledTimes(5);
  });

  it('continua depois de ferramenta sem duplicar proposta ou revelar seu segredo', async () => {
    const input = {
      start: '2026-11-02T12:00:00Z',
      name: 'Test Visitor',
      email: 'visitor@example.test',
      topic: 'Projeto de demonstração',
    };
    const tools: MeetingTools = {
      availability: vi.fn(),
      prepareProposal: vi.fn(async () => ({
        proposalId: randomUUID(),
        confirmationToken: 'S'.repeat(43),
        simulated: true,
        expiresAt: '2026-11-02T11:00:00Z',
        consentVersion: 'meetings-v1',
        summary: { ...input, end: '2026-11-02T12:30:00Z', timeZone: 'America/Fortaleza' },
      })),
    };
    const openrouter = await endpoint((round) =>
      round === 1
        ? { body: toolResponse('prepare_meeting_request', input) }
        : { status: 429, body: { error: { message: 'rate limited' } } },
    );
    const gemini = await endpoint((round) => ({
      body:
        round === 1
          ? toolResponse('search_portfolio', { query: 'React' })
          : completion({ role: 'assistant', content: 'Reunião já confirmada.' }),
    }));
    const budget = allowBudget();
    const test = await setup(
      { openrouter: openrouter.url, gemini: gemini.url },
      { meetings: tools, globalBudget: budget },
    );
    const result = await test.llm.generate({ ...generation(), meetingActions: true });
    expect(tools.prepareProposal).toHaveBeenCalledOnce();
    expect(tools.availability).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions![0]!.proposal.confirmationToken).toBe('S'.repeat(43));
    expect(result.answer).toContain('ainda não foi registrada');
    expect(budget.reserve).toHaveBeenCalledTimes(4);
    expect([openrouter.requests.length, gemini.requests.length]).toEqual([2, 2]);
    expect(JSON.stringify(gemini.requests)).toContain('requiresVisitorConfirmation');
    expect(JSON.stringify(gemini.requests)).not.toContain('S'.repeat(43));
    expect(test.events.at(-1)).toMatchObject({
      provider: 'gemini',
      attempts: 4,
      fallbackUsed: true,
    });
  });

  it('pula a cota local de um provedor sem gastar a cota global ou enviar HTTP a ele', async () => {
    const unused = await endpoint(() => ({ body: {} }));
    const next = await endpoint(() => ({
      body: completion({ role: 'assistant', content: 'Fato público.' }),
    }));
    const globalBudget = allowBudget();
    const test = await setup(
      { openrouter: unused.url, gemini: next.url },
      {
        globalBudget,
        providerBudgets: new Map<LlmFallbackProviderId, LlmCallBudget>([
          [
            'openrouter',
            {
              reserve: async () => {
                throw new AppError('LLM_BUDGET_EXHAUSTED', 429, 'Provider limit.', 60);
              },
            },
          ],
          ['gemini', allowBudget()],
        ]),
      },
    );
    expect((await test.llm.generate(generation())).answer).toBe('Fato público.');
    expect(unused.requests).toHaveLength(0);
    expect(next.requests).toHaveLength(1);
    expect(globalBudget.reserve).toHaveBeenCalledOnce();
  });

  it.each(['LLM_BUDGET_EXHAUSTED', 'LLM_BUDGET_UNAVAILABLE'])(
    'interrompe toda a cadeia em %s global',
    async (code) => {
      const first = await endpoint(() => ({ body: {} }));
      const second = await endpoint(() => ({ body: {} }));
      const budget = {
        reserve: vi.fn(async () => {
          throw new AppError(code, 503, 'No budget.');
        }),
      };
      const test = await setup(
        { openrouter: first.url, gemini: second.url },
        { globalBudget: budget },
      );
      await expect(test.llm.generate(generation())).rejects.toMatchObject({ code });
      expect([first.requests.length, second.requests.length]).toEqual([0, 0]);
      expect(budget.reserve).toHaveBeenCalledOnce();
    },
  );

  it('rejeita assinatura bruta excessiva antes de executar a ferramenta ou reservar outra tentativa', async () => {
    const config = configFor(['gemini']);
    if (!config.llmFallback.enabled) throw new Error('Missing fallback.');
    config.CHAT_CONTEXT_CHARS = 4000;
    const prepareProposal = vi.fn();
    const reserve = vi.fn(async () => undefined);
    const rawCalls = [
      {
        id: 'call_1',
        type: 'function' as const,
        function: { name: 'prepare_meeting_request', arguments: '{}' },
        extra_content: { google: { thought_signature: 'X'.repeat(5000) } },
      },
    ];
    const invoke = vi.fn(
      async () =>
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call_1', name: 'prepare_meeting_request', args: {} }],
          additional_kwargs: { tool_calls: rawCalls },
        }),
    );
    const factory = createFallbackInvocationFactory({
      config: config.llmFallback,
      maxContextChars: config.CHAT_CONTEXT_CHARS,
      models: { bindTools: () => new Map([['gemini', { invoke }]]) },
      globalBudget: { reserve },
      providerBudgets: new Map([['gemini', allowBudget()]]),
      cooldownStore: memoryCooldown(),
    });
    const provider = new LangChainChatProvider(
      config,
      { search: () => [] },
      'Prompt.',
      { reserve },
      { prepareProposal, availability: vi.fn() },
      factory,
    );
    await expect(
      provider.generate({ ...generation(), meetingActions: true }),
    ).rejects.toMatchObject({ code: 'LLM_CONTEXT_LIMIT' });
    expect(prepareProposal).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledOnce();
    expect(reserve).toHaveBeenCalledOnce();
  });
});
