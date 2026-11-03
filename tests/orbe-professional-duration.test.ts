import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { summarizeExperiencePeriods } from '../apps/orbe-node/src/domain/experience.js';
import type {
  ChatProvider,
  KnowledgeDocument,
} from '../apps/orbe-node/src/domain/ports.js';
import {
  buildVerifiedExperienceDurationResponse,
  formatApproximateExperience,
} from '../apps/orbe-node/src/application/experience-response.js';
import {
  experienceContext,
  isExperienceDurationQuestion,
} from '../apps/orbe-node/src/application/experience-context.js';
import { chatResponseSchema } from '../packages/contracts/src/index.js';
import { testApp } from './helpers.js';

const asOf = new Date('2026-11-03T12:00:00.000Z');
const employmentIds = [
  'experiencia-acrux',
  'experiencia-sig',
  'experiencia-geowellex',
  'experiencia-greencity',
] as const;
const readEmployment = async () => {
  const knowledge = JSON.parse(await readFile('knowledge/portfolio.json', 'utf8')) as KnowledgeDocument[];
  return knowledge
    .filter((item) => employmentIds.includes(item.id as (typeof employmentIds)[number]))
    .sort((a, b) => (a.experiencePeriod?.start ?? '').localeCompare(b.experiencePeriod?.start ?? ''));
};

describe('F3.4 recruiter duration: complete, mixed-role professional software experience', () => {
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
  ])('uses all four documented software-involved employers for broad recruiting question: %s', async (question) => {
    expect(isExperienceDurationQuestion(question)).toBe(true);
    const answer = buildVerifiedExperienceDurationResponse(question, await readEmployment(), asOf);
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
  });

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
    const ctx = experienceContext(
      documents,
      'Quantos anos de experiência profissional?',
      asOf,
      [...employmentIds],
    );
    expect(ctx).toContain('"softwareInvolvedPeriods":{"approximateMonths":130');
    expect(ctx).toContain('"exclusivelySoftwarePeriods":{"approximateMonths":19');
    expect(ctx).toContain('Geowellex e Greencity');
    expect(ctx).toMatch(/não representa dedicação integral/i);
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
