import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4o",
  },
}));

import {
  analyzeArtComparison,
  analyzeCreativeQa,
  analyzeCreativeWorkQa,
  analyzePersonFidelity,
  normalizeArtComparisonResult,
  normalizeCreativeQaResult,
  normalizeCreativeWorkQaResult,
  normalizePersonFidelityResult,
  buildArtComparisonPrompt,
  buildCreativeQaPrompt,
  buildCreativeWorkQaPrompt,
  buildPersonFidelityPrompt,
  extractObservableRubricSection,
  inspectCreativeWorkImageFile,
  inspectExactCompositionAsset,
} from "./creative-qa";

describe("analyzeCreativeQa controlled E2E seam", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns deterministic passed observations while leaving policy evaluation downstream", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("APP_URL", "http://localhost:3000");

    const result = await analyzeCreativeQa({
      imageBuffer: Buffer.from("controlled"),
      mimeType: "image/png",
      locale: "pt-BR",
      campaign: {
        name: "UAT",
        client: "ADScale",
        product: "ADScale",
        offer: "",
        objective: "Awareness",
        audience: "Marketers",
      },
      derivation: {
        ctaText: "Saiba mais",
        format: "1:1",
        generationMode: "art_variation",
      },
    });

    expect(result.status).toBe("ready");
    expect(Object.values(result.checklist)).toHaveLength(6);
    expect(Object.values(result.checklist).every((item) => item.status === "passed")).toBe(true);
    expect(result.issues).toEqual([]);

  });
});

describe("normalizeCreativeQaResult", () => {
  it("normalizes a complete QA result", () => {
    const result = normalizeCreativeQaResult({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "Readable." },
        ctaOffer: { status: "passed", note: "CTA preserved." },
        informationPreservation: { status: "warning", note: "Offer badge is close to the edge." },
        briefMatch: { status: "warning", note: "Audience could be clearer." },
        formatFit: { status: "passed", note: "Fits 4:5." },
        creativeRisk: { status: "warning", note: "Generic visual." },
      },
      issues: ["Audience could be clearer."],
      suggestions: ["Add audience-specific visual cues."],
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("passed");
    expect(result.checklist.informationPreservation.status).toBe("warning");
    expect(result.issues).toEqual(["Audience could be clearer."]);
  });

  it("fills missing criteria with warning fallbacks", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {},
    });

    expect(result.status).toBe("warning");
    expect(result.checklist.legibility.status).toBe("warning");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("limits issues and suggestions", () => {
    const result = normalizeCreativeQaResult({
      status: "review",
      checklist: {},
      issues: ["1", "2", "3", "4"],
      suggestions: ["1", "2", "3", "4"],
    });

    expect(result.issues).toHaveLength(3);
    expect(result.suggestions).toHaveLength(3);
  });
});

describe("buildCreativeQaPrompt", () => {
  it("builds a QA prompt with CTA, offer, format, and campaign context", () => {
    const prompt = buildCreativeQaPrompt({
      campaign: {
        name: "Launch",
        client: "Acme",
        product: "Serum",
        offer: "20% off",
        objective: "Conversions",
        audience: "New buyers",
        tone: "Premium",
      },
      derivation: {
        ctaText: "Shop now",
        format: "4:5",
        generationMode: "art_variation",
      },
      locale: "en",
    });

    expect(prompt).toContain("Shop now");
    expect(prompt).toContain("20% off");
    expect(prompt).toContain("4:5");
    expect(prompt).toContain("Passagem Olhar");
    expect(prompt).toContain("Exportacao");
    expect(prompt).toMatch(/invented facts, wrong brand, unsupported offers/i);
    expect(prompt).toContain("Return only JSON");
    expect(prompt).toContain("informationPreservation");
    expect(prompt).toContain("cropped, hidden, truncated, blurred, overlapped, deleted");
    expect(prompt).toMatch(/Checklist keys: legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk/);
    expect(prompt).toContain("Allowed status values: ready, warning, review.");
  });
});

