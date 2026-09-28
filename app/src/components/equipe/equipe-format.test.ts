import { describe, expect, it } from "vitest";
import {
  captionTitle,
  formatDate,
  formatDateTime,
  formatShortDate,
  formatShortDay,
} from "./equipe-format";

// Pattern-based: exact weekdays shift with the machine timezone, the shape
// (short, no dots, no time) must not.
describe("equipe-format", () => {
  it.each(["pt-BR", "en"])("keeps the short day compact in %s", (locale) => {
    const out = formatShortDay("2026-10-05T13:00:00.000Z", locale);
    expect(out).toMatch(/^\S+ \d{2}$/);
    expect(out).not.toContain(".");
    expect(out).not.toContain(":");
    expect(out).not.toContain("/");
  });

  it.each(["pt-BR", "en"])("keeps the short date compact in %s", (locale) => {
    const out = formatShortDate("2026-10-05T13:00:00.000Z", locale);
    expect(out).toMatch(/^\S+ \d{2}\/\d{2}$/);
    expect(out).not.toContain(".");
    expect(out).not.toContain(":");
  });

  it("capitalizes the card first line but not the mid-sentence deadline", () => {
    const day = formatShortDay("2026-10-05T13:00:00.000Z", "pt-BR")!;
    const date = formatShortDate("2026-10-05T13:00:00.000Z", "pt-BR")!;
    expect(day.charAt(0)).toBe(day.charAt(0).toUpperCase());
    expect(date.charAt(0)).toBe(date.charAt(0).toLowerCase());
  });

  it("returns null for missing or invalid input", () => {
    for (const fn of [formatDateTime, formatDate, formatShortDay, formatShortDate]) {
      expect(fn(null, "pt-BR")).toBeNull();
      expect(fn(undefined, "pt-BR")).toBeNull();
      expect(fn("not-a-date", "pt-BR")).toBeNull();
    }
    expect(captionTitle(null)).toBeNull();
    expect(captionTitle("  ")).toBeNull();
  });

  it("truncates long captions", () => {
    expect(captionTitle("hello", 80)).toBe("hello");
    expect(captionTitle("abcdef", 5)).toBe("abcd…");
  });
});
