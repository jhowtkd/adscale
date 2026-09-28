import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysElapsed,
  fromSaoPauloWallTime,
  isBusinessDay,
  isHoliday,
  isoWeekKey,
  isWithinAssistedWindow,
  itemApprovalDeadline,
  monthKey,
  monthWindow,
  toSaoPauloCivilDate,
} from "./calendar";

describe("holidays", () => {
  it("marks 2026 national holidays", () => {
    expect(isHoliday(fromSaoPauloWallTime(2026, 5, 1, 12))).toBe(true); // Dia do Trabalho, Friday
    expect(isHoliday(fromSaoPauloWallTime(2026, 4, 3, 12))).toBe(true); // Paixão de Cristo, Friday
    expect(isHoliday(fromSaoPauloWallTime(2026, 11, 20, 12))).toBe(true); // Consciência Negra, Friday
    expect(isHoliday(fromSaoPauloWallTime(2026, 9, 7, 12))).toBe(true); // Independência, Monday
  });

  it("marks 2027 national holidays", () => {
    expect(isHoliday(fromSaoPauloWallTime(2027, 3, 26, 12))).toBe(true); // Paixão de Cristo, Friday
    expect(isHoliday(fromSaoPauloWallTime(2027, 1, 1, 12))).toBe(true); // Confraternização, Friday
    expect(isHoliday(fromSaoPauloWallTime(2027, 5, 3, 12))).toBe(false); // Ordinary Monday
  });

  it("treats Carnaval (ponto facultativo) as a business day", () => {
    // 2026-02-16/17 is Carnival Mon/Tue — not a national holiday.
    const monday = fromSaoPauloWallTime(2026, 2, 16, 10);
    expect(toSaoPauloCivilDate(monday).weekday).toBe(1);
    expect(isHoliday(monday)).toBe(false);
    expect(isBusinessDay(monday)).toBe(true);
  });

  it("treats weekends as non-business days", () => {
    expect(isBusinessDay(fromSaoPauloWallTime(2026, 10, 31, 12))).toBe(false); // Saturday
    expect(isBusinessDay(fromSaoPauloWallTime(2026, 11, 1, 12))).toBe(false); // Sunday
    expect(isBusinessDay(fromSaoPauloWallTime(2026, 10, 30, 12))).toBe(true); // Friday
  });
});

describe("São Paulo zone (DST-free)", () => {
  it("keeps UTC-3 in January and July", () => {
    expect(fromSaoPauloWallTime(2026, 1, 15, 12).toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(fromSaoPauloWallTime(2026, 7, 15, 12).toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("round-trips wall time through Intl", () => {
    const civil = toSaoPauloCivilDate(new Date("2026-10-30T20:00:00.000Z"));
    expect({ ...civil, weekday: undefined }).toMatchObject({ year: 2026, month: 10, day: 30, hour: 17, minute: 0 });
    expect(civil.weekday).toBe(5); // Friday
  });
});

describe("business-day arithmetic", () => {
  it("skips weekend and the May 1st holiday", () => {
    // Thu 2026-04-30 10:00 + 1 business day → Mon 2026-05-04 10:00
    // (Fri May 1st is a holiday, then the weekend).
    const start = fromSaoPauloWallTime(2026, 4, 30, 10);
    const next = addBusinessDays(start, 1);
    expect(toSaoPauloCivilDate(next)).toMatchObject({ year: 2026, month: 5, day: 4, hour: 10, minute: 0 });
  });

  it("adds zero days as identity", () => {
    const start = fromSaoPauloWallTime(2026, 10, 28, 14, 30);
    expect(addBusinessDays(start, 0).getTime()).toBe(start.getTime());
  });

  it("expresses the implantação reminder caps (2/5/7/10 business days)", () => {
    // Progress stalled Mon 2026-10-26 10:00.
    const stalled = fromSaoPauloWallTime(2026, 10, 26, 10);
    expect(toSaoPauloCivilDate(addBusinessDays(stalled, 2))).toMatchObject({ month: 10, day: 28 }); // 1st reminder
    expect(toSaoPauloCivilDate(addBusinessDays(stalled, 5))).toMatchObject({ month: 11, day: 3 }); // 2nd reminder
    // Nov 2nd (Finados) is skipped on the way to the exception and pause.
    expect(toSaoPauloCivilDate(addBusinessDays(stalled, 7))).toMatchObject({ month: 11, day: 5 }); // exception
    expect(toSaoPauloCivilDate(addBusinessDays(stalled, 10))).toMatchObject({ month: 11, day: 10 }); // paused
    expect(businessDaysElapsed(stalled, fromSaoPauloWallTime(2026, 11, 5, 10))).toBe(7);
    expect(businessDaysElapsed(stalled, stalled)).toBe(0);
  });
});

describe("assisted window", () => {
  it("allows Mon–Fri 09:00–18:00", () => {
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 26, 9, 0))).toBe(true);
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 30, 17, 59))).toBe(true);
  });

  it("rejects edges and weekends", () => {
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 26, 8, 59))).toBe(false);
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 30, 18, 0))).toBe(false);
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 31, 12, 0))).toBe(false);
  });

  it("excludes national holidays, even at 10:00 on a weekday", () => {
    // Fri 2026-05-01 is Dia do Trabalho; Mon 2026-05-04 is the next business day.
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 5, 1, 10, 0))).toBe(false);
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 5, 4, 10, 0))).toBe(true);
  });

  it("accepts an injected holiday table like the other calendar functions", () => {
    const holidays = { 2026: [{ date: "2026-10-26", name: "Custom" }] };
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 26, 10, 0), holidays)).toBe(false);
    expect(isWithinAssistedWindow(fromSaoPauloWallTime(2026, 10, 26, 10, 0))).toBe(true);
  });
});