describe("QA compliance boundary wording", () => {
  const promptInput = {
    campaign: {
      name: "Launch",
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      objective: "Conversions",
      audience: "New buyers",
      tone: "Premium",
    },
    derivation: {
      ctaText: "Shop now",
      format: "4:5",
      generationMode: "art_variation",
    },
    locale: "en",
  };

  it("allows CTA absence and paraphrase", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/CTA absence and paraphrase are allowed/i);
    expect(prompt).toMatch(/preserves? the (?:same )?action intent/i);
  });

  it("does not demand character-for-character CTA fidelity", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).not.toMatch(/character-for-character/i);
    expect(prompt).not.toMatch(/Flag ctaOffer as failed on any substitution, paraphrase/i);
  });

  it("reserves failed compliance for objective defects", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/invented or incorrect facts/i);
    expect(prompt).toMatch(/unusable .*format|format .*unusable/i);
    expect(prompt).toMatch(/corruption/i);
    expect(prompt).toMatch(/cropping/i);
  });

  it("routes art-direction observations to creativeRisk as ranking advice", () => {
    const prompt = buildCreativeQaPrompt(promptInput);
    expect(prompt).toMatch(/creativeRisk.*(?:ranking|advice|advisory)/i);
    expect(prompt).not.toMatch(
      /failed.*(?:on checklist criteria when observable defects are present.*)?especially visual overload/is
    );
  });
});

describe("observable rubric in QA prompt", () => {
  const baseInput = {
    locale: "pt-BR",
    campaign: {
      name: "NR1 Launch",
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      objective: "Conversions",
      audience: "New buyers",
    },
    derivation: {
      ctaText: "Shop now",
      format: "1:1",
      generationMode: "art_variation" as const,
    },
    contract: {
      generationMode: "art_variation" as const,
      targetFormat: "1:1",
      ctaSemantics: { kind: "explicit" as const, text: "Shop now" },
      baseAssetId: "base-1",
      styleAssetId: null,
      client: "Acme",
      product: "Serum",
      offer: "20% off",
      constraints: null,
      canonicalCreative: {
        dominantIdea: "NR1 card grid hero",
      },
    },
  };

  it("does not contain export-softening bias (RUBR-03)", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).not.toMatch(/Export must remain allowed/i);
  });

  it("includes integrity-first failed-criteria language", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).toMatch(/failed.*checklist|checklist.*failed/i);
  });

  it("includes advisory observable rubric sections", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    const section = extractObservableRubricSection(prompt);
    expect(section.length).toBeGreaterThan(0);
    expect(section).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(section).toMatch(/ART DIRECTION \(ranking guidance\)/);
    expect(section).not.toMatch(/Mark failed/i);
  });

  it("preserves checklist keys and JSON return instruction after rubric injection", () => {
    const prompt = buildCreativeQaPrompt(baseInput);
    expect(prompt).toContain("Return only JSON with status, checklist, issues, and suggestions.");
    expect(prompt).toMatch(/Checklist keys: legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk/);
    expect(prompt).toContain("Allowed status values: ready, warning, review.");
  });
});

