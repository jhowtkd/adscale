import { describe, it, expect } from "vitest";
import { normalizeExportCtaText } from "./export-validation";

describe("CTA normalization table", () => {
  const cases: Array<{ label: string; a: string; b: string; equal: boolean }> = [
    {
      label: "NBSP vs space",
      a: "Compre\u00A0agora",
      b: "Compre agora",
      equal: true,
    },
    {
      label: "repeated whitespace",
      a: "Shop   Now",
      b: "Shop Now",
      equal: true,
    },
    {
      label: "typographic apostrophe",
      a: "It\u2019s time",
      b: "It's time",
      equal: true,
    },
    {
      label: "en dash vs hyphen",
      a: "Shop\u2013Now",
      b: "Shop-Now",
      equal: true,
    },
    {
      label: "curly quotes",
      a: "\u201CShop Now\u201D",
      b: '"Shop Now"',
      equal: true,
    },
    {
      label: "semantic text change remains different",
      a: "Shop Now",
      b: "Buy Today",
      equal: false,
    },
    {
      label: "case insensitive",
      a: "SHOP NOW",
      b: "shop now",
      equal: true,
    },
  ];

  it.each(cases)("$label", ({ a, b, equal }) => {
    expect(normalizeExportCtaText(a) === normalizeExportCtaText(b)).toBe(equal);
  });
});
