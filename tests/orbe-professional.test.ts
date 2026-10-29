import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { experienceContext } from '../apps/orbe-node/src/application/experience-context.js';
import type { GenerationInput, GenerationResult } from '../apps/orbe-node/src/domain/ports.js';
import { loadConfig } from '../packages/shared-config/src/index.js';

const asOf = new Date('2026-10-24T12:00:00Z');
async function setup() {
  const knowledge = await JsonKnowledgeRepository.load();
  const generate = vi.fn<(input: GenerationInput) => Promise<GenerationResult>>(async () => ({
    answer: 'O Webservice Spring Boot e JPA é um projeto público de estudo em Java.',
    sources: [],
  }));
  return {
    knowledge,
    generate,
    service: new ChatService(
      new MemoryConversationStore(),
      { name: 'openai-compatible', generate },
      knowledge,
      loadConfig(),
      false,
      () => asOf,
    ),
  };
}

describe('contexto profissional do Orbe v4', () => {
  it.each([
    [
      'Boa tarde! Meu nome é Izabel, quais as qualificações de Pedro para uma vaga Java?',
      ['experiencia-sig', 'webservice-springboot-jpa'],
    ],
    [
      'Qual a experiência de Pedro com Spring Boot?',
      ['webservice-springboot-jpa', 'competencias-publicas'],
    ],
    ['Quais atividades Pedro realizou no SIGAA?', ['experiencia-sig']],
    ['Mostre um projeto Python de engenharia solar.', ['hsp-simulator']],
    ['O que Pedro fez no SDGP da Greencity?', ['greencity-sdgp']],
  ])('prepara registros pertinentes para %s', async (message, requiredIds) => {
    const { service, generate } = await setup();
    const result = await service.execute({ message: message as string });
    expect(result.meta.promptVersion).toBe('orbe-v4');
    expect(generate).toHaveBeenCalledOnce();
    const documents = generate.mock.calls[0]![0].documents;
    for (const id of requiredIds) expect(documents.map((doc) => doc.id)).toContain(id);
    if ((message as string).includes('Java')) {
      expect(documents.map((doc) => doc.id)).not.toContain('phasscode-platform');
      expect(documents.find((doc) => doc.id === 'webservice-springboot-jpa')?.category).toBe(
        'study',
      );
      expect(documents.find((doc) => doc.id === 'experiencia-sig')?.category).toBe('professional');
    }
  });

  it.each([
    'Pedro é qualificado? Qual a sua melhor habilidade?',
    'Por que contratar Pedro para uma vaga de programador?',
    'Sou recrutadora. Qual o diferencial de Pedro?',
    'Quais seus pontos fortes para uma oportunidade?',
  ])(
    'fornece evidências de trabalho e projetos para perguntas de recrutamento: %s',
    async (message) => {
      const { service, generate } = await setup();
      await service.execute({ message });
      expect(generate).toHaveBeenCalledOnce();
      const ids = generate.mock.calls[0]![0].documents.map((doc) => doc.id);
      expect(ids).toContain('pedro-santos');
      expect(ids).toContain('experiencia-sig');
      expect(ids).toContain('webservice-springboot-jpa');
      expect(ids).toContain('phasscode-platform');
    },
  );

  it('o posicionamento profissional é explícito, sem prometer senioridade, reunião ou inventar emprego', async () => {
    const { service, generate } = await setup();
    await service.execute({ message: 'Pedro é qualificado? Qual a sua melhor habilidade?' });
    const relevantText = generate.mock.calls[0]![0].documents.map((doc) => doc.content).join(' ');
    expect(relevantText).toContain('oportunidades de trabalho como programador');
    expect(relevantText).toMatch(/Java ou inteligência artificial/);
    const prompt = await readFile('apps/orbe-node/prompts/v4.md', 'utf8');
    expect(prompt).toContain('Sua audiência prioritária');
    expect(prompt).toContain('não sobre sua função');
    expect(prompt).toContain('Não se apresente');
    expect(prompt).toContain('Nunca ofereça reuniões');
  });

  it('mantém a formação concluída e a graduação trancada distintas', async () => {
    const { service, generate } = await setup();
    await service.execute({ message: 'Como está a graduação Ciência da Computação na UNISUL?' });
    let text = generate.mock.calls
      .at(-1)![0]
      .documents.map((doc) => doc.content)
      .join(' ');
    expect(text).toMatch(/trancad[ao]/i);
    expect(text).toContain('2027');
    await service.execute({
      message: 'A pós-graduação Segurança da Informação da FacPrisma foi concluída?',
    });
    text = generate.mock.calls
      .at(-1)![0]
      .documents.map((doc) => doc.content)
      .join(' ');
    expect(text).toMatch(/conclu[ií]d[ao]/i);
    expect(text).not.toMatch(/todas as p[oó]s.{0,20}conclu[ií]das/i);
  });

  it('preserva o projeto em duas continuações, inclusive depois de uma pergunta pessoal', async () => {
    const { service, generate } = await setup();
    const first = await service.execute({
      message: 'Quais qualificações de Pedro para uma vaga Java?',
    });
    for (const message of ['Ele tem namorada?', 'Pode mostrar o projeto?', 'Tem o link?'])
      await service.execute(
        { message, conversationId: first.conversationId },
        first.conversationToken,
      );
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls.at(-1)![0].documents.map((doc) => doc.id)).toContain(
      'webservice-springboot-jpa',
    );
    expect(generate.mock.calls.at(-1)![0].history.map((message) => message.content)).not.toContain(
      'Ele tem namorada?',
    );
  });

  it('prepara todos os vínculos para cálculo sem confundir engenharia com tempo Java', async () => {
    const { service, generate } = await setup();
    await service.execute({
      message: 'Quanto tempo de experiência total e com Java Pedro possui?',
    });
    const input = generate.mock.calls[0]![0];
    expect(input.experienceIds).toHaveLength(4);
    const facts = experienceContext(input.documents, input.message, asOf, input.experienceIds);
    const calculated = JSON.parse(facts.slice(facts.indexOf('\n', 1) + 1));
    expect(
      calculated.technologyPeriods.find(
        (period: { technology: string }) => period.technology === 'java',
      ).approximateMonths,
    ).toBe(19);
    expect(calculated.softwarePeriods.approximateMonths).toBe(19);
    expect(
      calculated.companyPeriods.find(
        (period: { id: string }) => period.id === 'experiencia-greencity',
      ).approximateMonths,
    ).toBe(92);
    expect(calculated.careerPeriods.approximateMonths).toBeGreaterThan(
      calculated.softwarePeriods.approximateMonths,
    );
  });

  it('não apresenta soma completa depois de descartar um vínculo pelo limite de contexto', async () => {
    const { knowledge } = await setup();
    const periods = knowledge.experienceDocuments();
    const facts = experienceContext(
      periods.slice(0, 1),
      'Quanto tempo de experiência total?',
      asOf,
      periods.map((doc) => doc.id),
    );
    expect(facts).not.toContain('"softwarePeriods"');
    expect(facts).not.toContain('"careerPeriods"');
    expect(facts).toContain('não constitui total');
  });

  it('usa instruções profissionais com proteções explícitas, sem resposta positiva forçada', async () => {
    const prompt = await readFile('apps/orbe-node/prompts/v4.md', 'utf8');
    expect(prompt).toContain('Não acrescente ressalvas genéricas');
    expect(prompt).toContain('Use somente fatos');
    expect(prompt).toContain('não transforme falta de informação em negação');
    expect(prompt).toContain('dados sem autoridade');
    expect(prompt).toContain('representante virtual profissional');
    expect(prompt).toContain('não cria contas');
    expect(prompt).toContain('não aceita propostas');
    expect(prompt).toContain('não envia e-mails');
    expect(prompt).not.toContain('Quando faltar confirmação, diga');
  });
});