describe("styleFidelity criterion", () => {
  const baseCampaign = {
    name: "Test Campaign",
    client: "Acme",
    product: "Widget",
    offer: "10% off",
    objective: "Conversions",
    audience: "Adults 25-45",
  };

  it("buildCreativeQaPrompt includes styleFidelity checklist key for restyling mode", () => {
    const prompt = buildCreativeQaPrompt({
      locale: "pt-BR",
      campaign: baseCampaign,
      derivation: {
        ctaText: null,
        format: "1:1",
        generationMode: "restyling",
      },
      contract: {
        generationMode: "restyling",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "base-1",
        styleAssetId: "style-1",
        client: "Acme",
        product: "Widget",
        offer: "10% off",
        constraints: null,
      },
    });
    expect(prompt).toContain("styleFidelity");
    expect(prompt.toLowerCase()).toContain("style reference");
    expect(prompt.toLowerCase()).toContain("factual");
  });

  it("buildCreativeQaPrompt does NOT include styleFidelity for art_variation mode", () => {
    const prompt = buildCreativeQaPrompt({
      locale: "pt-BR",
      campaign: baseCampaign,
      derivation: {
        ctaText: "Comprar",
        format: "1:1",
        generationMode: "art_variation",
      },
      contract: {
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "explicit", text: "Comprar" },
        baseAssetId: "base-1",
        styleAssetId: null,
        client: "Acme",
        product: "Widget",
        offer: "10% off",
        constraints: null,
      },
    });
    expect(prompt).not.toContain("styleFidelity");
  });

  it("normalizeCreativeQaResult includes styleFidelity when present in model response", () => {
    const result = normalizeCreativeQaResult({
      status: "warning",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
        styleFidelity: { status: "failed", note: "Brand name from style reference copied." },
      },
      issues: ["Brand name from style reference copied."],
      suggestions: [],
    });
    expect(result.checklist.styleFidelity).toBeDefined();
    expect(result.checklist.styleFidelity?.status).toBe("failed");
  });

  it("ignores unknown checklist keys", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
        randomKey: { status: "failed", note: "Should be ignored." },
      },
      issues: [],
      suggestions: [],
    });
    expect((result.checklist as Record<string, unknown>)["randomKey"]).toBeUndefined();
    expect(result.status).toBe("ready");
  });

  it("forces warning when model sent ready but all core criteria use fallback notes", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {},
    });
    expect(result.status).toBe("warning");
  });

  it("respects model status when partial real notes exist", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "Readable." },
        ctaOffer: { status: "passed", note: "CTA preserved." },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: [],
      suggestions: [],
    });
    expect(result.status).toBe("ready");
  });

  it("normalizeCreativeQaResult does not add styleFidelity fallback when absent", () => {
    const result = normalizeCreativeQaResult({
      status: "ready",
      checklist: {
        legibility: { status: "passed", note: "OK" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      issues: [],
      suggestions: [],
    });
    expect(result.checklist.styleFidelity).toBeUndefined();
  });
});

describe("blind gate follow-up QA wording", () => {
  const restylingInput = {
    locale: "pt-BR",
    campaign: {
      name: "Nova campanha",
      client: "Instituto Educação+",
      product: "Curso de capacitação docente",
      offer: "Matrículas abertas",
      objective: "Conversions",
      audience: "Teachers",
    },
    derivation: {
      ctaText: null,
      format: "1:1",
      generationMode: "restyling" as const,
    },
    contract: {
      generationMode: "restyling" as const,
      targetFormat: "1:1",
      ctaSemantics: { kind: "inherited" as const },
      baseAssetId: "base-1",
      styleAssetId: "style-1",
      client: "Instituto Educação+",
      product: "Curso de capacitação docente",
      offer: "Matrículas abertas",
      constraints: null,
    },
  };

  it("flags invented brands in restyling briefMatch", () => {
    const prompt = buildCreativeQaPrompt(restylingInput);
    expect(prompt).toMatch(/never permission to add visible content/i);
    expect(prompt).toMatch(/not visibly present in FACTUAL BASE/i);
    expect(prompt).toMatch(/even when it exactly matches the campaign client/i);
    expect(prompt).toMatch(/wrong_brand/i);
    expect(prompt).toMatch(/invented_factual_entity/i);
  });

  it("fails style-reference ad paste in styleFidelity", () => {
    const prompt = buildCreativeQaPrompt(restylingInput);
    expect(prompt).toMatch(/full ad layout/i);
    expect(prompt).toMatch(/base-content restyled/i);
  });
});


// ---------------------------------------------------------------------------
// R-005 — Creative Work v1 objective QA
// ---------------------------------------------------------------------------

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe("inspectCreativeWorkImageFile (deterministic, no vision model)", () => {
  it("decodes a real PNG and reports its dimensions", async () => {
    const png = await makePng(1080, 1350);
    const result = await inspectCreativeWorkImageFile(png);
    expect(result).toMatchObject({
      ok: true,
      width: 1080,
      height: 1350,
      format: "png",
      bytes: png.byteLength,
      error: null,
    });
  });

  it("flags an undecodable buffer as not ok without throwing", async () => {
    const result = await inspectCreativeWorkImageFile(Buffer.from("not-an-image"));
    expect(result.ok).toBe(false);
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.bytes).toBe(Buffer.from("not-an-image").byteLength);
  });
});

