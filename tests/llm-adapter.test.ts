import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig as loadBaseConfig } from '../packages/shared-config/src/index.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';
import type { LlmCallBudget } from '../apps/orbe-node/src/domain/llm-budget.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import type { KnowledgeDocument } from '../apps/orbe-node/src/domain/ports.js';

const allowTestBudget: LlmCallBudget = { reserve: async () => undefined };
const loadConfig = (env: NodeJS.ProcessEnv) =>
  loadBaseConfig({ REDIS_URL: 'redis://127.0.0.1:6379', LLM_GLOBAL_MAX_CALLS: '100', ...env });

const servers: Server[] = [];
afterEach(async () => {
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
async function llmServer(respond: (body: Record<string, unknown>, round: number) => object) {
  const requests: Record<string, unknown>[] = [];
  const paths: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    requests.push(body);
    paths.push(request.url!);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(respond(body, requests.length)));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    paths,
  };
}
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const messageCharacters = (request: Record<string, unknown>) =>
  (
    request.messages as {
      role: string;
      content: unknown;
      tool_calls?: unknown;
      tool_call_id?: string;
    }[]
  ).reduce(
    (sum, message) =>
      sum +
      JSON.stringify(message.content).length +
      (message.role === 'assistant' ? JSON.stringify(message.tool_calls ?? []).length : 0) +
      (message.role === 'tool' ? JSON.stringify(message.tool_call_id).length : 0),
    0,
  );
const document = (id: string, content: string): KnowledgeDocument => ({
  id,
  type: 'project',
  title: `Projeto ${id}`,
  content,
  keywords: [id],
});
const completion = (message: object, finishReason = 'stop') => ({
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1,
  model: 'test',
  choices: [{ index: 0, message, finish_reason: finishReason }],
  usage,
});
const responseObject = (output: object[]) => ({
  id: 'resp_test',
  object: 'response',
  created_at: 1,
  status: 'completed',
  error: null,
  incomplete_details: null,
  instructions: null,
  model: 'test',
  output,
  parallel_tool_calls: true,
  tools: [],
  tool_choice: 'auto',
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
});

