import type { EvaluatedCorpusRow } from "../calibration/types";

const MS_PER_DAY = 86_400_000;

function padWeek(week: number): string {
  return week < 10 ? `0${week}` : String(week);
}

function toUtcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function resolveIsoWeekYearAndNumber(date: Date): {
  isoYear: number;
  isoWeek: number;
} {
  const utc = toUtcDateOnly(date);
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);

  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7
  );

  return { isoYear, isoWeek };
}

export function bucketKeyForDate(date: Date): string {
  const { isoYear, isoWeek } = resolveIsoWeekYearAndNumber(date);
  return `${isoYear}-W${padWeek(isoWeek)}`;
}

export function bucketPeriodForKey(bucketKey: string): {
  periodStart: string;
  periodEnd: string;
} {
  const match = /^(\d{4})-W(\d{2})$/.exec(bucketKey);
  if (!match) {
    throw new Error(`Invalid bucket key: ${bucketKey}`);
  }

  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const periodStart = new Date(weekOneMonday);
  periodStart.setUTCDate(weekOneMonday.getUTCDate() + (isoWeek - 1) * 7);

  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodStart.getUTCDate() + 6);
  periodEnd.setUTCHours(23, 59, 59, 999);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

function readEvaluationCreatedAt(row: EvaluatedCorpusRow): Date | null {
  const createdAt = row.evaluation?.createdAt;
  if (!createdAt) {
    return null;
  }
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function groupEvaluatedRowsByBucket(
  rows: EvaluatedCorpusRow[]
): Map<string, EvaluatedCorpusRow[]> {
  const grouped = new Map<string, EvaluatedCorpusRow[]>();

  for (const row of rows) {
    const createdAt = readEvaluationCreatedAt(row);
    if (!createdAt) {
      continue;
    }

    const bucketKey = bucketKeyForDate(createdAt);
    const bucketRows = grouped.get(bucketKey);
    if (bucketRows) {
      bucketRows.push(row);
    } else {
      grouped.set(bucketKey, [row]);
    }
  }

  return grouped;
}
