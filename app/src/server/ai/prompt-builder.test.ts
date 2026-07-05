import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4o",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildDerivationPrompt,
  extractPromptCanonicalContractSection,
  extractPromptHardRulesSection,
  extractPromptIntegritySection,
  extractPromptModeSection,
  extractPromptPerModeRulesSection,
  extractPromptRestylingFactualSourceSection,
} from "./prompt-builder";
import {
  extractPromptGenerationDirectionSection,
  GENERATION_DIRECTION_HEADER,
} from "./olhar/generation-direction";
import {
  buildInputClassificationPromptSection,
  buildVisualReferenceTransferRuleSection,
  CONTAMINATION_FAILURE_CODES,
  extractPromptInputClassificationSection,
  extractPromptVisualReferenceTransferSection,
  resolveInputSourceClassification,
} from "./factual-visual-separation";
import {
  buildFormatAdaptationModeRulesSection,
  shouldIncludeCompetitorAnalysesForMode,
  shouldIncludePlanHooksForMode,
} from "./per-mode-prompt-rules";
import {
  artVariationContractFixture,
  derivationConfigFromContract,
  formatAdaptationApprovedDerivationContractFixture,
  formatAdaptationCampaignAssetContractFixture,
  restylingContractFixture,
} from "./prompt-builder.test-fixtures";

