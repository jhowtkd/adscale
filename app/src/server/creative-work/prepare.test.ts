import { describe, expect, it } from "vitest";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  inferSocialPostBrief,
} from "./prepare";
import { quoteCreativeWork } from "./contracts";

describe("deriveCreativeWorkTitle", () => {
  it("uses the first meaningful sentence without terminal punctuation", () => {
    expect(deriveCreativeWorkTitle("  Promoção   de matrícula para julho! Outra frase."))
      .toBe("Promoção de matrícula para julho");
  });

  it("truncates normalized titles to 80 characters", () => {
    expect(deriveCreativeWorkTitle("a".repeat(90))).toHaveLength(80);
  });

  it("recognizes sentence punctuation even without following whitespace", () => {
    expect(deriveCreativeWorkTitle("Primeira!Segunda")).toBe("Primeira");
  });
});

describe("inferCreativeWorkFormat", () => {
  it.each([
    ["quadrado 1:1", "1:1"],
    ["story vertical 9:16", "9:16"],
    ["retrato 4:5", "4:5"],
  ])("maps %s to %s", (format, expected) => {
    expect(inferCreativeWorkFormat([{ format }])).toBe(expected);
  });

  it("keeps the fallback when analysis has no recognized aspect ratio", () => {
    expect(inferCreativeWorkFormat([{ format: "paisagem" }])).toBeNull();
  });

  it("prefers an explicit ratio over a generic orientation word", () => {
    expect(inferCreativeWorkFormat([{ format: "retrato vertical 4:5" }])).toBe("4:5");
  });

  it("infers the format from the textual request before image analysis", () => {
    expect(inferCreativeWorkFormat([], "Crie um Story vertical 9:16")).toBe("9:16");
  });
});

describe("quoteCreativeWork", () => {
  it("quotes the deterministic three variations for social_post", () => {
    expect(quoteCreativeWork({ intent: "social_post", format: "4:5", targetFormats: [] }))
      .toEqual({
        plans: [
          { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
          { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
          { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
        ], unitCount: 3, credits: 15,
      });
  });

  it.each([
    [{ intent: "single" as const, format: "1:1" as const, targetFormats: [] }, 1, 5],
    [{ intent: "format_adaptation" as const, format: "4:5" as const, targetFormats: ["1:1", "9:16"] as const }, 2, 10],
  ])("quotes exact plans for %o", (input, unitCount, credits) => {
    const quote = quoteCreativeWork(input);
    expect(quote).toMatchObject({ unitCount, credits });
    expect(quote.plans).toHaveLength(unitCount);
  });
});

describe("inferSocialPostBrief", () => {
  it("fills a complete brief from request and ready content analysis", () => {
    expect(inferSocialPostBrief("Promoção de matrícula para julho", [{
      product: "Pós-graduação",
      offer: "20% de desconto",
      cta: { text: "Inscreva-se", style: "button" },
      brandElements: [],
      keyVisual: "aluna",
      textContent: { headline: "Sua próxima conquista", bullets: [] },
      format: "4:5",
    }])).toEqual({
      theme: "Promoção de matrícula para julho",
      objective: "Promover Pós-graduação",
      audience: "Público da marca",
      offer: "20% de desconto",
    });
  });
});
