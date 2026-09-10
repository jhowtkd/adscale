import { describe, expect, it } from "vitest";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  formatFromDimensions,
  buildInferredBriefing,
  inferSocialPostBrief,
} from "./prepare";
import { quoteCreativeWork } from "./contracts";

describe("formatFromDimensions", () => {
  it.each([
    [1080, 1080, "1:1"], [1080, 1350, "4:5"], [1080, 1920, "9:16"],
    [1024, 1280, "4:5"], [1079, 1350, "4:5"],
    [0, 1350, null], [-1, 1350, null], [1080, 0, null],
    [null, 1350, null], [1080, null, null], [NaN, 1350, null],
    [1080, Infinity, null], [1920, 1080, null], [1000, 1350, null],
  ])("maps %s by %s to %s without guessing unsupported ratios", (width, height, expected) => {
    expect(formatFromDimensions(width, height)).toBe(expected);
  });
});

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
  it("prefers the content geometry over generic request and analysis words", () => {
    expect(inferCreativeWorkFormat([{ format: "vertical" }], "Peça vertical", "4:5")).toBe("4:5");
  });

  it("lets one explicit numeric target override the content geometry", () => {
    expect(inferCreativeWorkFormat([{ format: "vertical" }], "Quero 9 : 16, formato 9:16", "4:5")).toBe("9:16");
  });

  it("does not choose arbitrarily between two requested ratios", () => {
    expect(inferCreativeWorkFormat([{ format: "vertical" }], "Base 4:5 ou 9:16", "4:5")).toBe("4:5");
    expect(inferCreativeWorkFormat([], "4:5 ou 9:16")).toBeNull();
  });

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
        ], unitCount: 3, credits: 150,
      });
  });

  it.each([
    [{ intent: "single" as const, format: "1:1" as const, targetFormats: [] }, 1, 50],
    [{ intent: "format_adaptation" as const, format: "4:5" as const, targetFormats: ["1:1", "9:16"] as const }, 2, 100],
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
    expect(brief.offer).toBeNull();
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

  it("does not turn a requested month into the audience", () => {
    const request = "Promoção de matrícula para julho";
    const briefing = buildInferredBriefing({
      request,
      brief: inferSocialPostBrief(request, []),
      factPack: {
        version: 1,
        request,
        facts: [{ value: "julho", class: "date", required: true, origin: "request" }],
        brand: { requiredElements: [], prohibitedElements: [] },
        identity: { clientProfileId: "profile-1", brandName: "Marca", brandAuthority: "active" },
      },
      toneOfVoice: null,
    });

    expect(briefing.audience).toEqual({ value: null, state: "unknown" });
  });

  it("uses inline briefing overrides as authoritative fields", () => {
    const request = "Uma peça para matrículas";
    const factPack = {
      version: 1,
      request,
      facts: [{ value: "Matrículas", class: "product" as const, required: true, origin: "request" as const }],
      brand: { requiredElements: [], prohibitedElements: [] },
      identity: { clientProfileId: "profile-1", brandName: "Marca", brandAuthority: "active" as const },
    };
    const briefing = buildInferredBriefing({
      request,
      brief: inferSocialPostBrief(request, []),
      factPack,
      toneOfVoice: "Institucional",
      briefingOverrides: { message: "Matrículas abertas", audience: "Professores", tone: "Direto" },
    });

    expect(briefing.message).toEqual({ value: "Matrículas abertas", state: "sourced" });
    expect(briefing.audience).toEqual({ value: "Professores", state: "sourced" });
    expect(briefing.tone).toEqual({ value: "Direto", state: "sourced" });
  });

  it("preserves request and brand constraints as sourced content", () => {
    const request = "Matrículas em julho com vagas limitadas";
    const briefing = buildInferredBriefing({
      request,
      brief: inferSocialPostBrief(request, []),
      factPack: {
        version: 1,
        request,
        facts: [
          { value: "julho", class: "date", required: true, origin: "request" },
          { value: "vagas limitadas", class: "condition", required: true, origin: "request" },
        ],
        brand: { requiredElements: ["logo"], prohibitedElements: ["clipart"] },
        identity: { clientProfileId: "profile-1", brandName: "Marca", brandAuthority: "active" },
      },
      toneOfVoice: null,
    });

    expect(briefing.constraints).toEqual({
      value: "julho; vagas limitadas; Incluir: logo; Evitar: clipart",
      state: "sourced",
    });
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
      audience: { value: null, state: "unknown" },
    });
  });
});