describe("buildDerivationPrompt", () => {
  it("injects generation direction after hard rules and before flexible strategy", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), {
        plan: {
          id: "plan-1",
          strategy: "Use a playful summer concept",
          angles: ["Seasonal freshness"],
          hooks: ["Oferta por tempo limitado"],
          ctas: ["Ver ofertas"],
        },
        feedback: "Tighten the invite rhythm",
      })
    );

    const hardRulesIdx = prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT");
    const directionIdx = prompt.indexOf(GENERATION_DIRECTION_HEADER);
    const modeIdx = prompt.indexOf("MODE: art_variation");
    const strategyIdx = prompt.indexOf("Creative Strategy: Use a playful summer concept");
    const feedbackIdx = prompt.indexOf("Revision Feedback: Tighten the invite rhythm");

    expect(hardRulesIdx).toBeGreaterThan(-1);
    expect(directionIdx).toBeGreaterThan(hardRulesIdx);
    expect(modeIdx).toBeGreaterThan(directionIdx);
    expect(strategyIdx).toBeGreaterThan(directionIdx);
    expect(feedbackIdx).toBeGreaterThan(directionIdx);

    const direction = extractPromptGenerationDirectionSection(prompt);
    expect(direction).toContain("Sacred facts");
    expect(direction).toContain("Allowed variation");
    expect(direction).toMatch(/anti-patterns/i);
  });

  it("section order: Olhar before brand-taste before corpus_quality", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), {
        brandTasteSection: [
          "BRAND TASTE CONSTRAINTS (approved calibration rules — bounded, do not override export safety):",
          "[brand-taste:rule-1] voice: Warm invitation tone",
        ],
        corpusQualitySection: [
          "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
          "[corpus-quality:corpus-1] corpus_quality: Keep CTA visible",
        ],
      })
    );

    const olharIdx = prompt.indexOf(GENERATION_DIRECTION_HEADER);
    const brandIdx = prompt.indexOf("BRAND TASTE CONSTRAINTS");
    const corpusIdx = prompt.indexOf("CORPUS QUALITY CONSTRAINTS");

    expect(olharIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeGreaterThan(-1);
    expect(corpusIdx).toBeGreaterThan(-1);
    expect(olharIdx).toBeLessThan(brandIdx);
    expect(brandIdx).toBeLessThan(corpusIdx);
  });

  it("does not inject unapproved Cenbrap voice by default", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      campaign: {
        id: "camp-1",
        workspaceId: "ws-1",
        name: "CENBRAP NR1",
        client: "CENBRAP",
        product: "NR1 compliance",
        objective: "NR1 compliance",
        audience: null,
        platforms: ["Meta"],
        tone: null,
        offer: "Conformidade NR1",
        constraints: null,
        notes: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(prompt).toContain(GENERATION_DIRECTION_HEADER);
    expect(prompt).not.toContain("CLIENT VOICE — Cenbrap");
  });

  it("places hard rules before flexible creative guidance", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Comprar agora",
      plan: {
        id: "plan-1",
        strategy: "Use a playful summer concept",
        angles: ["Seasonal freshness"],
        hooks: ["Oferta por tempo limitado"],
        ctas: ["Ver ofertas"],
      },
    });

    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeGreaterThan(-1);
    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("Creative Strategy: Use a playful summer concept")
    );
    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).toContain("Preserve the intended action when a CTA is rendered");
    expect(prompt).toContain("Facts are fixed; headline and supporting expression are flexible");
    expect(prompt).not.toContain("CTA text above is MANDATORY and FINAL");
    expect(prompt).not.toContain("must appear verbatim");
  });

  it("describes the reference as approved winner for package format adaptation", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      packageSource: "approved_derivation",
      ctaText: "Comprar agora",
    });

    expect(prompt).toContain("approved winning creative");
    expect(prompt).toContain("Target format: 9:16");
    expect(prompt).toContain("Comprar agora");
    expect(prompt).toContain("Reference Asset: approved winning derivation output");
    expect(prompt).not.toContain("No reference asset was found");
  });

  it("treats format adaptation as a native layout rebuild without blurred bars or crowding", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      ctaText: "Comprar agora",
    });

    expect(prompt).toContain("This is a layout adaptation, not a resized poster");
    expect(prompt).toContain("no blurred side/top/bottom bars");
    expect(prompt).toContain("no crowded cluster");
    expect(prompt).toContain("Build clear zones with gutters and whitespace");
    expect(prompt).toContain("Do not squeeze the square layout into the center");
  });

  it("does not include approved winner text for campaign asset source", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "4:5",
      packageSource: "campaign_asset",
      ctaText: "Shop Now",
    });

    expect(prompt).not.toContain("approved winning creative");
    expect(prompt).toContain("Target format: 4:5");
  });

  it("does not include approved winner text when packageSource is omitted", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "1:1",
    });

    expect(prompt).not.toContain("approved winning creative");
    expect(prompt).toContain("Target format: 1:1");
  });

  it("includes art_variation mode instructions", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
    });

    expect(prompt).toContain("MODE: art_variation");
    expect(prompt).toMatch(/DECORATIVE-ONLY|decorative-only/i);
    expect(prompt).toMatch(/READING PATH AND GESTALT BUDGET|reading-path anchors/i);
    expect(prompt).toContain("MANDATORY PRESERVATION");
    expect(prompt).toContain("ANTI-CROPPING RULE");
    expect(prompt).toContain("REARRANGEMENT RULE");
    expect(prompt).toContain("LAYOUT SAFETY PASS");
    expect(prompt).toContain("SAFE MARGIN GUIDANCE");
    expect(prompt).toContain("BRAND LOCKUP RULE");
    expect(prompt).toContain("THUMBNAIL LEGIBILITY GUIDANCE");
  });

  it("requires art_variation to preserve visible ad information while rearranging", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Teste agora",
      campaign: {
        id: "campaign-1",
        workspaceId: "workspace-1",
        name: "Campaign",
        client: "ADScale",
        product: null,
        objective: "Lead generation",
        audience: null,
        platforms: ["Meta"],
        tone: null,
        offer: "Auditoria gratuita",
        constraints: "Preservar selo LGPD",
        notes: null,
        status: "draft",
        createdAt: new Date("2026-05-21"),
        updatedAt: new Date("2026-05-21"),
      },
      asset: {
        id: "asset-1",
        campaignId: "campaign-1",
        workspaceId: "workspace-1",
        key: "uploads/reference.png",
        type: "image/png",
        size: 10,
        width: 1080,
        height: 1080,
        createdAt: new Date("2026-05-21"),
      },
    });

    expect(prompt).toContain("mandatory tier");
    expect(prompt).toContain("hook/headline, offer/proof, logo if present, product/subject");
    expect(prompt).toContain("do not crop, hide, truncate, blur, or cover");
    expect(prompt).toContain("mandatory-tier content remains visible, readable, and intentionally arranged");
    expect(prompt).toContain("reduce scale and rebalance whitespace instead of cropping");
    expect(prompt).toContain("around 8% of the width/height is a useful default");
    expect(prompt).not.toContain("at least 8% of the canvas");
    expect(prompt).toContain("do not place vertical or horizontal logos flush against any edge");
    expect(prompt).toContain("condensable information such as duration");
    expect(prompt).toContain("Condense or omit condensable and decorative modules per RULE PRECEDENCE");
    expect(prompt).toContain("Rearrange the ad, do not crop out mandatory-tier content");
    expect(prompt).toContain("BRIEF-BASED PRESERVATION FALLBACK");
    expect(prompt).toContain("Brand/product from brief: ADScale");
    expect(prompt).toContain("CTA action intent from brief: Teste agora");
    expect(prompt).toContain("Reference asset dimensions: 1080x1080px");
  });

  it("uses approved creative diagnosis instead of fallback preservation when present", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      creativeDiagnosis: {
        detectedConcept: "A high-urgency offer ad",
        elementsToPreserve: ["headline: Oferta relampago", "CTA: Comprar agora"],
        variationOpportunities: ["Rebalance text hierarchy"],
      },
    });

    expect(prompt).toContain("APPROVED CREATIVE DIAGNOSIS");
    expect(prompt).toContain("headline: Oferta relampago");
    expect(prompt).not.toContain("BRIEF-BASED PRESERVATION FALLBACK");
  });

  it("includes restyling mode instructions", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
    });

    expect(prompt).toContain("MODE: restyling");
    expect(prompt).toMatch(/entity lock|base-locked|FACTUAL ENTITY LOCK/i);
  });

  it("renders client references under CLIENT REFERENCE LIBRARY section", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      clientReferences: [
        { id: "r1", kind: "style", label: "Hero shot", notes: "Use warm tones", assetKey: "assets/hero.png" },
        { id: "r2", kind: "negative", label: "Old layout", notes: "Avoid clutter", assetKey: "assets/old.png" },
      ],
    });

    expect(prompt).toContain("CLIENT REFERENCE LIBRARY:");
    expect(prompt).toContain("style: Hero shot. Use as auxiliary visual guidance");
    expect(prompt).toContain("negative: Old layout. Avoid repeating this pattern");
    expect(prompt).toContain("These references are auxiliary context only");
    expect(prompt).toContain("must not override the primary campaign asset, factual content, target format, or campaign constraints");
  });

  it("does not include CLIENT REFERENCE LIBRARY when no references provided", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
    });

    expect(prompt).not.toContain("CLIENT REFERENCE LIBRARY:");
  });

  it("keeps explicit CTA text visible as action reference with client references", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Buy Now",
      clientReferences: [
        { id: "r1", kind: "style", label: "Hero", notes: null, assetKey: "assets/hero.png" },
      ],
    });

    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).toContain("Buy Now");
    expect(prompt).toContain("CLIENT REFERENCE LIBRARY:");
  });

  it("renders brand memory as auxiliary context without overriding hard rules", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "9:16",
      ctaText: "Comprar agora",
      brandMemory: {
        items: [
          {
            source: "fact",
            text: "This brand previously used CTA text Ver ofertas.",
          },
        ],
        block: [
          "BRAND MEMORY / LEARNED CONTEXT:",
          "- This brand previously used CTA text Ver ofertas.",
          "",
          "These learned patterns are auxiliary context only. They must not override the literal CTA, source image, target format, campaign constraints, or generation mode.",
        ].join("\n"),
      },
    });

    expect(prompt).toContain("BRAND MEMORY / LEARNED CONTEXT:");
    expect(prompt).toContain("This brand previously used CTA text Ver ofertas.");
    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).toContain("Comprar agora");
    expect(prompt).not.toContain("must appear verbatim");
    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("BRAND MEMORY / LEARNED CONTEXT:")
    );
    expect(prompt).toContain("Target format: 9:16");
  });

  it("keeps target format and pt-BR visible text requirements in hard rules", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      locale: "pt-BR",
      ctaText: "Agende agora",
    });

    const hardRulesIndex = prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT");
    expect(hardRulesIndex).toBeGreaterThan(-1);
    expect(prompt.indexOf("Target format: 9:16")).toBeGreaterThan(hardRulesIndex);
    expect(prompt.indexOf("IDIOMA OBRIGATORIO")).toBeGreaterThan(hardRulesIndex);
    expect(prompt).toContain("todo texto visivel, CTA, chamada, legenda e direcao textual deve estar em portugues brasileiro");
  });

  it("includes brand kit colors, fonts, and tone when brandKit is provided", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      brandKit: {
        name: "Acme Brand",
        colors: ["#FF0000", "#00FF00"],
        fonts: ["Montserrat", "Open Sans"],
        toneOfVoice: "Bold and energetic",
        description: "Premium tech brand",
      },
    });

    expect(prompt).toContain("--- BRAND KIT GUIDELINES ---");
    expect(prompt).toContain("Brand Colors: #FF0000, #00FF00");
    expect(prompt).toContain("Brand Fonts: Montserrat, Open Sans");
    expect(prompt).toContain("Tone of Voice: Bold and energetic");
    expect(prompt).toContain("--- END BRAND KIT ---");
  });

  it("includes competitor context when competitorAnalyses is provided", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      competitorAnalyses: [
        {
          visualPatterns: {
            colors: ["blue", "white"],
            composition: "Centered product with text overlay",
            typography: "Sans-serif bold",
          },
          messaging: {
            headlineStyle: "Direct benefit-driven",
            ctaStyle: "High contrast button",
            offerType: "Percentage discount",
          },
          strengths: ["Strong color contrast", "Clear CTA"],
          weaknesses: ["Cluttered layout"],
          differentiationOpportunities: ["Use warmer tones"],
        },
      ],
    });

    expect(prompt).toContain("--- Competitor Analysis Context ---");
    expect(prompt).toContain("Competitor 1:");
    expect(prompt).toContain("Colors: blue, white");
    expect(prompt).toContain("Strengths: Strong color contrast; Clear CTA");
    expect(prompt).toContain("Weaknesses: Cluttered layout");
    expect(prompt).toContain("Opportunities: Use warmer tones");
    expect(prompt).toContain("--- End Competitor Context ---");
  });

  it("includes pre-flight analysis when preflightResult is provided", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      preflightResult: {
        overallScore: 82,
        breakdown: {
          technicalQuality: { score: 90, suggestion: "Good resolution" },
          textLegibility: { score: 75, suggestion: "Text slightly small" },
          visualHierarchy: { score: 85, suggestion: "Clear hierarchy" },
          ctaProminence: { score: 80, suggestion: "CTA visible" },
          composition: { score: 88, suggestion: "Well balanced" },
          brandConsistency: { score: 82, suggestion: "On brand" },
          platformReadiness: { score: 78, suggestion: "Suitable for Meta" },
        },
        criticalIssues: ["Headline may be hard to read on mobile"],
        suggestions: ["Increase headline font size", "Add more contrast to CTA"],
        technical: {
          actualWidth: 1080,
          actualHeight: 1080,
          claimedWidth: null,
          claimedHeight: null,
          aspectRatio: "1:1",
          format: "png",
          fileSizeBytes: 204800,
          hasAlpha: true,
          estimatedContrast: 0.72,
        },
      },
    });

    expect(prompt).toContain("--- PRE-FLIGHT ASSET ANALYSIS ---");
    expect(prompt).toContain("## Pre-flight Analysis Results");
    expect(prompt).toContain("Overall Score: 82/100");
    expect(prompt).toContain("Headline may be hard to read on mobile");
    expect(prompt).toContain("Increase headline font size");
    expect(prompt).toContain("--- END PRE-FLIGHT ---");
  });
});

