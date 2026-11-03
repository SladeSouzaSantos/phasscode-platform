import type { GenerationResult, KnowledgeDocument } from '../domain/ports.js';
import { summarizeExperiencePeriods } from '../domain/experience.js';
import { normalize } from '../domain/security.js';
import { knowledgePhrase, mentionedTechnologies } from '../knowledge-matching.js';
import { isExperienceDurationQuestion } from './experience-context.js';
import { documentSource } from './sources.js';

const calendarMonths = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  return `${calendarMonths[Number(month) - 1] ?? '?'} / ${year}`;
}

/**
 * Public duration is always an estimate from month-granularity employment
 * intervals, never verified full-time coding hours or years of seniority.
 */
export function formatApproximateExperience(months: number): string {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const parts = [
    ...(years > 0 ? [`${years} ${years === 1 ? 'ano' : 'anos'}`] : []),
    ...(remainder > 0 ? [`${remainder} ${remainder === 1 ? 'mês' : 'meses'}`] : []),
  ];
  return `aproximadamente ${parts.join(' e ') || 'menos de um mês'}`;
}

function employerName(document: KnowledgeDocument): string {
  return document.title
    .replace(/^Experi[eê]ncia profissional\s*[—–-]\s*/iu, '')
    .replace(/^est[aá]gio\s+/iu, '');
}

function describeEmployment(
  document: KnowledgeDocument,
  used: { start: string; end: string; confirmedCurrent: boolean },
): string {
  const period = used.confirmedCurrent
    ? `desde ${monthLabel(used.start)}, atuação confirmada em ${monthLabel(used.end)}`
    : `${monthLabel(used.start)} a ${monthLabel(used.end)}`;
  const role = document.experiencePeriod?.areas.includes('engineering')
    ? 'atuação híbrida, incluindo desenvolvimento de software'
    : 'função de desenvolvimento de software';
  const technologies = document.technologies?.slice(0, 5).join(', ') ?? '';
  return `${employerName(document)} (${period}; ${role}${technologies ? `; ${technologies}` : ''})`;
}

/**
 * An unrestricted question about the candidate's professional experience is
 * NOT the same as a question about "exclusive software" tenure. Do not let a
 * short model-generated overview implicitly downgrade mixed-role programming
 * (Geowellex and Greencity) to "not development".
 *
 * This is a category-level intent, not a spelling correction: "Pedtro têm
 * experiência?" and "Pedro tem experiência?" behave the same. Technology,
 * employer, vacancy and duration-specific questions keep their own routes.
 */
export function isBroadProfessionalExperienceQuestion(query: string): boolean {
  const phrase = knowledgePhrase(query);
  if (!phrase || phrase.length > 170) return false;
  if (mentionedTechnologies(query).size || /\b(?:go|golang|vaga|requisitos?|projetos?|cursos?|formacao|graduacao|entrevista|geowellex|greencity|acrux|sigaa)\b/.test(phrase)) {
    return false;
  }
  if (/\b(?:quantos?|anos?|meses?|tempo|duracao|desde quando)\b/.test(phrase)) return false;

  // Also supports misspelled candidate names without adding a growing list of
  // typo-specific aliases. The subject must be short and the question bare.
  const bare = /^(.*?)\b(?:tem|possui)\s+(?:alguma\s+)?experiencia(?: profissional)?$/.exec(phrase);
  if (bare) {
    const subject = bare[1]!.trim();
    return subject.split(/\s+/).filter(Boolean).length <= 4 &&
      !/\b(?:empresa|companhia|produto|projeto|tecnologia)\b/.test(subject);
  }
  return /^(?:quais? (?:sao )?(?:as )?experiencias? profissionais? (?:de|do) |qual (?:e )?a (?:experiencia|trajetoria|carreira) profissional (?:de|do) |(?:fale|conte|resuma|apresente) (?:sobre )?(?:a |as )?(?:experiencia|trajetoria|carreira) profissional (?:de|do) )pedro(?: santos)?$/.test(phrase);
}

