import { describe, expect, it } from "vitest";
import {
  normalizeCurrency,
  normalizeDateString,
  normalizeIntegerString,
  normalizeNumericString,
} from "./normalize";

describe("normalizeNumericString", () => {
  it("normalizes en-US decimals", () => {
    expect(
      normalizeNumericString("1,234.56", {
        decimalSeparator: ".",
        percentFormat: "fraction",
      }).value
    ).toBe("1234.56");
  });

  it("normalizes pt-BR decimals", () => {
    expect(
      normalizeNumericString("1.234,56", {
        decimalSeparator: ",",
        percentFormat: "fraction",
      }).value
    ).toBe("1234.56");
  });

  it("converts percent format to fraction", () => {
    expect(
      normalizeNumericString("1,5%", {
        decimalSeparator: ",",
        percentFormat: "percent",
      }).value
    ).toBe("0.015");
  });

  it("strips currency symbols", () => {
    expect(
      normalizeNumericString("R$ 50,25", {
        decimalSeparator: ",",
        percentFormat: "fraction",
      }).value
    ).toBe("50.25");
  });

  it("rejects invalid numbers", () => {
    expect(
      normalizeNumericString("abc", {
        decimalSeparator: ".",
        percentFormat: "fraction",
      }).error
    ).toBeDefined();
  });
});

describe("normalizeIntegerString", () => {
  it("accepts whole numbers", () => {
    expect(
      normalizeIntegerString("1000", {
        decimalSeparator: ".",
        percentFormat: "fraction",
      }).value
    ).toBe("1000");
  });

  it("rejects fractional integers", () => {
    expect(
      normalizeIntegerString("10,5", {
        decimalSeparator: ",",
        percentFormat: "fraction",
      }).error
    ).toBeDefined();
  });
});

describe("normalizeDateString", () => {
  it("accepts ISO dates", () => {
    expect(normalizeDateString("2026-06-01").value).toBe("2026-06-01");
  });

  it("rejects invalid dates", () => {
    expect(normalizeDateString("06/01/2026").error).toBeDefined();
  });
});

describe("normalizeCurrency", () => {
  it("falls back to default currency", () => {
    expect(normalizeCurrency(undefined, "brl").value).toBe("BRL");
  });

  it("normalizes explicit USD from CSV column", () => {
    expect(normalizeCurrency("usd", "BRL").value).toBe("USD");
  });

  it("rejects invalid currency codes", () => {
    expect(normalizeCurrency("dollar", "BRL").error).toBeDefined();
  });
});