describe("prompt contract regression helpers", () => {
  it("extracts compact sections without the full prompt body", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    const hardRules = extractPromptHardRulesSection(prompt);
    const mode = extractPromptModeSection(prompt);

    expect(hardRules.length).toBeLessThan(prompt.length * 0.35);
    expect(mode.length).toBeLessThan(prompt.length * 0.5);
    expect(hardRules).toContain("HARD RULES / NON-NEGOTIABLE CONTRACT");
    expect(mode).toContain("MODE: art_variation");
    expect(hardRules).not.toContain("Creative Strategy:");
  });
});

describe("art variation contract (AIC-02)", () => {
  it("preserves creative level, mandatory facts, and hard-rule precedence", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), {
        creativeLevel: "bold",
      })
    );

    expect(prompt).toContain("CREATIVITY LEVEL: bold");
    expect(prompt).toContain("OPERATIONAL RULES FOR BOLD");
    expect(prompt).toContain("mandatory tier");
    expect(prompt).toContain("hook/headline, offer/proof, logo if present, product/subject");
    expect(prompt).toContain("CONSOLIDATION (condensable tier only)");
    expect(prompt).toMatch(/composition mechanism|focal hierarchy|CREATIVE MECHANISM/i);
    expect(prompt).toContain("Do not invent a new brand");

    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("Creative Strategy:")
    );
    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("BRAND MEMORY / LEARNED CONTEXT:")
    );
    expect(prompt.indexOf("HARD RULES / NON-NEGOTIABLE CONTRACT")).toBeLessThan(
      prompt.indexOf("Revision Feedback:")
    );
    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).not.toContain("CTA text above is MANDATORY and FINAL");
    expect(prompt).not.toContain("must appear verbatim");

    expect(prompt).toContain("Client/Product: Acme Corp");
    expect(prompt).toContain("Offer from brief: Auditoria gratuita");
    expect(prompt).toContain("Constraints: Preserve LGPD badge");
    expect(prompt).toContain("Target format: 1:1");
  });

  it("uses inherited CTA semantics without no-CTA language", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(
        artVariationContractFixture({
          ctaSemantics: { kind: "inherited" },
        }),
        { ctaText: null, plan: undefined }
      )
    );

    expect(prompt).toContain("CTA reference (optional): inherit from reference");
    expect(prompt).not.toContain("no CTA required");
  });

  it("snapshots the art variation hard-rule section", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    expect(extractPromptHardRulesSection(prompt)).toMatchInlineSnapshot(`
      "HARD RULES / NON-NEGOTIABLE CONTRACT:
      - Target format: 1:1. This target format overrides any flexible layout suggestion.
      - CRITICAL LOGO RULE: Do NOT invent a logo. Preserve the logo ONLY if it already exists in the reference asset. If no logo is visible in the reference, do not add one.
      - FACTUAL INTEGRITY PRECEDENCE: brand, product, price, conditions, dates, and claims must remain correct; factual accuracy outranks requested fidelity, and fidelity outranks art direction.
      - Creative strategy, diagnosis, feedback, and client references are flexible guidance only; they must not override these hard rules."
    `);
  });
});