describe('adaptador real LangChain com transporte HTTP simulado', () => {
  it('recorta pares antigos pelo contexto serializado na terceira mensagem de uma conversa real', async () => {
    const answer = (round: number) =>
      `Rodada ${round}: ${'React, TypeScript e Vite. '.repeat(100)}`;
    const stub = await llmServer((_body, round) =>
      completion({ role: 'assistant', content: answer(round) }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '12000',
    });
    const knowledge = await JsonKnowledgeRepository.load();
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      await readFile('apps/orbe-node/prompts/v4.md', 'utf8'),
      allowTestBudget,
    );
    const service = new ChatService(new MemoryConversationStore(), provider, knowledge, config);
    const message = 'Quais tecnologias usa o frontend do portfolio PHASSCODE?';
    const first = await service.execute({ message });
    for (let turn = 0; turn < 2; turn++) {
      const result = await service.execute(
        { message, conversationId: first.conversationId },
        first.conversationToken,
      );
      expect(result.sources.length).toBeGreaterThan(0);
    }
    expect(stub.requests).toHaveLength(3);
    for (const request of stub.requests)
      expect(messageCharacters(request)).toBeLessThanOrEqual(12000);
    const messages = stub.requests[2]!.messages as { role: string; content: string }[];
    expect(
      messages.filter((item) => item.role === 'assistant').map((item) => item.content),
    ).toEqual([answer(2)]);
    expect(messages.map((item) => item.role)).toEqual([
      'system',
      'user',
      'user',
      'assistant',
      'user',
    ]);
  });

  it('mantém títulos dos 42 cursos em seis trilhas no contexto real da LLM', async () => {
    const stub = await llmServer(() =>
      completion({
        role: 'assistant',
        content: 'Os 42 cursos livres estão organizados em seis trilhas.',
      }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '12000',
    });
    const knowledge = await JsonKnowledgeRepository.load();
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      await readFile('apps/orbe-node/prompts/v4.md', 'utf8'),
      allowTestBudget,
    );
    const service = new ChatService(new MemoryConversationStore(), provider, knowledge, config);
    await service.execute({ message: 'Liste todos os 42 cursos concluídos por trilha.' });
    expect(stub.requests).toHaveLength(1);
    const transmitted = JSON.stringify(stub.requests[0]!.messages);
    for (const phrase of [
      'Formação Java e Clean Architecture',
      'Formação Power BI Analyst',
      'Formação Firebase Authentication',
      'Formação Engenharia de Requisitos',
      'Formação SQL Database Specialist',
      'Hackers do Bem',
    ]) {
      expect(transmitted).toContain(phrase);
    }
    expect(messageCharacters(stub.requests[0]!)).toBeLessThanOrEqual(12000);
  });

  it('compacta todas as fontes antes do invoke sem eliminar evidência posterior', async () => {
    const stub = await llmServer(() =>
      completion({
        role: 'assistant',
        content: 'O projeto prioritario apresenta um fato público.',
      }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '4000',
    });
    const documents = ['prioritario', 'segundo', 'terceiro'].map((id) =>
      document(id, 'Fato público. '.repeat(60)),
    );
    const provider = new LangChainChatProvider(
      config,
      new JsonKnowledgeRepository(documents),
      'P'.repeat(2500),
      allowTestBudget,
    );
    const result = await provider.generate({
      message: 'Projetos',
      history: [],
      documents,
      signal: new AbortController().signal,
    });
    // Retention makes each document available; citations still depend on answer content.
    expect(result.sources.map((source) => source.id)).toEqual(['prioritario']);
    expect(messageCharacters(stub.requests[0]!)).toBeLessThanOrEqual(4000);
    const reference = (stub.requests[0]!.messages as { content: string }[])[1]!.content;
    expect(reference).toContain('prioritario');
    expect(reference).toContain('segundo');
    expect(reference).toContain('terceiro');
    expect(documents).toHaveLength(3);
  });

  it('preserves CodeQL, OWASP ZAP and Docker Swarm over a compacted LLM wire', async () => {
    const stub = await llmServer(() =>
      completion({ role: 'assistant', content: 'PHASSCODE Platform usa CodeQL e OWASP ZAP; SHADOW SIM PRO usa Docker Swarm.' }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '5000',
    });
    const platform = {
      ...document(
        'phasscode-platform',
        'Backend autoral PHASSCODE com Node.js, Redis e Docker. '.repeat(35) +
          'O workflow executa CodeQL (SAST) e OWASP ZAP (DAST).',
      ),
      type: 'platform' as const,
      category: 'personal' as const,
      technologies: ['Node.js', 'Docker', 'CodeQL', 'OWASP ZAP', 'SAST', 'DAST'],
    };
    const swarm = {
      ...document(
        'shadow-sim-pro',
        'SHADOW SIM PRO utiliza Python para estudos de sombreamento. '.repeat(30) +
          'O deploy usa Docker Swarm.',
      ),
      category: 'study' as const,
      technologies: ['Python', 'Docker Swarm'],
    };
    const provider = new LangChainChatProvider(
      config,
      new JsonKnowledgeRepository([platform, swarm]),
      'Diretrizes de recrutamento: fundamentar toda evidência, diferenciar projeto e emprego. '.repeat(
        27,
      ),
      allowTestBudget,
    );
    await provider.generate({
      message: 'Vaga com CodeQL, OWASP ZAP, SAST, DAST e Docker Swarm. Onde são usados?',
      history: [],
      documents: [platform, swarm],
      signal: new AbortController().signal,
    });
    const wire = stub.requests[0]!;
    expect(messageCharacters(wire)).toBeLessThanOrEqual(5000);
    const reference = (wire.messages as { content: string }[])[1]!.content;
    expect(reference).toContain('phasscode-platform');
    expect(reference).toContain('shadow-sim-pro');
    expect(reference).toContain('CodeQL');
    expect(reference).toContain('OWASP ZAP');
    expect(reference).toContain('SAST');
    expect(reference).toContain('DAST');
    expect(reference).toContain('Docker Swarm');
  });

  it('reduz o primeiro documento usando JSON escapado, sem esvaziar ou modificar o original', async () => {
    const stub = await llmServer(() =>
      completion({ role: 'assistant', content: 'O projeto aspas apresenta um fato público.' }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '4000',
    });
    const original = document('aspas', '"\\\nFato público.\n'.repeat(150));
    const provider = new LangChainChatProvider(
      config,
      new JsonKnowledgeRepository([original]),
      'P'.repeat(3000),
      allowTestBudget,
    );
    const result = await provider.generate({
      message: 'Projetos',
      history: [],
      documents: [original],
      signal: new AbortController().signal,
    });
    const reference = (stub.requests[0]!.messages as { content: string }[])[1]!.content;
    const selected = JSON.parse(
      reference.slice(reference.indexOf('\n') + 1),
    ) as KnowledgeDocument[];
    expect(selected[0]!.content.length).toBeGreaterThan(0);
    expect(selected[0]!.content.length).toBeLessThan(original.content.length);
    expect(original.content).toBe('"\\\nFato público.\n'.repeat(150));
    expect(result.sources.map((source) => source.id)).toEqual(['aspas']);
    expect(messageCharacters(stub.requests[0]!)).toBeLessThanOrEqual(4000);
  });

  it('não reserva cota ou invoca o modelo se nem prompt, pergunta e um fato mínimo cabem', async () => {
    const stub = await llmServer(() =>
      completion({ role: 'assistant', content: 'Não deve ser chamada.' }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '4000',
    });
    const reserve = vi.fn(async () => undefined);
    const documents = [document('minimo', 'Fato')];
    const provider = new LangChainChatProvider(
      config,
      new JsonKnowledgeRepository(documents),
      'P'.repeat(4000),
      { reserve },
    );
    await expect(
      provider.generate({
        message: 'Projetos',
        history: [],
        documents,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_CONTEXT_LIMIT' });
    expect(reserve).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });

  it('considera escapes e identificador da ferramenta ao selecionar seus documentos', async () => {
    const callId = 'call_' + 'x'.repeat(150);
    const stub = await llmServer((_body, round) =>
      round === 1
        ? completion(
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: callId,
                  type: 'function',
                  function: { name: 'search_portfolio', arguments: '{"query":"React"}' },
                },
              ],
            },
            'tool_calls',
          )
        : completion({ role: 'assistant', content: 'O projeto pequeno usa React.' }),
    );
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'test-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '4000',
    });
    const documents = [
      document('grande', '"'.repeat(650)),
      document('pequeno', 'React documentado.'),
    ];
    const provider = new LangChainChatProvider(
      config,
      new JsonKnowledgeRepository(documents),
      'P'.repeat(2000),
      allowTestBudget,
    );
    const result = await provider.generate({
      message: 'Projetos',
      history: [],
      documents: [],
      signal: new AbortController().signal,
    });
    expect(stub.requests).toHaveLength(2);
    for (const request of stub.requests)
      expect(messageCharacters(request)).toBeLessThanOrEqual(4000);
    expect(result.sources.map((source) => source.id)).toEqual(['pequeno']);
    const toolMessage = (
      stub.requests[1]!.messages as { role: string; content: string; tool_call_id: string }[]
    ).find((message) => message.role === 'tool')!;
    expect(toolMessage.tool_call_id).toBe(callId);
    expect(toolMessage.content).toContain('pequeno');
    expect(toolMessage.content).not.toContain('grande');
  });

  const input = (signal = new AbortController().signal) => ({
    message: 'Projetos PHASSCODE',
    history: [],
    documents: [],
    signal,
  });
  const budgetedProvider = async (baseUrl: string, budget: LlmCallBudget) =>
    new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      await JsonKnowledgeRepository.load(),
      'Use apenas as fontes.',
      budget,
    );

  it('reserva cada invoke e bloqueia a continuação após ferramenta quando o limite acaba', async () => {
    const stub = await llmServer(() =>
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'search_portfolio', arguments: '{"query":"React"}' },
            },
          ],
        },
        'tool_calls',
      ),
    );
    const reserve = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppError('LLM_BUDGET_EXHAUSTED', 429, 'Limite atingido.', 30));
    const provider = await budgetedProvider(stub.baseUrl, { reserve });
    await expect(provider.generate(input())).rejects.toMatchObject({
      code: 'LLM_BUDGET_EXHAUSTED',
      retryAfterSeconds: 30,
    });
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(stub.requests).toHaveLength(1);
  });

  it('não chama o transporte se a reserva falha por Redis indisponível', async () => {
    const stub = await llmServer(() => completion({ role: 'assistant', content: 'Resposta.' }));
    const provider = await budgetedProvider(stub.baseUrl, {
      reserve: async () => {
        throw new AppError('LLM_BUDGET_UNAVAILABLE', 503, 'Controle indisponível.');
      },
    });
    await expect(provider.generate(input())).rejects.toMatchObject({
      code: 'LLM_BUDGET_UNAVAILABLE',
      status: 503,
    });
    expect(stub.requests).toHaveLength(0);
  });

  it('mantém uma tentativa que falhou consumida, sem reembolso ou retry do SDK', async () => {
    const stub = await llmServer(() => completion({ role: 'assistant', content: '' }, 'length'));
    const reserve = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppError('LLM_BUDGET_EXHAUSTED', 429, 'Limite atingido.', 30));
    const provider = await budgetedProvider(stub.baseUrl, { reserve });
    await expect(provider.generate(input())).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
    });
    await expect(provider.generate(input())).rejects.toMatchObject({
      code: 'LLM_BUDGET_EXHAUSTED',
    });
    expect(stub.requests).toHaveLength(1);
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it.each(['before', 'during'])('não inicia invoke cancelado %s da reserva', async (when) => {
    const stub = await llmServer(() => completion({ role: 'assistant', content: 'Resposta.' }));
    const controller = new AbortController();
    const reserve = vi.fn(async () => {
      if (when === 'during') controller.abort();
    });
    const provider = await budgetedProvider(stub.baseUrl, { reserve });
    if (when === 'before') controller.abort();
    await expect(provider.generate(input(controller.signal))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(reserve).toHaveBeenCalledTimes(when === 'before' ? 0 : 1);
    expect(stub.requests).toHaveLength(0);
  });

  it('limita um turno a três invokes e seis ferramentas, sem executar ferramentas após o último invoke', async () => {
    const stub = await llmServer((_body, round) =>
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: Array.from({ length: 3 }, (_, index) => ({
            id: `call_${round}_${index}`,
            type: 'function',
            function: { name: 'search_portfolio', arguments: '{"query":"React"}' },
          })),
        },
        'tool_calls',
      ),
    );
    const reserve = vi.fn(async () => undefined);
    const search = vi.fn(() => []);
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      { search },
      'Use apenas as fontes.',
      { reserve },
    );
    await expect(provider.generate(input())).rejects.toMatchObject({ code: 'LLM_TOOL_LIMIT' });
    expect(stub.requests).toHaveLength(3);
    expect(reserve).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledTimes(6);
  });

  it.each(['true', 'false'])(
    'envia reasoning.enabled=%s no payload HTTP sem expor raciocínio',
    async (enabled) => {
      const stub = await llmServer(() =>
        completion({
          role: 'assistant',
          content: 'Resposta pública do portfólio.',
          reasoning: 'internal_reasoning_never_return',
        }),
      );
      const provider = new LangChainChatProvider(
        loadConfig({
          LLM_PROVIDER: 'openai-compatible',
          LLM_API_KEY: 'test-only',
          LLM_MODEL: 'test',
          LLM_BASE_URL: stub.baseUrl,
          LLM_API_MODE: 'chat-completions',
          OPENROUTER_REASONING_ENABLED: enabled,
        }),
        await JsonKnowledgeRepository.load(),
        'Use apenas as fontes.',
        allowTestBudget,
      );
      const result = await provider.generate({
        message: 'Portfólio PHASSCODE',
        history: [],
        documents: [],
        signal: new AbortController().signal,
      });
      expect(stub.paths).toEqual(['/v1/chat/completions']);
      expect(stub.requests[0]?.reasoning).toEqual({ enabled: enabled === 'true' });
      expect(stub.requests[0]?.store).toBe(false);
      expect(result.answer).toBe('Resposta pública do portfólio.');
      expect(JSON.stringify(result)).not.toContain('internal_reasoning');
    },
  );

  it('recusa conteúdo vazio sem usar reasoning como fallback da resposta', async () => {
    const stub = await llmServer(() =>
      completion(
        { role: 'assistant', content: '', reasoning: 'internal_reasoning_never_return' },
        'length',
      ),
    );
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      await JsonKnowledgeRepository.load(),
      'Use apenas as fontes.',
      allowTestBudget,
    );
    await expect(
      provider.generate({
        message: 'Portfólio PHASSCODE',
        history: [],
        documents: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' });
    expect(stub.requests[0]).not.toHaveProperty('reasoning');
  });

  it('limita rodadas e mantém o orçamento de contexto ao repetir ferramentas', async () => {
    const stub = await llmServer(() =>
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_repeat',
              type: 'function',
              function: { name: 'search_portfolio', arguments: '{"query":"React"}' },
            },
          ],
        },
        'tool_calls',
      ),
    );
    const provider = new LangChainChatProvider(
      loadConfig({
        CHAT_CONTEXT_CHARS: '4000',
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      {
        search: () => [
          {
            type: 'project',
            id: 'test',
            title: 'Teste',
            keywords: [],
            content: 'React '.repeat(1000),
          },
        ],
      },
      'Somente fatos públicos.',
      allowTestBudget,
    );
    await expect(
      provider.generate({
        message: 'Projeto React',
        history: [],
        documents: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_TOOL_LIMIT' });
    expect(stub.requests).toHaveLength(3);
    for (const request of stub.requests) {
      const messages = request.messages as { content: unknown }[];
      expect(
        messages.reduce((size, message) => size + JSON.stringify(message.content).length, 0),
      ).toBeLessThanOrEqual(4000);
    }
  });
  it('executa tool calling em Chat Completions e retorna fontes do servidor', async () => {
    const stub = await llmServer((_body, round) =>
      round === 1
        ? completion(
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'search_portfolio', arguments: '{"query":"React"}' },
                },
              ],
            },
            'tool_calls',
          )
        : completion({ role: 'assistant', content: 'O portfólio usa React, TypeScript e Vite.' }),
    );
    const knowledge = await JsonKnowledgeRepository.load();
    const reserve = vi.fn(async () => undefined);
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      knowledge,
      'Use apenas as fontes.',
      { reserve },
    );
    const result = await provider.generate({
      message: 'Quais projetos?',
      history: [],
      documents: [],
      signal: new AbortController().signal,
    });
    expect(result.answer).toContain('React');
    expect(result.sources.map((source) => source.id)).toContain('web-portfolio-v2');
    expect(stub.requests).toHaveLength(2);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(stub.paths).toEqual(['/v1/chat/completions', '/v1/chat/completions']);
    expect(stub.requests[0]!.store).toBe(false);
    expect(stub.requests.every((request) => !Object.hasOwn(request, 'reasoning'))).toBe(true);
    expect(JSON.stringify(stub.requests[1]!.messages)).toContain('call_1');
  });
  it('usa Responses API sem armazenamento remoto e conclui a ferramenta', async () => {
    const stub = await llmServer((_body, round) =>
      round === 1
        ? responseObject([
            {
              type: 'function_call',
              id: 'fc_test',
              call_id: 'call_1',
              name: 'search_portfolio',
              arguments: '{"query":"React"}',
              status: 'completed',
            },
          ])
        : responseObject([
            {
              type: 'message',
              id: 'msg_test',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'O frontend usa React.', annotations: [] }],
            },
          ]),
    );
    const knowledge = await JsonKnowledgeRepository.load();
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'responses',
      }),
      knowledge,
      'Use apenas as fontes.',
      allowTestBudget,
    );
    const result = await provider.generate({
      message: 'Frontend PHASSCODE',
      history: [],
      documents: knowledge.search('React'),
      signal: new AbortController().signal,
    });
    expect(result.answer).toContain('React');
    expect(stub.paths).toEqual(['/v1/responses', '/v1/responses']);
    expect(stub.requests.every((request) => request.store === false)).toBe(true);
    expect(stub.requests.every((request) => !Object.hasOwn(request, 'reasoning'))).toBe(true);
    expect(JSON.stringify(stub.requests[1]!.input)).toContain('function_call_output');
  });
  it('seleciona apenas fontes usadas na resposta mesmo depois de uma busca de ferramenta irrelevante', async () => {
    const answer =
      'Pedro trabalhou com Java no desenvolvimento e manutenção do SIGAA, usando Hibernate, JBoss e PostgreSQL. O Webservice Spring Boot e JPA é um projeto de estudo em Java 17 com Spring Data JPA e H2.';
    const stub = await llmServer((_body, round) =>
      round === 1
        ? completion(
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'search-extra',
                  type: 'function',
                  function: {
                    name: 'search_portfolio',
                    arguments: '{"query":"Python engenharia solar"}',
                  },
                },
              ],
            },
            'tool_calls',
          )
        : completion({ role: 'assistant', content: answer }),
    );
    const knowledge = await JsonKnowledgeRepository.load();
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'synthetic-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
        CHAT_CONTEXT_CHARS: '32000',
      }),
      knowledge,
      await readFile('apps/orbe-node/prompts/v4.md', 'utf8'),
      allowTestBudget,
    );
    const query = 'Quais as qualificações de Pedro para uma vaga Java?';
    const result = await provider.generate({
      message: query,
      history: [],
      documents: knowledge.search(query),
      signal: new AbortController().signal,
    });
    expect(stub.requests).toHaveLength(2);
    expect(JSON.stringify(stub.requests[1])).toContain('hsp-simulator');
    expect(result.sources.map((source) => source.id).sort()).toEqual([
      'experiencia-sig',
      'webservice-springboot-jpa',
    ]);
    expect(
      result.sources.find((source) => source.id === 'webservice-springboot-jpa')?.url,
    ).toContain('github.com/');
    expect(
      result.sources.every(
        (source) => !('technologies' in source) && !('experiencePeriod' in source),
      ),
    ).toBe(true);
  });

  it('envia cálculos mensais derivados dos registros sem misturar vínculo atual com tempo Java', async () => {
    const stub = await llmServer(() =>
      completion({
        role: 'assistant',
        content: 'Pedro trabalhou com Java no SIGAA e no estágio da ACRUX, em períodos diferentes.',
      }),
    );
    const knowledge = await JsonKnowledgeRepository.load();
    const config = loadConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'synthetic-only',
      LLM_MODEL: 'test',
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_MODE: 'chat-completions',
      CHAT_CONTEXT_CHARS: '32000',
    });
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      await readFile('apps/orbe-node/prompts/v4.md', 'utf8'),
      allowTestBudget,
    );
    const service = new ChatService(
      new MemoryConversationStore(),
      provider,
      knowledge,
      config,
      false,
      () => new Date('2026-10-24T12:00:00Z'),
    );
    const result = await service.execute({
      message: 'Quanto tempo de experiência total e com Java Pedro possui?',
    });
    expect(result.meta.promptVersion).toBe('orbe-v4');
    const reference = (stub.requests[0]!.messages as { content: string }[])[1]!.content;
    const marker =
      'Cálculos dos períodos profissionais (dados derivados dos registros fornecidos):\n';
    expect(reference).toContain(marker);
    const facts = JSON.parse(reference.slice(reference.indexOf(marker) + marker.length));
    expect(facts.softwarePeriods.approximateMonths).toBe(19);
    expect(
      facts.technologyPeriods.find(
        (summary: { technology: string }) => summary.technology === 'java',
      ).approximateMonths,
    ).toBe(19);
    expect(
      facts.companyPeriods.find((summary: { id: string }) => summary.id === 'experiencia-greencity')
        .approximateMonths,
    ).toBe(92);
  });

  it('recusa ferramenta não autorizada antes de qualquer efeito externo', async () => {
    const stub = await llmServer(() =>
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'bad', type: 'function', function: { name: 'create_meeting', arguments: '{}' } },
          ],
        },
        'tool_calls',
      ),
    );
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
      }),
      await JsonKnowledgeRepository.load(),
      'Use apenas as fontes.',
      allowTestBudget,
    );
    await expect(
      provider.generate({
        message: 'Projetos PHASSCODE',
        history: [],
        documents: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_TOOL' });
    expect(stub.requests).toHaveLength(1);
  });
});

