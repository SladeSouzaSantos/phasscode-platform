import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { summarizeExperiencePeriods } from '../apps/orbe-node/src/domain/experience.js';
import type { KnowledgeDocument } from '../apps/orbe-node/src/domain/ports.js';

const asOf = new Date('2026-10-24T12:00:00Z');
const document = (
  id: string,
  period: NonNullable<KnowledgeDocument['experiencePeriod']>,
  technologies: string[] = [],
): KnowledgeDocument => ({
  id,
  type: 'profile',
  title: id,
  content: 'Atuação profissional registrada.',
  keywords: [],
  technologies,
  experiencePeriod: period,
});
const software = (
  start: string,
  end: string,
): NonNullable<KnowledgeDocument['experiencePeriod']> => ({
  start,
  end,
  areas: ['software-development'],
});

describe('estimativas com precisão mensal a partir de períodos registrados', () => {
  it('calcula períodos conhecidos de Java, sem confundir JavaScript ou o vínculo misto atual', () => {
    const documents = [
      document('acrux', software('2014-02', '2015-01'), ['Java', 'H2']),
      document('sig', software('2016-06', '2017-02'), ['Java', 'Hibernate']),
      document(
        'geowellex',
        {
          start: '2017-03',
          end: '2018-10',
          areas: ['engineering', 'software-development'],
        },
        ['JavaScript', 'PHP'],
      ),
      document(
        'greencity',
        {
          start: '2019-02',
          currentAsOf: '2026-10-21',
          areas: ['engineering', 'software-development'],
        },
        ['Flutter', 'Java'],
      ),
    ];
    const java = summarizeExperiencePeriods(documents, {
      asOf,
      scope: 'software-development',
      technology: 'Java',
    });
    expect(java.approximateMonths).toBe(19);
    expect(java.periodsUsed.map((period) => period.id)).toEqual(['acrux', 'sig']);
    expect(java.excludedIds).toEqual(['geowellex', 'greencity']);
    const development = summarizeExperiencePeriods(documents, {
      asOf,
      scope: 'software-development',
    });
    expect(development.approximateMonths).toBe(19);
    expect(development.periodsUsed.map((period) => period.id)).toEqual(['acrux', 'sig']);
  });

  it('limita o total da base curada aos vínculos exclusivamente de software', async () => {
    const documents = JSON.parse(
      await readFile('knowledge/portfolio.json', 'utf8'),
    ) as KnowledgeDocument[];
    const summary = summarizeExperiencePeriods(documents, {
      asOf,
      scope: 'software-development',
    });
    expect(summary.approximateMonths).toBe(19);
    expect(summary.periodsUsed.map((period) => period.id).sort()).toEqual([
      'experiencia-acrux',
      'experiencia-sig',
    ]);
    expect(summary.excludedIds).toEqual(
      expect.arrayContaining(['experiencia-greencity', 'experiencia-geowellex']),
    );
  });

  it('faz a união de intervalos e não contabiliza lacunas ou sobreposições duas vezes', () => {
    const documents = [
      document('b', software('2020-06', '2021-02')),
      document('a', software('2020-01', '2020-12')),
      document('duplicate-window', software('2020-01', '2020-12')),
      document('c', software('2022-01', '2022-03')),
    ];
    expect(
      summarizeExperiencePeriods(documents, { asOf, scope: 'software-development' })
        .approximateMonths,
    ).toBe(15);
  });

  it('calcula tempo na empresa sem atribuir toda a atuação à tecnologia', () => {
    const documents = [
      document('old', software('2016-06', '2017-02')),
      document(
        'current',
        {
          start: '2019-02',
          currentAsOf: '2026-10-21',
          areas: ['engineering', 'software-development'],
        },
        ['Flutter'],
      ),
    ];
    const current = summarizeExperiencePeriods(documents, {
      asOf,
      scope: 'company',
      companyId: 'current',
    });
    expect(current.approximateMonths).toBe(92);
    expect(current.periodsUsed).toEqual([
      { id: 'current', start: '2019-02', end: '2026-10', confirmedCurrent: true },
    ]);
    expect(
      summarizeExperiencePeriods(documents, {
        asOf,
        scope: 'company',
        companyId: 'current',
        technology: 'Flutter',
      }).periodsUsed,
    ).toEqual([]);
  });

  it('não estende um vínculo além da confirmação registrada do proprietário', () => {
    const documents = [
      document('current', {
        start: '2020-01',
        currentAsOf: '2021-03-15',
        areas: ['software-development'],
      }),
    ];
    expect(summarizeExperiencePeriods(documents, { asOf, scope: 'career' }).approximateMonths).toBe(
      14,
    );
    expect(
      summarizeExperiencePeriods(documents, {
        asOf: new Date('2020-06-01T00:00:00Z'),
        scope: 'career',
      }).approximateMonths,
    ).toBe(5);
  });

  it('não inventa meses para registros com apenas anos, sem fim ou com datas inválidas', () => {
    const documents = [
      document('year-only', software('2014', '2015')),
      document('missing-end', { start: '2020-01', areas: ['software-development'] }),
      document('invalid-confirmation', {
        start: '2020-01',
        currentAsOf: '2021-02-30',
        areas: ['software-development'],
      }),
      document('inverted', software('2021-01', '2020-01')),
      document('future', software('2028-01', '2028-06')),
      document('ambiguous-end', {
        ...software('2020-01', '2021-01'),
        currentAsOf: '2021-01-15',
      }),
    ];
    const summary = summarizeExperiencePeriods(documents, { asOf, scope: 'career' });
    expect(summary.approximateMonths).toBe(0);
    expect(summary.periodsUsed).toEqual([]);
    expect(summary.excludedIds).toHaveLength(6);
    expect(summary.precision).toBe('month');
    expect(summary.asOf).toBe('2026-10');
  });

  it('não calcula duração de tecnologia usando apenas palavras no texto ou formação acadêmica', () => {
    const documents = [
      document('unverified-technology', software('2020-01', '2021-01')),
      {
        id: 'education',
        type: 'profile' as const,
        title: 'Curso de Java',
        content: 'Curso de Java em 2020.',
        keywords: ['Java'],
        technologies: ['Java'],
      },
    ];
    expect(
      summarizeExperiencePeriods(documents, {
        asOf,
        scope: 'software-development',
        technology: 'Java',
      }).periodsUsed,
    ).toEqual([]);
  });
});