describe("format adaptation contract (AIC-03)", () => {
  it("requires native layout rebuild and rejects poster padding patterns", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationCampaignAssetContractFixture())
    );

    expect(prompt).toContain("headline, photo/subject, offer or proof, CTA, logo, badges, legal copy, and decorative background");
    expect(prompt).toContain("layout adaptation, not a resized poster");
    expect(prompt).toContain("No blank bands, blurred padding, or letterboxing");
    expect(prompt).toContain("no blurred side/top/bottom bars");
    expect(prompt).toContain("no poster pasted over a background");
    expect(prompt).toContain("no stretched edge filler");
    expect(prompt).toContain("no crowded cluster");
    expect(prompt).toContain("same campaign and visual system");
    expect(prompt).toContain("may condense or rewrite non-factual copy");
    expect(prompt).not.toContain("keeping all copy and facts verbatim");
    expect(prompt).toContain("PRESERVE FACTS, FLEX EXPRESSION");
    expect(prompt).toContain("VISUAL PROMINENCE");
    expect(prompt).toContain("factual completeness does not require equal visual weight");
    expect(prompt).toContain("only decorative background may bleed to the edges");
    expect(prompt).toContain("upper zone");
    expect(prompt).toContain("middle zone");
    expect(prompt).toContain("lower zone");
  });

  it("snapshots approved_derivation source-package mode section", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationApprovedDerivationContractFixture(), {
        packageSource: "approved_derivation",
        asset: undefined,
      })
    );

    expect(prompt).toContain("approved winning creative");
    expect(prompt).toContain("Do not return to the original campaign asset");
    expect(extractPromptModeSection(prompt)).toMatchInlineSnapshot(`
      "MODE: format_adaptation — You are EDITING an existing ad to fit a DIFFERENT aspect ratio.
      CAMPAIGN IDENTITY LOCK:
      - This is an EDIT of the same campaign and visual system — preserve people, factual copy meaning, brand, and concept.
      - Composition, scale, grouping, safe margins, and non-factual copy expression may change.
      - Do not recreate the ad as a new concept or introduce a different narrative.
      Dominant idea (must not change): Lead generation
      You can see the original image. Rebuild the layout for the target format within the same campaign and visual system; facts stay fixed, and you may condense or rewrite non-factual copy (headlines, subheads, supporting lines) to fit the new frame.
      This is a layout adaptation, not a resized poster. Treat the source ad as separate modules: headline, photo/subject, offer or proof, CTA, logo, badges, legal copy, and decorative background.
      PRESERVE FACTS, FLEX EXPRESSION: the original photo/subject, logo, brand colors, offer/discount facts, prices, dates, and legal meaning must stay correct; non-factual copy may be condensed or rewritten, and a rendered CTA must preserve its action intent.
      VISUAL PROMINENCE: factual completeness does not require equal visual weight. The three information zones from VISUAL HIERARCHY CONTRACT and CANONICAL CREATIVE CONTRACT — hook, proof/offer, and CTA — are a proven default; decorative chrome, badges, and icon rows may shrink or yield to clear zones.
      PRESERVE VISUAL IDENTITY: background color/texture, decorative shapes, icons, and graphic panels should remain recognizable but may be resized or repositioned for the target format.
      DO NOT: create new photos, invent new facts or offers, add unrelated elements, change factual colors, or invent new brand assets.
      Target format: 9:16. Rearrange the existing elements into a native composition for this format. Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or letterboxing.
      HARD LAYOUT FAILURES TO AVOID: no blurred side/top/bottom bars, no poster pasted over a background, no stretched edge filler, no crowded cluster of text/photo/CTA/logo, no overlapping information modules.
      Build clear zones with gutters and whitespace. Keep headline, supporting copy, CTA, logo, badges, legal copy, faces, and products inside a central safe area; only decorative background may bleed to the edges.
      The result must be immediately recognizable as the same ad — same campaign and visual system, just fitting a different frame.
      CROSS-FORMAT IDENTITY:
      - The 1:1, 4:5, and 9:16 outputs must remain the SAME campaign: identical people, brand, factual content, and dominant idea.
      - Do not introduce a new narrative, new hero photo, new offer, or new concept when adapting aspect ratio.
      - Composition, scale, grouping, safe margins, and non-factual copy expression may adapt to the format.
      The uploaded reference image is the approved winning creative from this campaign.
      Preserve this winner's product, offer, factual copy meaning, CTA action intent, brand cues, and design identity.
      Only rearrange the approved winner into the target format. Do not return to the original campaign asset or invent a new concept.
      For 9:16 (vertical story): create a tall story layout with separate vertical zones — for example, upper zone for headline/brand hook, middle zone for the photo or main visual, lower zone for offer/proof/CTA/logo. Do not squeeze the square layout into the center."
    `);
  });

  it("includes 4:5 portrait-feed guidance when target format is 4:5", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(
        formatAdaptationCampaignAssetContractFixture({ targetFormat: "4:5" }),
        { targetFormat: "4:5" }
      )
    );

    expect(prompt).toContain("portrait-feed layout");
    expect(prompt).toContain("CTA/logo their own clean area");
  });
});