describe('PPKS v1.3: verificações pós-geração no adaptador real', () => {
  it('corrige falsos negativos antes de devolver resposta e fontes, sem nova chamada LLM', async () => {
    const original =
      'Na SIG Software/SIGAA houve Java. Não verifiquei MySQL, nem REST APIs comerciais. ' +
      'Tecnólogo em Gestão da TI concluído (ETEP/UNIBF). ' +
      'Pedro possui 19 meses de vínculo exclusivamente no desenvolvimento de software, entre junho de 2016 e fevereiro de 2017 na SIG Software.';
    const stub = await llmServer(() => completion({ role: 'assistant', content: original }));
    const knowledge = await JsonKnowledgeRepository.load();
    const ids = [
      'experiencia-sig',
      'experiencia-geowellex',
      'experiencia-acrux',
      'formacao-gestao-ti',
    ];
    const provider = new LangChainChatProvider(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'synthetic-only',
        LLM_MODEL: 'test',
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_MODE: 'chat-completions',
        CHAT_CONTEXT_CHARS: '32000',
      }),
      knowledge,
      await readFile('apps/orbe-node/prompts/v4.md', 'utf8'),
      allowTestBudget,
    );
    const result = await provider.generate({
      message: 'Vaga Java com MySQL e formação: quais experiências, projetos e períodos?',
      history: [],
      documents: ids.map((id) => knowledge.getDocument(id)!),
      signal: new AbortController().signal,
      asOf: new Date('2026-10-31T12:00:00Z'),
    });
    expect(stub.requests).toHaveLength(1);
    expect(result.answer).toContain('Geowellex');
    expect(result.answer).not.toContain('Não verifiquei MySQL');
    expect(result.answer).not.toContain('19 meses de vínculo');
    const sourceIds = result.sources.map((item) => item.id);
    expect(sourceIds).toContain('experiencia-sig');
    expect(sourceIds).toContain('experiencia-geowellex');
    expect(sourceIds).toContain('formacao-gestao-ti');
  });
});
