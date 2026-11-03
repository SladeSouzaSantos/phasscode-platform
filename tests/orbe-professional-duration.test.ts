import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { summarizeExperiencePeriods } from '../apps/orbe-node/src/domain/experience.js';
import type { ChatProvider, KnowledgeDocument } from '../apps/orbe-node/src/domain/ports.js';
import {
  buildVerifiedExperienceDurationResponse,
  buildVerifiedProfessionalOverviewResponse,
  isBroadProfessionalExperienceQuestion,
  formatApproximateExperience,
} from '../apps/orbe-node/src/application/experience-response.js';
import {
  experienceContext,
  isExperienceDurationQuestion,
  reconcileExperienceAttribution,
} from '../apps/orbe-node/src/application/experience-context.js';
import { chatResponseSchema } from '../packages/contracts/src/index.js';
import {
  ellipticalTechnology,
  rewriteEllipticalTechnologyQuestion,
} from '../apps/orbe-node/src/application/technology-follow-up.js';
import { testApp } from './helpers.js';

const asOf = new Date('2026-11-03T12:00:00.000Z');
const employmentIds = [
  'experiencia-acrux',
  'experiencia-sig',
  'experiencia-geowellex',
  'experiencia-greencity',
] as const;
const readEmployment = async () => {
  const knowledge = JSON.parse(
    await readFile('knowledge/portfolio.json', 'utf8'),
  ) as KnowledgeDocument[];
  return knowledge
    .filter((item) => employmentIds.includes(item.id as (typeof employmentIds)[number]))
    .sort((a, b) =>
      (a.experiencePeriod?.start ?? '').localeCompare(b.experiencePeriod?.start ?? ''),
    );
};