/**
 * Verified overview for open-ended recruiter questions, without an
 * unsolicited exclusive-software subtotal masquerading as the full career.
 * All dates and technology-to-employer attribution come from public PPKS
 * employment records. Mixed roles count as professional software work, but
 * not as full-time coding hours.
 */
export function buildVerifiedProfessionalOverviewResponse(
  query: string,
  documents: readonly KnowledgeDocument[],
  asOf: Date,
): GenerationResult | undefined {
  if (!isBroadProfessionalExperienceQuestion(query)) return undefined;
  const available = documents.filter((document) =>
    document.experiencePeriod?.areas.includes('software-development'),
  );
  const summary = summarizeExperiencePeriods(available, { asOf, scope: 'software-involved' });
  const included = summary.periodsUsed.flatMap((period) => {
    const document = available.find((value) => value.id === period.id);
    return document ? [{ document, period }] : [];
  });
  if (!included.length) return undefined;
  const mixed = included.filter(({ document }) =>
    document.experiencePeriod?.areas.includes('engineering'),
  );
  const answer = [
    'Sim. Pedro possui experiência profissional documentada em desenvolvimento de software, com registros a partir de ' +
      included[0]!.period.start.slice(0, 4) + ':',
    ...included.map(({ document, period }) => '- ' + describeEmployment(document, period)),
    mixed.length
      ? 'As experiências em ' + mixed.map(({ document }) => employerName(document)).join(' e ') +
        ' incluem programação em paralelo a outras responsabilidades técnicas. Elas fazem parte da experiência profissional de desenvolvimento, sem representar dedicação integral ao código.'
      : 'Esses vínculos documentam atuação profissional com software.',
    'A experiência com cada linguagem deve ser avaliada pelas atividades e fontes do respectivo vínculo.',
  ].join('\n');
  return { answer, sources: included.map(({ document }) => documentSource(document)).slice(0, 10) };
}

/**
 * A broad recruiter duration question must not silently discard development
 * carried out in mixed roles. The returned figure measures documented
 * employment intervals containing software work, not full-time programming
 * hours. Technology-specific durations remain strictly evidence-scoped.
 *
 * This route does not invent new experiences, employer dates or technology
 * attribution: all content is derived from the structured curated records.
 */