describe("item limit", () => {
  it("is the scheduled time minus 2 h", () => {
    const scheduled = fromSaoPauloWallTime(2026, 10, 30, 17, 0);
    const limit = itemApprovalDeadline(scheduled);
    expect(toSaoPauloCivilDate(limit)).toMatchObject({ year: 2026, month: 10, day: 30, hour: 15, minute: 0 });
  });
});

describe("month window", () => {
  it("spans the São Paulo civil month, December wrapping to January", () => {
    const window = monthWindow(fromSaoPauloWallTime(2026, 12, 15, 12, 30));
    expect(toSaoPauloCivilDate(window.start)).toMatchObject({ year: 2026, month: 12, day: 1, hour: 0, minute: 0 });
    expect(toSaoPauloCivilDate(window.endExclusive)).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0, minute: 0 });
  });

  it("reads the month from the São Paulo wall clock, not UTC", () => {
    // 2026-09-01T01:00Z is still 2026-08-31 22:00 in São Paulo (UTC-3).
    expect(monthKey(new Date("2026-09-01T01:00:00.000Z"))).toBe("2026-08");
    expect(monthKey(new Date("2026-09-01T03:00:00.000Z"))).toBe("2026-09");
  });
});

describe("iso week key", () => {
  it("keys Monday to Sunday of the same ISO week together", () => {
    expect(isoWeekKey(fromSaoPauloWallTime(2026, 9, 28, 9, 0))).toBe("2026-W40");
    expect(isoWeekKey(fromSaoPauloWallTime(2026, 10, 4, 23, 59))).toBe("2026-W40");
    expect(isoWeekKey(fromSaoPauloWallTime(2026, 10, 5, 0, 0))).toBe("2026-W41");
  });

  it("reads the week from the São Paulo wall clock, not UTC", () => {
    // 2026-10-05T02:00Z is still Sunday 2026-10-04 23:00 in São Paulo.
    expect(isoWeekKey(new Date("2026-10-05T02:00:00.000Z"))).toBe("2026-W40");
    expect(isoWeekKey(new Date("2026-10-05T03:00:00.000Z"))).toBe("2026-W41");
  });

  it("keeps early-January days in the previous week-year when they belong there", () => {
    expect(isoWeekKey(fromSaoPauloWallTime(2027, 1, 1, 12, 0))).toBe("2026-W53");
    expect(isoWeekKey(fromSaoPauloWallTime(2027, 1, 4, 12, 0))).toBe("2027-W01");
  });
});