describe("restyling contract (AIC-04)", () => {
  it("separates base factual content from style-reference visual language", async () => {
    const contract = restylingContractFixture();
    const prompt = await buildDerivationPrompt(derivationConfigFromContract(contract));

    expect(contract.baseAssetId).toBe("asset-base-1");
    expect(contract.styleAssetId).toBe("asset-style-1");

    const factual = extractPromptRestylingFactualSourceSection(prompt);
    expect(factual).toContain("base image is the ONLY source of factual content");
    expect(factual).toMatch(/brand name|product name|offer|CTA|price|course name|logo/i);
    expect(factual).toContain("style reference provides visual language");
    expect(factual).toContain("color, typography style, layout composition, mood");
    expect(factual).toContain("Do NOT copy factual claims");

    expect(prompt).toMatch(/entity lock|base-locked|FACTUAL ENTITY LOCK/i);
    expect(prompt).toMatch(/VISUAL REFERENCE TRANSFER RULE|abstract style attributes/i);
    expect(prompt).toMatch(/preserve.*CTA|base image contains the factual CTA/i);
    expect(prompt).not.toContain("no CTA required");
  });

  it("snapshots the restyling factual-source section", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(restylingContractFixture())
    );
    expect(extractPromptRestylingFactualSourceSection(prompt)).toMatchInlineSnapshot(`
      "RESTYLING FACTUAL-SOURCE RULE:
      The base image is the ONLY source of factual content (brand name, product name, offer, CTA, price, course name, logo). The style reference provides visual language (color, typography style, layout composition, mood) only. Do NOT copy factual claims, text, prices, offers, brand names, or CTAs from the style reference into the output."
    `);
  });
});

describe("visual reference transfer", () => {
  const allowlistTerms = [
    "ritmo",
    "textura",
    "cromia",
    "tipografia",
    "iluminação",
    "lógica compositiva",
  ];
  const denylistTerms = [
    "pessoas",
    "uniformes",
    "produtos",
    "marcas",
    "logos",
    "textos",
    "alegações",
  ];

  it("buildVisualReferenceTransferRuleSection includes SEP-02 allowlist and denylist", async () => {
    const section = buildVisualReferenceTransferRuleSection().join("\n");
    expect(section).toContain("VISUAL REFERENCE TRANSFER RULE:");
    for (const term of allowlistTerms) {
      expect(section).toContain(term);
    }
    for (const term of denylistTerms) {
      expect(section).toContain(term);
    }
    expect(section).toMatch(/sole factual source/i);
    expect(section).toMatch(/Never copy factual content from the style reference/i);
  });

  it("extractPromptVisualReferenceTransferSection extracts block before next major section", async () => {
    const prompt = [
      "prefix",
      "VISUAL REFERENCE TRANSFER RULE:",
      "- ritmo, textura",
      "RESTYLING FACTUAL-SOURCE RULE:",
      "rule text",
      "MODE: restyling",
    ].join("\n");
    const section = extractPromptVisualReferenceTransferSection(prompt);
    expect(section).toContain("VISUAL REFERENCE TRANSFER RULE:");
    expect(section).toContain("ritmo");
    expect(section).not.toContain("RESTYLING FACTUAL-SOURCE RULE:");
  });

  it("restyling prompt contains allowlist terms and denylist terms", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(restylingContractFixture())
    );
    const section = extractPromptVisualReferenceTransferSection(prompt);
    expect(section).toContain("VISUAL REFERENCE TRANSFER RULE:");
    for (const term of allowlistTerms) {
      expect(prompt).toContain(term);
    }
    for (const term of denylistTerms) {
      expect(prompt).toContain(term);
    }
  });

  it("art_variation prompt does NOT contain VISUAL REFERENCE TRANSFER RULE header", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    expect(prompt).not.toContain("VISUAL REFERENCE TRANSFER RULE:");
  });
});

