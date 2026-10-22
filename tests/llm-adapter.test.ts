import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';

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