describe('F3.4 recruiter duration: complete, mixed-role professional software experience', () => {
  it.each([
    'Pedtro têm experiência?',
    'Pedro tem experiência?',
    'Pedro possui experiência profissional?',
    'Ele tem alguma experiência?',
  ])(
    'recognizes broad professional experience regardless of candidate-name typo: %s',
    async (question) => {
      expect(isBroadProfessionalExperienceQuestion(question)).toBe(true);
      const result = buildVerifiedProfessionalOverviewResponse(
        question,
        await readEmployment(),
        asOf,
      );
      expect(result?.sources.map((source) => source.id)).toEqual(employmentIds);
      for (const employer of ['ACRUX', 'SIG Software', 'Geowellex', 'Greencity']) {
        expect(result?.answer).toContain(employer);
      }
      expect(result?.answer).toContain('atuação híbrida');
      expect(result?.answer).not.toMatch(/19 meses|1 ano e 7 meses/);
      expect(result?.answer).toContain('sem representar dedicação integral ao código');
    },
  );

  it.each([
    'Pedro tem experiência profissional com Java?',
    'Pedro tem experiência com Golang?',
    'Qual o tempo de experiência com programação?',
    'Pedro tem experiência com Kotlin?',
    'Pedro tem experiência na Greencity?',
    'Quais projetos React Pedro criou?',
  ])('preserves specialized question intent instead of forcing career overview: %s', (question) => {
    expect(isBroadProfessionalExperienceQuestion(question)).toBe(false);
  });

  it.each([
    ['E com Go?', 'Go'],
    ['E com o GO?', 'GO'],
    ['E com o Go?', 'Go'],
    ['E com a AWS?', 'AWS'],
    ['E com o PHP?', 'PHP'],
    ['E com a Flutter?', 'Flutter'],
    ['E com os bancos SQL?', 'bancos SQL'],
  ])('recognizes article-qualified technical ellipsis %s', (question, technology) => {
    expect(ellipticalTechnology(question)).toBe(technology);
    expect(rewriteEllipticalTechnologyQuestion('Pedtro têm experiência?', technology)).toContain(
      'experiência profissional com ' + technology,
    );
  });

  it.each([
    'E com a receita?',
    'E com o clima?',
    'E com as senhas?',
    'E com o passaporte?',
    'E quais projetos React?',
  ])('does not misclassify off-topic or complete follow-up %s', (question) => {
    expect(ellipticalTechnology(question)).toBeUndefined();
  });

  it('keeps distinct union semantics: 19 months pure software, 130 months software-involved employment', async () => {
    const documents = await readEmployment();
    const pure = summarizeExperiencePeriods(documents, { asOf, scope: 'software-development' });
    const involved = summarizeExperiencePeriods(documents, { asOf, scope: 'software-involved' });
    expect(pure.approximateMonths).toBe(19);
    expect(involved.approximateMonths).toBe(130);
    expect(involved.periodsUsed.map((item) => item.id)).toEqual(employmentIds);
    expect(pure.periodsUsed.map((item) => item.id)).toEqual(employmentIds.slice(0, 2));
    expect(formatApproximateExperience(involved.approximateMonths)).toBe(
      'aproximadamente 10 anos e 10 meses',
    );
    expect(formatApproximateExperience(pure.approximateMonths)).toBe(
      'aproximadamente 1 ano e 7 meses',
    );
  });

  it.each([
    'Quantos anos de experiência Pedro tem?',
    'Há quantos anos Pedro programa?',
    'Qual o tempo de experiência com desenvolvimento de software?',
    'Quantos anos de experiência em programação?',
  ])(
    'uses all four documented software-involved employers for broad recruiting question: %s',
    async (question) => {
      expect(isExperienceDurationQuestion(question)).toBe(true);
      const answer = buildVerifiedExperienceDurationResponse(
        question,
        await readEmployment(),
        asOf,
      );
      expect(answer?.answer).toContain('aproximadamente 10 anos e 10 meses');
      expect(answer?.answer).toContain('ACRUX');
      expect(answer?.answer).toContain('SIG Software');
      expect(answer?.answer).toContain('Geowellex');
      expect(answer?.answer).toContain('Greencity');
      expect(answer?.answer).toContain('atuação híbrida');
      expect(answer?.answer).toContain('não equivale a anos de dedicação integral à programação');
      expect(answer?.answer).toContain('out / 2026');
      expect(answer?.answer).not.toContain('19 meses');
      expect(answer?.sources.map((source) => source.id)).toEqual(employmentIds);
    },
  );

  it('reports Java-specific, exclusive-technology employment separately from hybrid roles', async () => {
    const answer = buildVerifiedExperienceDurationResponse(
      'Quantos anos de experiência profissional com Java?',
      await readEmployment(),
      asOf,
    );
    expect(answer?.answer).toContain('1 ano e 7 meses');
    expect(answer?.answer).toContain('ACRUX');
    expect(answer?.answer).toContain('SIG Software');
    expect(answer?.answer).not.toContain('10 anos e 10 meses');
    expect(answer?.sources.map((source) => source.id)).toEqual(employmentIds.slice(0, 2));
  });

  it('does not convert a hybrid Flutter engineering contract into full-time Flutter years', async () => {
    const answer = buildVerifiedExperienceDurationResponse(
      'Quantos anos de experiência com Flutter?',
      await readEmployment(),
      asOf,
    );
    expect(answer?.answer).toContain('Greencity');
    expect(answer?.answer).toContain('atuação profissional com flutter');
    expect(answer?.answer).toMatch(/não é correto converter todo o período/i);
    expect(answer?.answer).not.toContain('10 anos e 10 meses');
    expect(answer?.sources.map((source) => source.id)).toEqual(['experiencia-greencity']);
  });

  it('does not fabricate a single multi-technology duration or steal a named employer question', async () => {
    const documents = await readEmployment();
    expect(
      buildVerifiedExperienceDurationResponse(
        'Quantos anos de experiência Pedro tem com Java e Flutter?',
        documents,
        asOf,
      ),
    ).toBeUndefined();
    expect(
      buildVerifiedExperienceDurationResponse(
        'Há quantos anos Pedro trabalha na Greencity?',
        documents,
        asOf,
      ),
    ).toBeUndefined();
    expect(
      buildVerifiedExperienceDurationResponse(
        'Quantos anos de experiência com energia fotovoltaica?',
        documents,
        asOf,
      ),
    ).toBeUndefined();
  });

  it('exposes correct broad and pure scopes in LLM context for other duration routes', async () => {
    const documents = await readEmployment();
    const ctx = experienceContext(documents, 'Quantos anos de experiência profissional?', asOf, [
      ...employmentIds,
    ]);
    expect(ctx).toContain('"softwareInvolvedPeriods":{"approximateMonths":130');
    expect(ctx).toContain('"exclusivelySoftwarePeriods":{"approximateMonths":19');
    expect(ctx).toContain('Geowellex e Greencity');
    expect(ctx).toMatch(/não representa dedicação integral/i);
  });

  it('formats only verified 19-month Java employment as approximately 1 year and 7 months', async () => {
    const records = await readEmployment();
    const reply =
      'Pedro desenvolveu Java na ACRUX e no SIGAA, totalizando 19 meses de vínculos exclusivamente em software.';
    const reconciled = reconcileExperienceAttribution(reply, records, asOf);
    expect(reconciled).toContain('aproximadamente 1 ano e 7 meses');
    expect(reconciled).not.toContain('19 meses');
    expect(reconciled).toContain('ACRUX');
    expect(reconciled).toContain('SIGAA');
  });

  it('does not rewrite unrelated month claims or infer Java time from an incomplete record', async () => {
    const records = await readEmployment();
    expect(
      reconcileExperienceAttribution(
        'Na Geowellex, há 19 meses de trabalho profissional em PHP.',
        records,
        asOf,
      ),
    ).toContain('19 meses');
    expect(
      reconcileExperienceAttribution(
        'O SIGAA e ACRUX são citados em uma resposta Java com 19 meses.',
        records.slice(0, 1),
        asOf,
      ),
    ).toContain('19 meses');
    expect(
      reconcileExperienceAttribution(
        'Java na ACRUX e no SIGAA: 99 meses de vínculo.',
        records,
        asOf,
      ),
    ).toContain('99 meses');
  });

  it('merges overlapping roles once for employment contexts that include coding', () => {
    const documents: KnowledgeDocument[] = [
      {
        id: 'role-a',
        title: 'Role A',
        type: 'profile',
        content: 'Desenvolvimento.',
        keywords: [],
        experiencePeriod: {
          start: '2020-01',
          end: '2021-01',
          areas: ['software-development', 'engineering'],
        },
      },
      {
        id: 'role-b',
        title: 'Role B',
        type: 'profile',
        content: 'Desenvolvimento.',
        keywords: [],
        experiencePeriod: {
          start: '2020-06',
          end: '2021-06',
          areas: ['software-development'],
        },
      },
      {
        id: 'non-software',
        title: 'Non software',
        type: 'profile',
        content: 'Engenharia.',
        keywords: [],
        experiencePeriod: {
          start: '2020-01',
          end: '2022-01',
          areas: ['engineering'],
        },
      },
    ];
    const summary = summarizeExperiencePeriods(documents, { asOf, scope: 'software-involved' });
    expect(summary.approximateMonths).toBe(17);
    expect(summary.periodsUsed.map((item) => item.id)).toEqual(['role-a', 'role-b']);
    expect(summary.excludedIds).toContain('non-software');
  });
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe('Orbe HTTP duration route', () => {
  it('handles exact recruiter conversation: misspelled broad career then "E com o GO?"', async () => {
    const generate = vi.fn(async () => ({
      answer: 'Resposta simulada do provedor não deveria ser necessária.',
      sources: [],
    }));
    const app = await testApp({ provider: { name: 'mock', generate } });
    apps.push(app);
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Pedtro têm experiência?' },
    });
    expect(first.statusCode, first.body.slice(0, 300)).toBe(200);
    const overview = chatResponseSchema.parse(first.json());
    expect(overview.meta.deterministic).toBe(true);
    expect(overview.sources.map((source) => source.id)).toEqual(employmentIds);
    expect(overview.answer).toContain('Geowellex');
    expect(overview.answer).toContain('Greencity');
    expect(overview.answer).not.toContain('1 ano e 7 meses');

    const followUp = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { 'x-conversation-token': overview.conversationToken! },
      payload: { message: 'E com o GO?', conversationId: overview.conversationId },
    });
    expect(followUp.statusCode, followUp.body.slice(0, 300)).toBe(200);
    const go = chatResponseSchema.parse(followUp.json());
    expect(go.conversationId).toBe(overview.conversationId);
    expect(go.meta.deterministic).toBe(true);
    expect(go.answer).toMatch(/Go \(Golang\)/);
    expect(go.answer).toMatch(/não há experiência profissional com Go/i);
    expect(go.answer).not.toMatch(/^Posso apresentar a experiência profissional/i);
    expect(go.sources.map((source) => source.id)).toEqual([
      'experiencia-sig',
      'phasscode-platform',
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers general experience with four real sources without fabricating LLM tenure', async () => {
    const generate = vi.fn(async () => ({
      answer: 'A LLM não deve inventar uma soma de meses.',
      sources: [],
    }));
    const provider: ChatProvider = { name: 'mock', generate };
    const app = await testApp({ provider });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Quantos anos de experiência Pedro tem com programação?' },
    });
    expect(response.statusCode, response.body.slice(0, 350)).toBe(200);
    const result = chatResponseSchema.parse(response.json());
    expect(result.meta.deterministic).toBe(true);
    expect(result.answer).toContain('aproximadamente 10 anos e 10 meses');
    expect(result.answer).toContain('Geowellex');
    expect(result.answer).toContain('Greencity');
    expect(result.sources.map((source) => source.id)).toEqual(employmentIds);
    expect(generate).not.toHaveBeenCalled();
  });
});