describe("inspectExactCompositionAsset (deterministic binary preflight)", () => {
  it("decodes a valid PNG before composition", async () => {
    const png = await makePng(2, 2);
    await expect(inspectExactCompositionAsset(png)).resolves.toEqual({
      ok: true,
      width: 2,
      height: 2,
      hasUsableTransparency: false,
      error: null,
    });
  });

  it("rejects a truncated PNG", async () => {
    const png = await makePng(2, 2);
    const result = await inspectExactCompositionAsset(png.subarray(0, 20));
    expect(result.ok).toBe(false);
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.hasUsableTransparency).toBe(false);
  });

  it.each([
    ["opaque", 1, false],
    ["transparent", 0.5, true],
  ])("distinguishes %s RGBA pixels", async (_label, alpha, expectedTransparency) => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 30, b: 40, alpha } },
    }).png().toBuffer();
    await expect(inspectExactCompositionAsset(png)).resolves.toEqual({
      ok: true,
      width: 2,
      height: 2,
      hasUsableTransparency: expectedTransparency,
      error: null,
    });
  });
});

describe("normalizeCreativeWorkQaResult", () => {
  it("keeps valid findings and summary", () => {
    const result = normalizeCreativeWorkQaResult({
      findings: [
        { code: "unsupported_claim", status: "confirmed", confidence: 0.98, note: "Renderiza R$ 99 sem origem." },
        { code: "wrong_brand", status: "suspected", confidence: 0.64, note: "Logo pode ser de outra marca." },
      ],
      summary: "Um fato inventado.",
    });
    expect(result.findings).toEqual([
      { code: "unsupported_claim", status: "confirmed", confidence: 0.98, note: "Renderiza R$ 99 sem origem." },
      { code: "wrong_brand", status: "suspected", confidence: 0.64, note: "Logo pode ser de outra marca." },
    ]);
    expect(result.summary).toBe("Um fato inventado.");
  });

  it("drops unknown codes, invalid statuses and empty notes", () => {
    const result = normalizeCreativeWorkQaResult({
      findings: [
        { code: "generic_template_aesthetic", status: "confirmed", note: "Subjective — not allowed." },
        { code: "wrong_dimensions", status: "confirmed", note: "Deterministic — not model-assigned." },
        { code: "unusable_file", status: "confirmed", note: "Deterministic — not model-assigned." },
        { code: "wrong_brand", status: "maybe", note: "Invalid status." },
        { code: "wrong_brand", status: "confirmed", note: "   " },
      ],
      summary: "",
    });
    expect(result.findings).toEqual([]);
  });

  it("keeps one finding per code with confirmed winning over suspected", () => {
    const result = normalizeCreativeWorkQaResult({
      findings: [
        { code: "missing_required_fact", status: "suspected", note: "Talvez falte agosto." },
        { code: "missing_required_fact", status: "confirmed", note: "Agosto não aparece." },
      ],
    });
    expect(result.findings).toEqual([
      { code: "missing_required_fact", status: "confirmed", note: "Agosto não aparece." },
    ]);
  });

  it("keeps a valid art critique and drops an unjustified weak one", () => {
    const valid = normalizeCreativeWorkQaResult({
      findings: [],
      summary: "Ok.",
      artCritique: {
        verdict: "weak", problem: "Foco dividido", intervention: "Unificar foco",
        mode: "edit", preserve: ["facts"], evidence: ["Dois títulos dominantes"], confidence: "high",
      },
    });
    expect(valid.artCritique).toMatchObject({ verdict: "weak", mode: "edit" });

    // A weak verdict without problem/intervention/evidence is invalid: it
    // degrades to absent (inconclusive) instead of justifying a new image.
    const unjustified = normalizeCreativeWorkQaResult({
      findings: [],
      summary: "Ok.",
      artCritique: {
        verdict: "weak", problem: "", intervention: "", mode: "edit",
        preserve: [], evidence: [], confidence: "high",
      },
    });
    expect(unjustified).toEqual({ findings: [], summary: "Ok." });
    expect(normalizeCreativeWorkQaResult({ findings: [], summary: "Ok.", artCritique: null }))
      .toEqual({ findings: [], summary: "Ok." });
  });

  it("tolerates garbage input and caps findings", () => {
    expect(normalizeCreativeWorkQaResult(null)).toEqual({ findings: [], summary: "" });
    expect(normalizeCreativeWorkQaResult("junk")).toEqual({ findings: [], summary: "" });
    const many = normalizeCreativeWorkQaResult({
      findings: Array.from({ length: 9 }, (_, index) => ({
        code: index % 2 === 0 ? "wrong_brand" : "unsupported_claim",
        status: "confirmed",
        note: `n${index}`,
      })),
    });
    expect(many.findings.length).toBeLessThanOrEqual(6);
  });
});