export function buildVerifiedExperienceDurationResponse(
  query: string,
  documents: readonly KnowledgeDocument[],
  asOf: Date,
): GenerationResult | undefined {
  if (!isExperienceDurationQuestion(query)) return undefined;
  const normalized = normalize(query);
  // A role-specific engineering question has different semantics; allow the
  // ordinary evidence-backed provider to interpret it.
  if (
    /\b(?:engenharia|fotovoltaic[ao]|mud logging)\b/.test(normalized) &&
    !/\b(?:software|programa\w*|desenvolv\w*|codig\w*)\b/.test(normalized)
  ) {
    return undefined;
  }
  // Questions about one named employer are not an invitation to present a
  // global career total. The normal answerer already has company-level dates.
  if (
    /\b(?:geowellex|greencity|sigaa|sig software|acrux)\b/.test(normalized) &&
    !/\b(?:todas|quatro|empresas|carreira|trajetoria)\b/.test(normalized)
  ) {
    return undefined;
  }
  const all = documents
    .filter((document) => document.experiencePeriod?.areas.includes('software-development'))
    .sort((a, b) =>
      (a.experiencePeriod?.start ?? '').localeCompare(b.experiencePeriod?.start ?? ''),
    );
  if (!all.length) return undefined;

  const technologyNames = [...mentionedTechnologies(query)];
  // Multiple independent requirements need a matrix, not a single combined
  // duration that could misleadingly imply years with every technology.
  if (technologyNames.length > 1) return undefined;
  // "Total de carreira e com Java" asks for two different quantities. Do
  // not collapse these into a Java-only number; let the provider receive both
  // the complete mixed-role employment scope and the Java-specific subset.
  if (technologyNames.length > 0 && /\b(?:total|carreira|trajetoria)\b/.test(normalized))
    return undefined;
  if (technologyNames.length === 1) {
    const technology = technologyNames[0]!;
    const matching = all.filter((doc) =>
      mentionedTechnologies(doc.technologies?.join(', ') ?? '').has(technology),
    );
    if (!matching.length) return undefined;
    const exclusive = summarizeExperiencePeriods(matching, {
      asOf,
      scope: 'software-development',
    });
    const includedIds = new Set(exclusive.periodsUsed.map((entry) => entry.id));
    const mixed = matching.filter((doc) => doc.experiencePeriod?.areas.includes('engineering'));
    if (!exclusive.periodsUsed.length && !mixed.length) return undefined;
    const pureText = exclusive.periodsUsed.length
      ? `Nos vínculos exclusivamente de software com ${technology}, os registros permitem estimar ${formatApproximateExperience(exclusive.approximateMonths)} de intervalos profissionais (${exclusive.periodsUsed
          .map((period) => {
            const document = matching.find((doc) => doc.id === period.id)!;
            return employerName(document);
          })
          .join(' e ')}).`
      : `Os registros não permitem quantificar um período exclusivamente dedicado a ${technology}.`;
    const mixedText = mixed.length
      ? ` Também há atuação profissional com ${technology} em funções híbridas: ${mixed.map((doc) => employerName(doc)).join(' e ')}. Não é correto converter todo o período desses vínculos em anos de dedicação exclusiva à tecnologia.`
      : '';
    const cited = matching.filter(
      (doc) => includedIds.has(doc.id) || mixed.some((other) => other.id === doc.id),
    );
    return {
      answer: `${pureText}${mixedText} As durações são aproximações por mês de vínculo, não medidas de horas de programação.`,
      sources: cited.map(documentSource).slice(0, 10),
    };
  }

  const involved = summarizeExperiencePeriods(all, {
    asOf,
    scope: 'software-involved',
  });
  if (!involved.periodsUsed.length) return undefined;
  const included = involved.periodsUsed.flatMap((period) => {
    const record = all.find((doc) => doc.id === period.id);
    return record ? [{ record, period }] : [];
  });
  const exclusive = summarizeExperiencePeriods(all, {
    asOf,
    scope: 'software-development',
  });
  const covered = included.map(({ record, period }) => describeEmployment(record, period));
  const latestConfirmed = involved.periodsUsed
    .filter((period) => period.confirmedCurrent)
    .map((period) => period.end)
    .sort()
    .at(-1);

  return {
    answer: [
      `Pedro possui ${formatApproximateExperience(involved.approximateMonths)} de períodos profissionais documentados em empresas nas quais também desenvolveu software, considerando os intervalos sem duplicar sobreposições.`,
      `As experiências incluem: ${covered.join('; ')}.`,
      exclusive.periodsUsed.length
        ? `Desse histórico, ${formatApproximateExperience(exclusive.approximateMonths)} correspondem a vínculos classificados exclusivamente como desenvolvimento de software. Geowellex e Greencity também contam como experiência profissional com programação, porém são atuações híbridas.`
        : `Há atividades profissionais de desenvolvimento documentadas em vínculos híbridos.`,
      `Esse total é uma estimativa de tempo de vínculo com atividades de software, não equivale a anos de dedicação integral à programação, não elimina lacunas entre empregos e não define senioridade.`,
      ...(latestConfirmed
        ? [
            `Para o vínculo em andamento, o cálculo foi limitado à última confirmação registrada (${monthLabel(latestConfirmed)}).`,
          ]
        : []),
    ].join(' '),
    sources: included.map(({ record }) => documentSource(record)).slice(0, 10),
  };
}
