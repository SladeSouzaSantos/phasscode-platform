import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { convertMessagesToCompletionsMessageParams } from '@langchain/openai';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import type { LlmInvocationFactory } from '../apps/orbe-node/src/domain/llm-invocation.js';
import type { Message } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const promptPath = 'apps/orbe-node/prompts/v4.md';

describe('limites de contexto na entrevista do Orbe', () => {
  it('mantém instruções essenciais num prompt compacto', async () => {
    const prompt = await readFile(promptPath, 'utf8');
    expect(prompt.length).toBeLessThan(5000);
    for (const term of [
      'SIGAA',
      'ACRUX',
      'LangChain',
      'Playwright',
      'Neo4j',
      'Cypress',
      'PVsyst',
      'Greencity OS',
      'não',
    ]) {
      expect(prompt).toContain(term);
    }
  });

  it('responde a pergunta de QA após histórico extenso e chamada de ferramenta sem exceder o contexto', async () => {
    const prompt = await readFile(promptPath, 'utf8');
    const knowledge = await JsonKnowledgeRepository.load();
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CHAT_CONTEXT_CHARS: '12000',
    });
    const history: Message[] = Array.from({ length: 5 }, (_, index) => [
      {
        role: 'user' as const,
        content: `Entrevista técnica anterior ${index}: ${'experiência React Java DevOps '.repeat(18)}`,
      },
      {
        role: 'assistant' as const,
        content: `Evidência apresentada ${index}: ${'tecnologias verificáveis e lacunas reais '.repeat(20)}`,
      },
    ]).flat();

    const invocations: BaseMessage[][] = [];
    const factory: LlmInvocationFactory = () => async (transcript) => {
      invocations.push([...transcript]);
      if (invocations.length === 1) {
        return new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'recruiter-qa-search-1',
              name: 'search_portfolio',
              args: { query: 'PHASSCODE React Playwright axe-core testes acessibilidade' },
            },
          ],
        });
      }
      return new AIMessage(
        'O portfólio PHASSCODE usa React, TypeScript, Playwright e axe-core para testar acessibilidade WCAG.',
      );
    };
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      prompt,
      { reserve: async () => {} },
      undefined,
      factory,
    );
    const result = await provider.generate({
      message:
        'Sou recrutador QA. Quais testes Playwright e axe-core implementou no frontend PHASSCODE e o que não pode garantir?',
      history,
      documents: knowledge.search('Vaga React TypeScript QA Playwright acessibilidade WCAG'),
      signal: new AbortController().signal,
    });

    expect(result.answer).toContain('Playwright');
    expect(invocations).toHaveLength(2);
    expect(invocations[1]!.some((message) => message._getType() === 'tool')).toBe(true);
    for (const transcript of invocations) {
      const wireLength = JSON.stringify(
        convertMessagesToCompletionsMessageParams({
          messages: transcript,
          model: 'test-llm',
        }),
      ).length;
      expect(wireLength).toBeLessThanOrEqual(config.CHAT_CONTEXT_CHARS);
    }
  });

  it('não gasta chamadas nem ignora limites de mensagens que realmente não cabem', async () => {
    const prompt = await readFile(promptPath, 'utf8');
    const knowledge = await JsonKnowledgeRepository.load();
    const config = loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '4000' });
    let invoked = false;
    const factory: LlmInvocationFactory = () => async () => {
      invoked = true;
      return new AIMessage('Não deveria executar a geração.');
    };
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      prompt,
      { reserve: async () => {} },
      undefined,
      factory,
    );
    await expect(
      provider.generate({
        message: 'Quais projetos Java comprovados existem? ' + 'Java '.repeat(160),
        history: [],
        documents: knowledge.search('Java'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_CONTEXT_LIMIT', status: 502 });
    expect(invoked).toBe(false);
  });
});