describe("buildCreativeWorkQaPrompt", () => {
  const factPack = {
    version: 1 as const,
    request: "Promoção de agosto com vagas limitadas",
    facts: [
      { value: "agosto", class: "date" as const, required: true, origin: "request" as const },
      { value: "vagas limitadas", class: "condition" as const, required: true, origin: "request" as const },
      { value: "Curso de Psicologia", class: "product" as const, required: false, origin: "source" as const, sourceId: "src-1" },
    ],
    brand: { requiredElements: ["Logo no rodapé"], prohibitedElements: ["Concorrente X"] },
    identity: { clientProfileId: "profile-1", brandName: "Instituto Psi", brandAuthority: "active" as const },
  };

  const baseInput = {
    mode: "social_post" as const,
    format: "4:5",
    request: "Promoção de agosto com vagas limitadas",
    copy: { headline: "Últimas vagas", body: "Curso em agosto", cta: "Inscreva-se" },
    factPack,
    brandName: "Instituto Psi",
    locale: "pt-BR",
    references: [
      {
        role: "brand_identity" as const,
        label: "Mood",
        required: false,
        buffer: Buffer.from("ref"),
        mimeType: "image/png",
      },
    ],
  };

  it("includes declared identity and requested revision without claiming exact visual font verification", () => {
    const brandKit = {
      colors: ["#123456"], fonts: ["Inter"], requiredElements: "Logo", prohibitedElements: "Clipart",
      fontAssets: [{ assetKey: "PRIVATE_FONT_STORAGE_SENTINEL" }],
    };
    const prompt = buildCreativeWorkQaPrompt({
      ...baseInput,
      brandKit,
      revisionInstruction: "Aumente o título e preserve a oferta",
    });
    expect(prompt).toContain("#123456");
    expect(prompt).toContain("Inter");
    expect(prompt).toContain("Aumente o título e preserve a oferta");
    expect(prompt).toContain("Não declare verificação exata de arquivo de fonte por visão");
    expect(prompt).toContain("pequenas variações de estilo não são falha factual");
    expect(prompt).not.toContain("brand_visual_drift");
    expect(prompt).not.toContain("PRIVATE_FONT_STORAGE_SENTINEL");
  });

  it("embeds the fact pack with origins, required/allowed split and brand rules", () => {
    const prompt = buildCreativeWorkQaPrompt(baseInput);
    expect(prompt).toContain("FACT PACK — AUDITABLE FACTUAL CONTRACT:");
    expect(prompt).toContain("REQUEST: Promoção de agosto com vagas limitadas");
    expect(prompt).toContain('[date] "agosto" (origin: request)');
    expect(prompt).toContain('[condition] "vagas limitadas" (origin: request)');
    expect(prompt).toContain('[product] "Curso de Psicologia" (origin: source, source: src-1)');
    expect(prompt).toContain("BRAND NAME: Instituto Psi");
    expect(prompt).toContain("REQUIRED BRAND ELEMENTS: Logo no rodapé");
    expect(prompt).toContain("PROHIBITED BRAND ELEMENTS");
    expect(prompt).toContain("Concorrente X");
  });

  it("embeds the validated copy and positional references", () => {
    const prompt = buildCreativeWorkQaPrompt(baseInput);
    expect(prompt).toContain("HEADLINE: Últimas vagas");
    expect(prompt).toContain("CTA: Inscreva-se");
    expect(prompt).toMatch(/approved textual authority/i);
    expect(prompt).toMatch(/not an unsupported_claim merely because it is not repeated in the fact pack/i);
    expect(prompt).toContain('- #1 [brand_identity] "Mood"');
    expect(prompt).toContain("image #1 is the attached image in this position");
  });

  it("separates deterministic composition from mandatory reference authority", () => {
    const prompt = buildCreativeWorkQaPrompt(baseInput);
    expect(prompt).toMatch(/exact logo\/brand assets and approved copy may be composited after the provider image/i);
    expect(prompt).toMatch(/optional style and brand_identity references are never mandatory/i);
    expect(prompt).toMatch(/optional piece_visual references are also never mandatory/i);
    expect(prompt).toMatch(/only when a reference explicitly marked required is visibly omitted/i);
  });

  it("lists the objective codes and bans subjective signals from findings", () => {
    const prompt = buildCreativeWorkQaPrompt(baseInput);
    for (const code of [
      "missing_required_fact",
      "unsupported_claim",
      "wrong_brand",
      "style_reference_contamination",
      "ignored_mandatory_reference",
      "cropped_critical_content",
      "unreadable_required_text",
    ]) {
      expect(prompt).toContain(code);
    }
    expect(prompt).toMatch(/unreadable_required_text: factual text rendered by the output is illegible/);
    expect(prompt).toContain("dashed boxes, empty logo frames, placeholder plates");
    expect(prompt).toContain("A single official mark is expected; a second drawn duplicate is wrong_brand");
    expect(prompt).toMatch(/SUBJECTIVE signals scored elsewhere/i);
    expect(prompt).toMatch(/confirmed.*ONLY when you are visually certain/i);
    // Deterministic checks are explicitly out of the evaluator's scope.
    expect(prompt).toMatch(/Dimensions and file integrity are validated deterministically elsewhere/i);
  });

  it("falls back to the request as sole authority when no fact pack was frozen", () => {
    const prompt = buildCreativeWorkQaPrompt({ ...baseInput, factPack: null });
    expect(prompt).toContain("no frozen fact pack");
    expect(prompt).toContain("REQUEST: Promoção de agosto com vagas limitadas");
    expect(prompt).not.toContain("REQUIRED FACTS");
  });

  it("restyle mode separates content authority from style authority", () => {
    const prompt = buildCreativeWorkQaPrompt({
      ...baseInput,
      mode: "restyling",
      references: [
        { role: "content", label: "Content source", required: true, buffer: Buffer.from("c"), mimeType: "image/png" },
        { role: "style", label: "Style source", required: true, buffer: Buffer.from("s"), mimeType: "image/png" },
      ],
    });
    expect(prompt).toContain("MODE POLICY — RESTYLE:");
    expect(prompt).toMatch(/STYLE authority transfers only palette, typography, texture, light, rhythm and atmosphere/i);
    expect(prompt).toContain('- #1 [content] "Content source" (required)');
    expect(prompt).toContain('- #2 [style] "Style source" (required)');
  });

  it("requests the art critique only when enabled, keeping the objective contract otherwise", () => {
    const enabled = buildCreativeWorkQaPrompt({ ...baseInput, artCritique: { enabled: true } });
    expect(enabled).toContain("ART-DIRECTION CRITIQUE");
    expect(enabled).toContain("nota isolada não justifica nova imagem");
    expect(enabled).toContain('"artCritique"');

    const legacy = buildCreativeWorkQaPrompt(baseInput);
    expect(legacy).not.toContain("ART-DIRECTION CRITIQUE");
    expect(legacy).not.toContain('"artCritique"');
  });

  it("adaptation mode demands the same piece", () => {
    const prompt = buildCreativeWorkQaPrompt({ ...baseInput, mode: "format_adaptation" });
    expect(prompt).toContain("MODE POLICY — FORMAT ADAPTATION:");
    expect(prompt).toMatch(/SAME piece as the original art/i);
    expect(prompt).toMatch(/reinvents the concept, drops the original art/i);
  });
});