describe("input classification", () => {
  it("maps campaign_asset to campaign base asset factual label", async () => {
    const contract = artVariationContractFixture();
    const classification = resolveInputSourceClassification(contract, {
      hasBrandKit: false,
      clientReferenceCount: 0,
      packageSource: "campaign_asset",
    });

    expect(classification.factualBase.role).toBe("factual_base");
    expect(classification.factualBase.label).toContain("campaign base asset");
    expect(classification.visualReference).toBeNull();
    expect(classification.brandKit).toBeNull();
    expect(classification.auxiliaryReferences.count).toBe(0);
  });

  it("maps approved_derivation package to approved parent factual label", async () => {
    const contract = formatAdaptationApprovedDerivationContractFixture();
    const classification = resolveInputSourceClassification(contract, {
      hasBrandKit: false,
      clientReferenceCount: 0,
      packageSource: "approved_derivation",
    });

    expect(classification.factualBase.label).toContain("approved parent");
  });

  it("includes visual_reference when styleAssetId is set", async () => {
    const contract = restylingContractFixture();
    const classification = resolveInputSourceClassification(contract, {
      hasBrandKit: false,
      clientReferenceCount: 0,
    });

    expect(classification.visualReference).toEqual(
      expect.objectContaining({ role: "visual_reference" })
    );
  });

  it("buildInputClassificationPromptSection emits required header and role lines", async () => {
    const section = buildInputClassificationPromptSection(
      resolveInputSourceClassification(restylingContractFixture(), {
        hasBrandKit: true,
        clientReferenceCount: 2,
        packageSource: "campaign_asset",
      })
    ).join("\n");

    expect(section).toContain("INPUT SOURCE CLASSIFICATION:");
    expect(section).toContain(
      "sole source of people, products, brands, logos, copy, offers, CTAs, claims"
    );
    expect(section).toContain("Visual reference:");
    expect(section).toContain("Brand kit:");
    expect(section).toContain("Auxiliary references (2):");
  });

  it("extractPromptInputClassificationSection returns text before MODE block", async () => {
    const prompt = [
      "prefix",
      "INPUT SOURCE CLASSIFICATION:",
      "- Factual base: campaign base asset — sole source of people, products, brands, logos, copy, offers, CTAs, claims.",
      "- Visual reference: none.",
      "MODE: art_variation — test",
    ].join("\n");

    expect(extractPromptInputClassificationSection(prompt)).toBe(
      [
        "INPUT SOURCE CLASSIFICATION:",
        "- Factual base: campaign base asset — sole source of people, products, brands, logos, copy, offers, CTAs, claims.",
        "- Visual reference: none.",
      ].join("\n")
    );
  });

  it("CONTAMINATION_FAILURE_CODES includes lineage hard-failure codes", async () => {
    expect(CONTAMINATION_FAILURE_CODES.has("copied_style_reference_facts")).toBe(
      true
    );
    expect(CONTAMINATION_FAILURE_CODES.has("style_reference_contamination")).toBe(
      true
    );
    expect(CONTAMINATION_FAILURE_CODES.has("campaign_identity_drift")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("replaced_source_subject")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("unauthorized_brand_or_ip")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("wrong_brand")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("unsupported_offer")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("invented_factual_entity")).toBe(true);
    expect(CONTAMINATION_FAILURE_CODES.has("cta_drift" as never)).toBe(false);
  });

  it("art_variation with campaign asset: factual base, no visual reference, brand kit not attached", async () => {
    const contract = artVariationContractFixture();
    const section = buildInputClassificationPromptSection(
      resolveInputSourceClassification(contract, {
        hasBrandKit: false,
        clientReferenceCount: 0,
        packageSource: "campaign_asset",
      })
    ).join("\n");

    expect(section).toContain("campaign base asset");
    expect(section).toContain("Visual reference: none.");
    expect(section).toContain("Brand kit: not attached.");
    expect(section).toContain("Auxiliary references: none.");
  });

  it("format_adaptation with approved_derivation: factual base mentions approved parent", async () => {
    const contract = formatAdaptationApprovedDerivationContractFixture();
    const section = buildInputClassificationPromptSection(
      resolveInputSourceClassification(contract, {
        hasBrandKit: false,
        clientReferenceCount: 0,
        packageSource: "approved_derivation",
      })
    ).join("\n");

    expect(section).toMatch(/approved parent/i);
  });

  it("restyling with styleAssetId: visual reference line present", async () => {
    const contract = restylingContractFixture();
    const section = buildInputClassificationPromptSection(
      resolveInputSourceClassification(contract, {
        hasBrandKit: false,
        clientReferenceCount: 0,
      })
    ).join("\n");

    expect(section).toContain("Visual reference:");
    expect(section).toContain("style_reference asset");
    expect(section).not.toContain("Visual reference: none.");
  });

  describe.each([
    ["art_variation", artVariationContractFixture(), "campaign_asset" as const],
    [
      "format_adaptation",
      formatAdaptationApprovedDerivationContractFixture(),
      "approved_derivation" as const,
    ],
    ["restyling", restylingContractFixture(), undefined],
  ] as const)("buildDerivationPrompt %s", (_mode, contract, packageSource) => {
    it("includes INPUT SOURCE CLASSIFICATION after integrity and before MODE", async () => {
      const prompt = await buildDerivationPrompt(
        derivationConfigFromContract(contract, {
          packageSource: packageSource ?? contract.sourcePackage,
        })
      );

      const section = extractPromptInputClassificationSection(prompt);
      expect(section).toContain("INPUT SOURCE CLASSIFICATION:");

      const integrityIdx = prompt.indexOf("ANTI-HALLUCINATION RULES:");
      const classificationIdx = prompt.indexOf("INPUT SOURCE CLASSIFICATION:");
      const modeIdx = prompt.indexOf("MODE:");

      expect(classificationIdx).toBeGreaterThan(integrityIdx);
      expect(modeIdx).toBeGreaterThan(classificationIdx);
    });
  });
});

describe("integrity injection", () => {
  describe.each(["art_variation", "format_adaptation", "restyling"] as const)(
    "%s mode",
    (mode) => {
      it("injects canonical and integrity sections before MODE", async () => {
        const contract =
          mode === "restyling"
            ? restylingContractFixture()
            : mode === "format_adaptation"
              ? formatAdaptationCampaignAssetContractFixture()
              : artVariationContractFixture();

        const prompt = await buildDerivationPrompt(
          derivationConfigFromContract(contract, { generationMode: mode })
        );

        const canonical = extractPromptCanonicalContractSection(prompt);
        const integrity = extractPromptIntegritySection(prompt);

        expect(canonical).toContain("CANONICAL CREATIVE CONTRACT:");
        expect(canonical).toContain("RULE PRECEDENCE");
        expect(integrity).toContain("VISUAL HIERARCHY CONTRACT:");
        expect(integrity).toContain("ANTI-HALLUCINATION RULES:");

        const canonicalIdx = prompt.indexOf("CANONICAL CREATIVE CONTRACT:");
        const integrityIdx = prompt.indexOf("VISUAL HIERARCHY CONTRACT:");
        const modeIdx = prompt.indexOf("MODE:");

        expect(canonicalIdx).toBeGreaterThan(-1);
        expect(integrityIdx).toBeGreaterThan(canonicalIdx);
        expect(modeIdx).toBeGreaterThan(integrityIdx);
      });
    }
  );

  it("places restyling factual-source after integrity and before MODE", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(restylingContractFixture())
    );

    const integrityIdx = prompt.indexOf("VISUAL HIERARCHY CONTRACT:");
    const classificationIdx = prompt.indexOf("INPUT SOURCE CLASSIFICATION:");
    const transferIdx = prompt.indexOf("VISUAL REFERENCE TRANSFER RULE:");
    const factualIdx = prompt.indexOf("RESTYLING FACTUAL-SOURCE RULE:");
    const modeIdx = prompt.indexOf("MODE:");

    expect(classificationIdx).toBeGreaterThan(integrityIdx);
    expect(transferIdx).toBeGreaterThan(classificationIdx);
    expect(factualIdx).toBeGreaterThan(transferIdx);
    expect(modeIdx).toBeGreaterThan(factualIdx);
  });
});

