import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { professionalResponsePolicy } from '../apps/orbe-node/src/application/professional-response-policy.js';
import { reconcileDocumentedClaims } from '../apps/orbe-node/src/application/sources.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import type { LlmInvocationFactory } from '../apps/orbe-node/src/domain/llm-invocation.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

describe('Apresentação profissional positiva e honesta', () => {
  it('privilegia experiência Java comprovada sem solicitar uma lista de ausências', () => {
    const policy = professionalResponsePolicy('Pedro têm experiência com Java?');
    expect(policy).toContain('RESPOSTA DIRETA');
    expect(policy).toContain('Se comprovado, afirme');
    expect(policy).toContain('não acrescente uma lista de outras lacunas');
  });

  it('responde a níveis perguntados com transparência, sem inventar inglês avançado', () => {
    const policy = professionalResponsePolicy('Pedro é fluente em inglês? Tem inglês avançado?');
    expect(policy).toContain('nível PERGUNTADO');
    expect(policy).toContain('não corresponde ao registro');
    expect(policy).toContain('sem presumir desconhecimento absoluto');
  });

  it('distingue falta de evidência de Go de falta absoluta de capacidade', () => {
    const policy = professionalResponsePolicy('Pedro tem experiência com Go?');
    expect(policy).toContain('não está documentada');
    expect(policy).toContain('habilidades transferíveis');
    expect(policy).toContain('sem tratá-las como experiência direta');
  });

  it('não esconde incompatibilidades obrigatórias numa comparação de vaga', () => {
    const policy = professionalResponsePolicy(
      'Avalie a aderência de Pedro para uma vaga Go sênior.',
    );
    expect(policy).toContain('APRESENTAÇÃO PARA VAGA');
    expect(policy).toContain('lacunas RELEVANTES');
    expect(policy).toContain('não substitui experiência direta');
  });

  it('mantém restrições factuais internas e prioriza a pergunta nas respostas livres', async () => {
    const prompt = await readFile('apps/orbe-node/prompts/v4.md', 'utf8');
    expect(prompt.length).toBeLessThan(5000);
    expect(prompt).toContain('guardrails');
    expect(prompt).toContain('Não recite listas');
    expect(prompt).toContain('Hibernate é EMPREGO no SIGAA');
    expect(prompt).toContain('JPA é ESTUDO');
    const policy = professionalResponsePolicy('Conte os pontos fortes e projetos de Pedro.');
    expect(policy).toContain('APRESENTAÇÃO PROFISSIONAL');
    expect(policy).toContain('Evite ressalvas');
  });

  it('envia a política contextual como instrução de sistema sem depender de modelo pago', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const prompt = await readFile('apps/orbe-node/prompts/v4.md', 'utf8');
    const config = loadConfig({ NODE_ENV: 'test', CHAT_CONTEXT_CHARS: '12000' });
    const observed: string[] = [];
    const factory: LlmInvocationFactory = () => async (messages: BaseMessage[]) => {
      observed.push(String(messages[0]?.content ?? ''));
      return new AIMessage('Sim, Java está documentado na atuação profissional SIGAA.');
    };
    const provider = new LangChainChatProvider(
      config,
      knowledge,
      prompt,
      { reserve: async () => {} },
      undefined,
      factory,
    );
    const documents = knowledge.search('Pedro tem experiência com Java?');
    const result = await provider.generate({
      message: 'Pedro tem experiência com Java?',
      history: [],
      documents,
      signal: new AbortController().signal,
    });
    expect(result.answer).toContain('Java');
    expect(observed).toHaveLength(1);
    expect(observed[0]).toContain('RESPOSTA DIRETA');
    expect(observed[0]).toContain('Proveniência profissional:');
  });

  it('corrige somente a negativa agrupada JPA/Hibernate, preservando Hibernate profissional', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    const documents = [
      knowledge.getDocument('experiencia-sig')!,
      knowledge.getDocument('webservice-springboot-jpa')!,
    ];
    const answer =
      'Java e Hibernate constam no SIGAA. Não comprovei experiência profissional remunerada em Spring Boot, Quarkus nem JPA/Hibernate como emprego.';
    const corrected = reconcileDocumentedClaims(answer, documents);
    expect(corrected).toContain('Java e Hibernate constam no SIGAA');
    expect(corrected).toContain('nem JPA como emprego');
    expect(corrected).not.toContain('nem JPA/Hibernate como emprego');
    const affirmative = 'O Java e Hibernate constam como experiência profissional no SIGAA.';
    expect(reconcileDocumentedClaims(affirmative, documents)).toContain('Hibernate');
  });
});