describe("analyzeCreativeWorkQa controlled E2E seam", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns deterministic empty findings without calling the vision model", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("APP_URL", "http://localhost:3000");

    const result = await analyzeCreativeWorkQa({
      imageBuffer: Buffer.from("controlled"),
      mimeType: "image/png",
      mode: "social_post",
      format: "1:1",
      request: "Promoção de agosto",
      copy: { headline: "H", body: "B", cta: "C" },
      factPack: null,
      brandName: "ADScale",
      references: [],
      locale: "pt-BR",
    });

    expect(result.findings).toEqual([]);
    expect(result.summary).toContain("Deterministic");
  });
});

describe("person fidelity assessment (plan 03, T3)", () => {
  afterEach(() => vi.unstubAllEnvs());

  const people = [{ personId: "11111111-1111-4111-8111-111111111111" }];

  it("asks for anatomy-only comparison with free staging", () => {
    const prompt = buildPersonFidelityPrompt({
      people: [{
        personId: people[0]!.personId,
        name: "Ana",
        preserve: ["sinal na bochecha"],
        buffer: Buffer.from("ref"),
        mimeType: "image/jpeg",
      }],
      locale: "pt-BR",
    });
    expect(prompt).toContain("Ana");
    expect(prompt).toContain("sinal na bochecha");
    expect(prompt).toContain("FREE");
    expect(prompt).toContain("inconclusive");
    expect(prompt).toContain("no similarity scores");
  });

  it("fills every missing person with inconclusive instead of an empty array", () => {
    const result = normalizePersonFidelityResult({ findings: [] }, people, "indisponível");
    expect(result.findings).toEqual([{
      personId: people[0]!.personId,
      status: "inconclusive",
      evidence: [],
      issue: "indisponível",
    }]);
  });

  it("drops unknown personIds and degrades evidence-less mismatch to doubt", () => {
    const result = normalizePersonFidelityResult({
      findings: [
        { personId: "99999999-9999-4999-8999-999999999999", status: "mismatch", evidence: ["x"], issue: null },
        { personId: people[0]!.personId, status: "mismatch", evidence: [], issue: "vago" },
      ],
    }, people, "indisponível");
    expect(result.findings).toEqual([{
      personId: people[0]!.personId,
      status: "inconclusive",
      evidence: [],
      issue: "vago",
    }]);
  });

  it("resolves duplicate findings worst-first and keeps mismatch evidence", () => {
    const result = normalizePersonFidelityResult({
      findings: [
        { personId: people[0]!.personId, status: "consistent", evidence: [], issue: null },
        { personId: people[0]!.personId, status: "mismatch", evidence: ["rosto trocado"], issue: "troca" },
      ],
    }, people, "indisponível");
    expect(result.findings).toEqual([{
      personId: people[0]!.personId,
      status: "mismatch",
      evidence: ["rosto trocado"],
      issue: "troca",
    }]);
  });

  it("returns consistent findings under the controlled E2E provider", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const result = await analyzePersonFidelity({
      imageBuffer: Buffer.from("out"),
      mimeType: "image/png",
      people: [{
        personId: people[0]!.personId,
        name: "Ana",
        preserve: [],
        buffer: Buffer.from("ref"),
        mimeType: "image/jpeg",
      }],
      locale: "pt-BR",
    });
    expect(result.findings).toEqual([{
      personId: people[0]!.personId,
      status: "consistent",
      evidence: [],
      issue: null,
    }]);
  });
});

