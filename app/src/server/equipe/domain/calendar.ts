// Business-day calendar for America/Sao_Paulo ("dias úteis").
// Pure: every function takes the instant as data; nothing reads the clock.
// São Paulo has no DST since 2019 (fixed UTC-3), so wall-clock reads use
// Intl and civil-date construction uses the fixed offset; both agree.

export const SAO_PAULO_TZ = "America/Sao_Paulo";

/** Fixed UTC offset of America/Sao_Paulo in minutes (UTC-3, no DST). */
export const SAO_PAULO_OFFSET_MINUTES = 180;

export type Holiday = {
  /** Civil date in São Paulo, "YYYY-MM-DD". */
  date: string;
  name: string;
};

/**
 * Brazilian national holidays ("feriados nacionais"), versioned per year.
 * Covers only official national holidays: Carnaval, Corpus Christi and
 * other "ponto facultativo" days are business days here.
 */
export const NATIONAL_HOLIDAYS_BY_YEAR: Record<number, Holiday[]> = {
  2026: [
    { date: "2026-01-01", name: "Confraternização Universal" },
    { date: "2026-04-03", name: "Paixão de Cristo" },
    { date: "2026-04-21", name: "Tiradentes" },
    { date: "2026-05-01", name: "Dia do Trabalho" },
    { date: "2026-09-07", name: "Independência do Brasil" },
    { date: "2026-10-12", name: "Nossa Senhora Aparecida" },
    { date: "2026-11-02", name: "Finados" },
    { date: "2026-11-15", name: "Proclamação da República" },
    { date: "2026-11-20", name: "Consciência Negra" },
    { date: "2026-12-25", name: "Natal" },
  ],
  2027: [
    { date: "2027-01-01", name: "Confraternização Universal" },
    { date: "2027-03-26", name: "Paixão de Cristo" },
    { date: "2027-04-21", name: "Tiradentes" },
    { date: "2027-05-01", name: "Dia do Trabalho" },
    { date: "2027-09-07", name: "Independência do Brasil" },
    { date: "2027-10-12", name: "Nossa Senhora Aparecida" },
    { date: "2027-11-02", name: "Finados" },
    { date: "2027-11-15", name: "Proclamação da República" },
    { date: "2027-11-20", name: "Consciência Negra" },
    { date: "2027-12-25", name: "Natal" },
  ],
};

export type SaoPauloCivilDate = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "YYYY-MM-DD". */
  dateKey: string;
};

const SP_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Wall-clock reading of an instant in America/Sao_Paulo. */
export function toSaoPauloCivilDate(instant: Date): SaoPauloCivilDate {
  const parts = SP_FORMAT.formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Weekday from the civil date itself (independent of the instant's zone).
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    weekday,
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/**
 * Build the instant for a São Paulo wall time. Valid because the zone is
 * fixed at UTC-3 (no DST since 2019).
 */
export function fromSaoPauloWallTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) + SAO_PAULO_OFFSET_MINUTES * 60_000);
}

function holidayDatesByYear(holidays: Record<number, Holiday[]> = NATIONAL_HOLIDAYS_BY_YEAR): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const [yearKey, list] of Object.entries(holidays)) {
    map.set(Number(yearKey), new Set(list.map((h) => h.date)));
  }
  return map;
}

export function isHoliday(
  instant: Date,
  holidays: Record<number, Holiday[]> = NATIONAL_HOLIDAYS_BY_YEAR,
): boolean {
  const civil = toSaoPauloCivilDate(instant);
  return (holidays[civil.year] ?? []).some((h) => h.date === civil.dateKey);
}

export function isBusinessDay(
  instant: Date,
  holidays: Record<number, Holiday[]> = NATIONAL_HOLIDAYS_BY_YEAR,
): boolean {
  const civil = toSaoPauloCivilDate(instant);
  if (civil.weekday === 0 || civil.weekday === 6) return false;
  return !isHoliday(instant, holidays);
}

/**
 * Add (or subtract, when negative) business days on the São Paulo civil
 * calendar, preserving the wall time of day. Years without a holiday table
 * are treated as having no holidays.
 */
export function addBusinessDays(
  instant: Date,
  days: number,
  holidays: Record<number, Holiday[]> = NATIONAL_HOLIDAYS_BY_YEAR,
): Date {
  if (!Number.isInteger(days)) throw new RangeError("days must be an integer");
  const start = toSaoPauloCivilDate(instant);
  const byYear = holidayDatesByYear(holidays);
  let cursorUtc = Date.UTC(start.year, start.month - 1, start.day);
  let remaining = Math.abs(days);
  const step = days < 0 ? -1 : 1;
  while (remaining > 0) {
    cursorUtc += step * 86_400_000;
    const cursor = new Date(cursorUtc);
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`;
    if (byYear.get(cursor.getUTCFullYear())?.has(key)) continue;
    remaining -= 1;
  }
  const landed = new Date(cursorUtc);
  return fromSaoPauloWallTime(
    landed.getUTCFullYear(),
    landed.getUTCMonth() + 1,
    landed.getUTCDate(),
    start.hour,
    start.minute,
    start.second,
  );
}

/**
 * Whole business days elapsed from the civil date of `since` (exclusive) to
 * the civil date of `until` (inclusive). Expresses the implantação reminder
 * caps: 2 and 5 business days without progress, exception at 7, paused at 10.
 */
export function businessDaysElapsed(
  since: Date,
  until: Date,
  holidays: Record<number, Holiday[]> = NATIONAL_HOLIDAYS_BY_YEAR,
): number {
  const from = toSaoPauloCivilDate(since);
  const to = toSaoPauloCivilDate(until);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  if (toUtc <= fromUtc) return 0;
  const byYear = holidayDatesByYear(holidays);
  let count = 0;
  for (let cursor = fromUtc + 86_400_000; cursor <= toUtc; cursor += 86_400_000) {
    const date = new Date(cursor);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    if (byYear.get(date.getUTCFullYear())?.has(key)) continue;
    count += 1;
  }
  return count;
}

/** Assisted window ("janela assistida"): Mon–Fri 09:00–18:00, 18:00 exclusive. */
export function isWithinAssistedWindow(instant: Date): boolean {
  const civil = toSaoPauloCivilDate(instant);
  if (civil.weekday === 0 || civil.weekday === 6) return false;
  const minutes = civil.hour * 60 + civil.minute;
  return minutes >= 9 * 60 && minutes < 18 * 60;
}

/** Item approval limit ("limite do item"): scheduled time minus 2 h. */
export function itemApprovalDeadline(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - 2 * 3_600_000);
}