describe("precedence", () => {
  it("includes RULE PRECEDENCE and mandatory tier in art_variation mode section", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    const mode = extractPromptModeSection(prompt);
    const canonical = extractPromptCanonicalContractSection(prompt);

    expect(canonical).toContain("RULE PRECEDENCE");
    expect(mode).toMatch(/mandatory tier|Tier mandatory/i);
  });
});

describe("no preserve-all conflict", () => {
  it("does not demand undifferentiated preserve-every-important-piece without tier qualification", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture())
    );
    const mode = extractPromptModeSection(prompt);

    expect(mode).not.toMatch(/preserve every important piece/i);
    if (/preserve every/i.test(prompt)) {
      expect(prompt).toMatch(/mandatory tier|Tier mandatory/i);
    }
  });

  it("does not pair undifferentiated PRESERVE EXACTLY with hierarchy simplification in format_adaptation", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationCampaignAssetContractFixture())
    );
    const mode = extractPromptModeSection(prompt);

    expect(mode).not.toMatch(
      /PRESERVE EXACTLY: the original photo\/subject, all text copy.*decorative shapes, icons, and graphic panels\./s
    );
    expect(mode).toMatch(/mandatory tier|visual prominence|three.*zone|hierarchy/i);
    expect(extractPromptCanonicalContractSection(prompt)).toContain("RULE PRECEDENCE");
    expect(mode).toContain("PRESERVE FACTS, FLEX EXPRESSION");
  });
});

describe("CTA semantics contract", () => {
  it("art_variation with null ctaText uses inherited CTA instruction", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: null,
      contract: {
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).toContain("CTA reference (optional): inherit from reference");
    expect(prompt).not.toContain("no CTA required");
  });

  it("art_variation with explicit ctaText renders the CTA as action reference", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "art_variation",
      targetFormat: "1:1",
      ctaText: "Comprar agora",
      contract: {
        generationMode: "art_variation",
        targetFormat: "1:1",
        ctaSemantics: { kind: "explicit", text: "Comprar agora" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).toContain("Comprar agora");
    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).not.toContain("CTA text above is MANDATORY and FINAL");
  });

  it("format_adaptation with null ctaText keeps CTA optional with action intent", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "format_adaptation",
      targetFormat: "9:16",
      ctaText: null,
      contract: {
        generationMode: "format_adaptation",
        targetFormat: "9:16",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).toContain("Preserve the intended action when a CTA is rendered");
    expect(prompt).not.toContain("no CTA required");
  });

  it("restyling with null ctaText does not emit no-CTA instruction", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
      ctaText: null,
      contract: {
        generationMode: "restyling",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "asset-base-1",
        styleAssetId: "asset-style-1",
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).not.toContain("no CTA required");
    expect(prompt).not.toContain("CTA: none");
  });

  it("restyling with styleAssetId includes RESTYLING FACTUAL-SOURCE RULE", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
      contract: {
        generationMode: "restyling",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "base-123",
        styleAssetId: "style-456",
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).toContain("RESTYLING FACTUAL-SOURCE RULE");
    expect(prompt.toLowerCase()).toContain("factual");
  });

  it("restyling without styleAssetId still includes RESTYLING FACTUAL-SOURCE RULE", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
      contract: {
        generationMode: "restyling",
        targetFormat: "1:1",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: "base-123",
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
      },
    });
    expect(prompt).toContain("RESTYLING FACTUAL-SOURCE RULE");
    expect(prompt).toContain("VISUAL REFERENCE TRANSFER RULE:");
  });

  it("restyling with visualTokenBrief does not inject Extracted Visual Token Brief", async () => {
    const prompt = await buildDerivationPrompt({
      ...derivationConfigFromContract(restylingContractFixture()),
      visualTokenBrief:
        "Style reference: premium editorial shadows and serif typography.",
    });
    expect(prompt).not.toContain("Extracted Visual Token Brief");
    expect(prompt).not.toContain("premium editorial shadows");
  });

  it("format_adaptation still excludes visualTokenBrief when configured", async () => {
    const prompt = await buildDerivationPrompt({
      ...derivationConfigFromContract(formatAdaptationCampaignAssetContractFixture()),
      visualTokenBrief: "Bold headline stack with yellow CTA module.",
    });
    expect(prompt).not.toContain("Extracted Visual Token Brief");
    expect(prompt).not.toContain("Bold headline stack");
  });
});

describe("allowed entities prompt section", () => {
  it("CENBRAP NR1 restyling prompt contains ALLOWED ENTITIES with CENBRAP brand", async () => {
    const prompt = await buildDerivationPrompt({
      generationMode: "restyling",
      targetFormat: "1:1",
      ctaText: "Solicitar checklist",
      campaign: {
        id: "camp-1",
        workspaceId: "ws-1",
        name: "CENBRAP NR1",
        client: "CENBRAP",
        product: "NR1 compliance toolkit",
        objective: "NR1 compliance",
        audience: "Safety managers",
        platforms: ["meta"],
        tone: "professional",
        offer: "Conformidade NR1",
        constraints: "No athlete imagery",
        notes: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      contract: restylingContractFixture({
        client: "CENBRAP",
        product: "NR1 compliance toolkit",
        offer: "Conformidade NR1",
      }),
    });

    expect(prompt).toContain("ALLOWED ENTITIES (do not invent beyond this list):");
    expect(prompt).toContain("CENBRAP");
    expect(prompt).not.toContain("Cantona");
  });
});

describe("art_variation decorative-only rejection (MODE-01)", () => {
  it("rejects decorative-only changes and requires new composition mechanism", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture()),
    );
    const mode = extractPromptPerModeRulesSection(prompt);
    expect(mode).toMatch(/DECORATIVE-ONLY|decorative-only/i);
    expect(mode).toMatch(/new composition mechanism|focal hierarchy|proof presentation/i);
  });
});

