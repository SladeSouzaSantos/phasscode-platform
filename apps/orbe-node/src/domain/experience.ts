import type { KnowledgeDocument } from './ports.js';
import { normalize } from './security.js';

export interface ExperienceSummary {
  approximateMonths: number;
  periodsUsed: Array<{
    id: string;
    start: string;
    end: string;
    confirmedCurrent: boolean;
  }>;
  excludedIds: string[];
  asOf: string;
  precision: 'month';
}

function monthIndex(value: string): number | undefined {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return undefined;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function formatMonth(value: number): string {
  return `${String(Math.floor(value / 12)).padStart(4, '0')}-${String((value % 12) + 1).padStart(2, '0')}`;
}

function confirmationMonth(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return undefined;
  return monthIndex(value.slice(0, 7));
}

/**
 * Estimate elapsed calendar months only from structured, month-precision periods.
 * Intervals are [start month, end month); overlapping periods count once. A mixed
 * engineering/software role cannot establish continuous software or technology time.
 * Ongoing records stop at their owner's latest confirmation, even when asOf is later.
 */
export function summarizeExperiencePeriods(
  documents: KnowledgeDocument[],
  options: {
    asOf: Date;
    scope: 'career' | 'software-development' | 'company';
    technology?: string;
    companyId?: string;
  },
): ExperienceSummary {
  if (!Number.isFinite(options.asOf.getTime()))
    throw new RangeError('Data de referência inválida.');
  const asOfMonth = options.asOf.getUTCFullYear() * 12 + options.asOf.getUTCMonth();
  const result: ExperienceSummary = {
    approximateMonths: 0,
    periodsUsed: [],
    excludedIds: [],
    asOf: formatMonth(asOfMonth),
    precision: 'month',
  };
  const intervals: Array<{ start: number; end: number }> = [];
  const technologyKey = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '');
  const technology = options.technology ? technologyKey(options.technology) : undefined;

  for (const document of documents) {
    const period = document.experiencePeriod;
    if (!period) continue;
    const pureSoftware = period.areas.length === 1 && period.areas[0] === 'software-development';
    const matchesScope =
      options.scope === 'career' ||
      (options.scope === 'software-development' && pureSoftware) ||
      (options.scope === 'company' && document.id === options.companyId);
    const matchesTechnology =
      technology === undefined ||
      (pureSoftware &&
        Boolean(document.technologies?.some((value) => technologyKey(value) === technology)));
    const start = monthIndex(period.start);
    const closed = period.end ? monthIndex(period.end) : undefined;
    const current = period.currentAsOf ? confirmationMonth(period.currentAsOf) : undefined;
    const end = closed ?? current;

    if (
      !matchesScope ||
      !matchesTechnology ||
      start === undefined ||
      end === undefined ||
      Boolean(period.end) === Boolean(period.currentAsOf) ||
      end < start ||
      start > asOfMonth
    ) {
      result.excludedIds.push(document.id);
      continue;
    }
    const boundedEnd = Math.min(end, asOfMonth);
    intervals.push({ start, end: boundedEnd });
    result.periodsUsed.push({
      id: document.id,
      start: formatMonth(start),
      end: formatMonth(boundedEnd),
      confirmedCurrent: current !== undefined,
    });
  }

  // Sorting and merging prevent double-counting overlapping contracts or roles.
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  let merged: { start: number; end: number } | undefined;
  for (const interval of intervals) {
    if (!merged) merged = { ...interval };
    else if (interval.start <= merged.end) merged.end = Math.max(merged.end, interval.end);
    else {
      result.approximateMonths += merged.end - merged.start;
      merged = { ...interval };
    }
  }
  if (merged) result.approximateMonths += merged.end - merged.start;
  return result;
}