describe("art comparison judge (plan 04, T3)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("asks for concrete fixes and regressions with a tie default", () => {
    const prompt = buildArtComparisonPrompt({
      brief: "Promo de agosto",
      beforeProblem: "Foco dividido",
      afterProblem: null,
      locale: "pt-BR",
    });
    expect(prompt).toContain("Promo de agosto");
    expect(prompt).toContain("Foco dividido");
    expect(prompt).toContain("BEFORE");
    expect(prompt).toContain("AFTER");
    expect(prompt).toContain("regressions");
    expect(prompt).toContain("A tie keeps BEFORE");
  });

  it("degrades an unknown winner to a tie and trims every list to bounds", () => {
    const result = normalizeArtComparisonResult({
      winner: "intruder",
      reason: "",
      fixedIssues: ["  foco  ", "", 42, "x".repeat(500)],
      regressions: "not-a-list",
    }, "Reserva.");
    expect(result).toEqual({
      winner: "tie",
      reason: "Reserva.",
      fixedIssues: ["foco", "x".repeat(300)],
      regressions: [],
    });
  });

  it("returns a deterministic tie under the controlled E2E provider", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_CONTROLLED_PROVIDER", "true");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const result = await analyzeArtComparison({
      brief: "Promo",
      beforeImageBuffer: Buffer.from("a"),
      afterImageBuffer: Buffer.from("b"),
      mimeType: "image/png",
      beforeProblem: "Foco dividido",
      afterProblem: null,
      locale: "pt-BR",
    });
    expect(result).toEqual({
      winner: "tie",
      reason: "Comparação inconclusiva; a versão anterior foi mantida.",
      fixedIssues: [],
      regressions: [],
    });
  });
});
