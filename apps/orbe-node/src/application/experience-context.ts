import { summarizeExperiencePeriods } from '../domain/experience.js';
import type { KnowledgeDocument } from '../domain/ports.js';
import { normalize } from '../domain/security.js';
import { mentionedTechnologies } from '../knowledge-matching.js';

export function isExperienceDurationQuestion(query: string): boolean {
  const text = normalize(query);
  return (
    /\b(?:tempo|anos?|meses?|duracao|desde quando)\b/.test(text) &&
    /\b(?:experienc\w*|trajetoria|carreira|atuac\w*|empresa|greencity|sigaa|acrux|geowellex|software|programa\w*|desenvolv\w*|codific\w*)\b/.test(
      text,
    )
  );
}

/** Recomputed after context trimming, exclusively from records actually sent. */
export function experienceContext(
  documents: KnowledgeDocument[],
  query: string,
  asOf: Date,
  expectedIds: string[] = [],
): string {
  if (!isExperienceDurationQuestion(query)) return '';
  const periods = documents.filter((document) => document.experiencePeriod);
  if (!periods.length) return '';
  const complete =
    expectedIds.length > 0 && expectedIds.every((id) => periods.some((doc) => doc.id === id));
  const compact = (summary: ReturnType<typeof summarizeExperiencePeriods>) => ({
    approximateMonths: summary.approximateMonths,
    periods: summary.periodsUsed,
  });
  const software = summarizeExperiencePeriods(periods, { asOf, scope: 'software-development' });
  const softwareInvolved = summarizeExperiencePeriods(periods, {
    asOf,
    scope: 'software-involved',
  });
  const technologyPeriods = [...mentionedTechnologies(query)]
    .map((technology) => ({
      technology,
      ...compact(
        summarizeExperiencePeriods(periods, { asOf, scope: 'software-development', technology }),
      ),
    }))
    .filter((summary) => summary.periods.length > 0);
  const careers = /\b(?:total|trajetoria|carreira|profissional)\b/.test(normalize(query))
    ? compact(summarizeExperiencePeriods(periods, { asOf, scope: 'career' }))
    : undefined;
  return (
    '\nCálculos dos períodos profissionais (dados derivados dos registros fornecidos):\n' +
    JSON.stringify({
      referenceMonth: asOf.toISOString().slice(0, 7),
      precision: 'Estimativas por mês; sobreposições contadas uma vez e lacunas não somadas.',
      coverage: complete
        ? 'Todos os vínculos com período estruturado da base.'
        : 'Apenas os períodos fornecidos; não constitui total da trajetória.',
      ...(complete
        ? {
            softwareInvolvedPeriods: compact(softwareInvolved),
            exclusivelySoftwarePeriods: compact(software),
            // Retain the old scoped field for existing LLM adapters and
            // reports; it is explicitly NOT the complete programming career.
            softwarePeriods: compact(software),
            technologyPeriods,
            ...(careers ? { careerPeriods: careers } : {}),
          }
        : {}),
      companyPeriods: periods.map((document) => ({
        id: document.id,
        ...compact(
          summarizeExperiencePeriods(periods, { asOf, scope: 'company', companyId: document.id }),
        ),
        areas: document.experiencePeriod!.areas,
      })),
      interpretation:
        'Em perguntas gerais sobre anos de experiência com programação, considerar softwareInvolvedPeriods, que inclui vínculos com atividades profissionais de software em cargos híbridos, como Geowellex e Greencity. exclusivelySoftwarePeriods é apenas um subconjunto de ACRUX/SIGAA e NÃO deve ser apresentado como experiência total de desenvolvimento. Expressar duração como aproximação em anos e meses (não apenas 19 meses). Duração de vínculo misto NÃO representa dedicação integral ao código nem domínio contínuo de uma tecnologia. Não somar sobreposições ou lacunas, não deduzir senioridade. Limitar vínculo atual à confirmação registrada.',
    })
  );
}

/**
 * Do not assign the total of several employment periods to a single employer.
 * A scope-specific number can only be asserted if it matches the structured
 * company period. Unrelated totals are left alone, not recomputed by guesswork.
 */
export function reconcileExperienceAttribution(
  answer: string,
  documents: readonly KnowledgeDocument[],
  asOf: Date,
): string {
  const aliases: Record<string, RegExp> = {
    'experiencia-sig': /\b(?:SIG Software|SIGAA)\b/i,
    'experiencia-acrux': /\bACRUX\b/i,
    'experiencia-geowellex': /\bGeowellex\b/i,
    'experiencia-greencity': /\bGreencity\b/i,
  };
  const reconciled = answer.replace(
    /(\d{1,3})\s+meses?\s+de vínculo(?:\s+exclusivamente\s+no desenvolvimento de software)?/gi,
    (statement, amount: string, offset: number) => {
      const tail = answer.slice(offset + statement.length, offset + statement.length + 130);
      const matched = documents.filter(
        (document) => document.experiencePeriod && aliases[document.id]?.test(tail),
      );
      if (matched.length !== 1) return statement;
      const summary = summarizeExperiencePeriods([matched[0]!], {
        asOf,
        scope: 'company',
        companyId: matched[0]!.id,
      });
      // If the date is incomplete, preserve the response for human review.
      if (!summary.periodsUsed.length || Number(amount) === summary.approximateMonths)
        return statement;
      return 'vínculo de desenvolvimento de software';
    },
  );

  // Format a verifiable Java-employment subtotal as a readable approximate
  // duration even when the model independently mentions it in a question that
  // does not explicitly ask for a duration (e.g. "Pedro trabalhou com Java?").
  // Never apply this to an unsupported month number or another technology.
  if (!/\bJava\b/i.test(reconciled)) return reconciled;
  const java = summarizeExperiencePeriods([...documents], {
    asOf,
    scope: 'software-development',
    technology: 'Java',
  });
  const employerIds = new Set(java.periodsUsed.map(({ id }) => id));
  const months = java.approximateMonths;
  if (
    months < 12 ||
    !employerIds.has('experiencia-acrux') ||
    !employerIds.has('experiencia-sig')
  ) return reconciled;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const formatted = [
    `${years} ${years === 1 ? 'ano' : 'anos'}`,
    ...(rest ? [`${rest} ${rest === 1 ? 'mês' : 'meses'}`] : []),
  ].join(' e ');
  return reconciled.replace(/\b(\d{1,3})\s+meses?\b/gi, (text, count: string) =>
    Number(count) === months ? `aproximadamente ${formatted}` : text,
  );
}