describe("art_variation reading-path gestalt budget (MODE-02)", () => {
  it("caps layout to three main reading-path anchors", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture()),
    );
    const mode = extractPromptPerModeRulesSection(prompt);
    expect(mode).toMatch(/READING PATH AND GESTALT BUDGET|reading-path anchors/i);
    expect(mode).toMatch(/hook.*proof.*invite|no fourth information group/i);
  });
});

describe("per-mode rules injection order", () => {
  it("places classification before MODE before creativity level for art_variation", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), { creativeLevel: "balanced" }),
    );
    const classificationIdx = prompt.indexOf("INPUT SOURCE CLASSIFICATION:");
    const modeIdx = prompt.indexOf("MODE: art_variation");
    const creativityIdx = prompt.indexOf("CREATIVITY LEVEL:");
    expect(classificationIdx).toBeGreaterThan(-1);
    expect(modeIdx).toBeGreaterThan(classificationIdx);
    expect(creativityIdx).toBeGreaterThan(modeIdx);
    expect(extractPromptPerModeRulesSection(prompt).length).toBeGreaterThan(0);
  });
});

describe("restyling factual entities (MODE-03)", () => {
  it("locks factual entities to base without duplicating transfer denylist", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(restylingContractFixture()),
    );
    const mode = extractPromptPerModeRulesSection(prompt);
    expect(mode).toMatch(/entity lock|base-locked|FACTUAL ENTITY LOCK/i);
    expect(mode).not.toMatch(/DENYLIST/);
    const transferIdx = prompt.indexOf("VISUAL REFERENCE TRANSFER RULE:");
    const modeIdx = prompt.indexOf("MODE: restyling");
    expect(transferIdx).toBeGreaterThan(-1);
    expect(modeIdx).toBeGreaterThan(transferIdx);
  });
});

describe("format adaptation helpers (MODE-04/05)", () => {
  it("shouldIncludePlanHooksForMode returns false for format_adaptation", async () => {
    expect(shouldIncludePlanHooksForMode("format_adaptation")).toBe(false);
    expect(shouldIncludePlanHooksForMode("art_variation")).toBe(true);
    expect(shouldIncludePlanHooksForMode("restyling")).toBe(true);
  });

  it("shouldIncludeCompetitorAnalysesForMode returns false for format_adaptation", async () => {
    expect(shouldIncludeCompetitorAnalysesForMode("format_adaptation")).toBe(false);
    expect(shouldIncludeCompetitorAnalysesForMode("art_variation")).toBe(true);
    expect(shouldIncludeCompetitorAnalysesForMode("restyling")).toBe(true);
  });

  it("buildFormatAdaptationModeRulesSection includes identity locks", async () => {
    const lines = buildFormatAdaptationModeRulesSection({ targetFormat: "9:16" });
    const section = lines.join("\n");
    expect(section).toMatch(/CAMPAIGN IDENTITY LOCK/i);
    expect(section).toContain("PRESERVE FACTS, FLEX EXPRESSION");
    expect(section).toMatch(/CROSS-FORMAT IDENTITY/i);
  });

  describe.each(["1:1", "4:5", "9:16"] as const)(
    "format_adaptation cross-format identity — %s",
    (targetFormat) => {
      it("includes cross-format identity rule", async () => {
        const section = buildFormatAdaptationModeRulesSection({ targetFormat }).join("\n");
        expect(section).toMatch(/CROSS-FORMAT IDENTITY/i);
        expect(section).toMatch(/no new narrative|same campaign/i);
      });
    },
  );
});

describe("format firewall (MODE-04)", () => {
  it("omits plan hooks and competitor sections for format_adaptation", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationCampaignAssetContractFixture(), {
        plan: {
          id: "plan-1",
          strategy: "Layout-focused strategy",
          angles: ["Angle A"],
          hooks: ["Hook copy option"],
          ctas: ["CTA option"],
        },
        competitorAnalyses: [
          {
            competitorName: "Rival Co",
            strengths: ["Bold colors"],
            weaknesses: ["Cluttered layout"],
            opportunities: ["Cleaner CTA"],
          },
        ],
      }),
    );
    expect(prompt).toContain("Creative Strategy (layout tone only)");
    expect(prompt).not.toContain("Creative Angles:");
    expect(prompt).not.toContain("Hook Copy Options:");
    expect(prompt).not.toContain("Rival Co");
    expect(prompt).toContain("Same ad, new frame");
  });
});

describe("per-mode rules integration (MODE-01–05)", () => {
  describe.each(["art_variation", "restyling", "format_adaptation"] as const)(
    "%s injection order",
    (mode) => {
      it("places classification before MODE before Campaign", async () => {
        const contract =
          mode === "restyling"
            ? restylingContractFixture()
            : mode === "format_adaptation"
              ? formatAdaptationCampaignAssetContractFixture()
              : artVariationContractFixture();
        const prompt = await buildDerivationPrompt(derivationConfigFromContract(contract));
        const classificationIdx = prompt.indexOf("INPUT SOURCE CLASSIFICATION:");
        const modeIdx = prompt.indexOf(`MODE: ${mode}`);
        const campaignIdx = prompt.indexOf("\nCampaign:");
        expect(classificationIdx).toBeGreaterThan(-1);
        expect(modeIdx).toBeGreaterThan(classificationIdx);
        expect(campaignIdx).toBeGreaterThan(modeIdx);
      });
    },
  );

  it("art_variation balanced level includes decorative-only guardrail", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(artVariationContractFixture(), { creativeLevel: "balanced" }),
    );
    expect(prompt).toMatch(/Decorative-only changes.*invalid/i);
  });

  it("format_adaptation omits plan hooks when plan includes hooks", async () => {
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(formatAdaptationCampaignAssetContractFixture(), {
        plan: {
          id: "plan-1",
          strategy: "Strategy",
          angles: ["Angle"],
          hooks: ["Hook"],
          ctas: [],
        },
      }),
    );
    expect(prompt).not.toContain("Hook Copy Options:");
  });
});
