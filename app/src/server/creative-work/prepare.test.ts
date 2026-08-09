import { describe, expect, it } from "vitest";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  buildInferredBriefing,
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

  it("quotes one plan per selected direction when a direction pool is provided", () => {
    const directionPool = {
      version: 1,
      directions: [
        { id: "00000000-0000-4000-8000-0000000000d1", label: "A", instruction: "A", order: 0, safetyBand: "safe" as const, provenance: "default" as const },
        { id: "00000000-0000-4000-8000-0000000000d2", label: "B", instruction: "B", order: 1, safetyBand: "experimental" as const, provenance: "manual" as const },
      ],
      selectedIds: ["00000000-0000-4000-8000-0000000000d1", "00000000-0000-4000-8000-0000000000d2"],
      manualInstruction: null,
    };
    const quote = quoteCreativeWork({ intent: "social_post", format: "4:5", targetFormats: [], directionPool });
    expect(quote.plans).toHaveLength(2);
    expect(quote.plans[0]).toMatchObject({ directionId: "00000000-0000-4000-8000-0000000000d1", directionSnapshot: { label: "A", safetyBand: "safe" } });
    expect(quote.plans[1]).toMatchObject({ directionId: "00000000-0000-4000-8000-0000000000d2", directionSnapshot: { label: "B", safetyBand: "experimental" } });
  });
});

describe("inferSocialPostBrief", () => {
  it("fills a brief from request and content analysis without placeholder audience", () => {
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
      audience: "",
      offer: "20% de desconto",
    });
  });

  it("combines every content analysis instead of only the first", () => {
    const analysis = (product: string, offer: string) => ({
      product,
      offer,
      cta: { text: "Saiba mais", style: "button" },
      brandElements: [],
      keyVisual: "produto",
      textContent: { headline: "", bullets: [] },
      format: "4:5",
    });
    const brief = inferSocialPostBrief("", [analysis("Pós-graduação", "20% de desconto"), analysis("Mentoria", "vagas abertas")]);
    expect(brief.objective).toBe("Promover Pós-graduação e Mentoria");
    expect(brief.offer).toBe("20% de desconto e vagas abertas");
    expect(JSON.stringify(brief)).not.toContain("Público da marca");
  });

  it("does not turn the theme into an offer when no source states one", () => {
    const brief = inferSocialPostBrief("Algo moderno para Instagram", []);
    expect(brief.offer).toBe("");
    const briefing = buildInferredBriefing({
      request: "Algo moderno para Instagram",
      brief,
      factPack: {
        version: 1,
        request: "Algo moderno para Instagram",
        facts: [],
        brand: { requiredElements: [], prohibitedElements: [] },
        identity: { clientProfileId: "profile-1", brandName: "Marca", brandAuthority: "active" },
      },
      toneOfVoice: null,
    });
    expect(briefing.offer).toEqual({ value: null, state: "unknown" });
    expect(briefing.readiness).toBe("exploratory");
    expect(briefing.confidence).toBe("low");
  });

  it("preserves an explicit request discount as a sourced offer", () => {
    const request = "Matrículas com 20% até 31/08 para professores";
    const briefing = buildInferredBriefing({
      request,
      brief: inferSocialPostBrief(request, []),
      factPack: {
        version: 1,
        request,
        facts: [
          { value: "20%", class: "price", required: true, origin: "request" },
          { value: "31/08", class: "date", required: true, origin: "request" },
        ],
        brand: { requiredElements: [], prohibitedElements: [] },
        identity: { clientProfileId: "profile-1", brandName: "Marca", brandAuthority: "active" },
      },
      toneOfVoice: null,
    });

    expect(briefing).toMatchObject({
      readiness: "ready",
      offer: { value: "20%", state: "sourced" },
      audience: { value: "professores", state: "sourced" },
    });
  });
});
