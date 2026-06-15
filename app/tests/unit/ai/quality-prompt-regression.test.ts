import { describe, it, expect } from "vitest";
import { QUALITY_FIXTURES } from "@/server/ai/quality-fixtures";
import {
  buildDerivationPrompt,
  extractPromptCanonicalContractSection,
  extractPromptHardRulesSection,
  extractPromptIntegritySection,
  extractPromptModeSection,
  extractPromptRestylingFactualSourceSection,
} from "@/server/ai/prompt-builder";
import { derivationConfigFromContract } from "@/server/ai/prompt-builder.test-fixtures";

describe.each(QUALITY_FIXTURES)("prompt regression — $id", (fixture) => {
  it("builds a prompt honoring contract hard rules and mode invariants", () => {
    const prompt = buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    const hardRules = extractPromptHardRulesSection(prompt);
    const mode = extractPromptModeSection(prompt);
    const integrity = extractPromptIntegritySection(prompt);
    const canonical = extractPromptCanonicalContractSection(prompt);

    expect(integrity).toContain("VISUAL HIERARCHY CONTRACT");
    expect(integrity).toContain("ANTI-HALLUCINATION RULES");
    expect(canonical).toContain("RULE PRECEDENCE");

    expect(hardRules).toContain(`Target format: ${fixture.contract.targetFormat}`);
    expect(prompt.length).toBeGreaterThan(100);

    if (fixture.contract.ctaSemantics.kind === "explicit") {
      expect(hardRules).toContain(fixture.contract.ctaSemantics.text);
      expect(hardRules).toMatch(/literal CTA|MANDATORY/i);
    }

    if (fixture.contract.generationMode === "format_adaptation") {
      expect(mode).toContain("format_adaptation");
      expect(mode).toMatch(/native composition|layout adaptation/i);
      expect(mode).toMatch(/No blank bands|blurred padding|letterboxing/i);
      expect(mode).not.toMatch(/resize only/i);
    }

    if (fixture.contract.generationMode === "restyling") {
      const factual = extractPromptRestylingFactualSourceSection(prompt);
      expect(factual).toMatch(/base|factual|content/i);
      expect(factual).toMatch(/style reference|visual language|style/i);
      expect(fixture.contract.baseAssetId).toBeTruthy();
      expect(fixture.contract.styleAssetId).toBeTruthy();
    }

    if (fixture.failureMode === "wrong_cta") {
      expect(hardRules).toContain("Comprar agora");
    }
  });
});

describe("compact prompt section snapshots by generation mode", () => {
  it("snapshots art_variation hard rules from wrong_cta fixture", () => {
    const fixture = QUALITY_FIXTURES.find((f) => f.failureMode === "wrong_cta")!;
    const prompt = buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    expect(extractPromptHardRulesSection(prompt)).toMatchInlineSnapshot(`
      "HARD RULES / NON-NEGOTIABLE CONTRACT:
      - Target format: 1:1. This target format overrides any flexible layout suggestion.
      - CRITICAL LOGO RULE: Do NOT invent a logo. Preserve the logo ONLY if it already exists in the reference asset. If no logo is visible in the reference, do not add one.
      - Applied CTA text for this piece: Comprar agora
      - CRITICAL LITERAL CTA RULE: The CTA text above is MANDATORY and FINAL.
      - Do not use synonyms, paraphrases, or alternative phrasing for this CTA.
      - Do not translate the CTA into any language.
      - Do not rewrite or rephrase the CTA text.
      - Do not replace it with plan-recommended CTAs or any other text.
      - The exact CTA text above must appear verbatim in the generated output.
      - CTA Recommendations are secondary context only and must not override the literal CTA text.
      - Creative strategy, diagnosis, feedback, and client references are flexible guidance only; they must not override these hard rules."
    `);
  });

  it("snapshots format_adaptation mode section from poor_format_adaptation fixture", () => {
    const fixture = QUALITY_FIXTURES.find((f) => f.failureMode === "poor_format_adaptation")!;
    const prompt = buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    expect(extractPromptModeSection(prompt)).toMatchInlineSnapshot(`
      "MODE: format_adaptation — You are EDITING an existing ad to fit a DIFFERENT aspect ratio.
      You can see the original image. Your job is to PRESERVE every visual element exactly as it appears, and rebuild the layout so it feels native to the target format.
      This is a layout adaptation, not a resized poster. Treat the source ad as separate modules: headline, photo/subject, offer or proof, CTA, logo, badges, legal copy, and decorative background.
      PRESERVE EXACTLY: the original photo/subject, all text copy (headlines, subheads, bullets, CTA), the logo, brand colors, background color/texture, offer cards, discount badges, decorative shapes, icons, and graphic panels.
      DO NOT: create new photos, rewrite text, add new elements, remove elements, change colors, or invent new brand assets.
      Target format: 9:16. Rearrange the existing elements into a native composition for this format. Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or letterboxing.
      HARD LAYOUT FAILURES TO AVOID: no blurred side/top/bottom bars, no poster pasted over a background, no stretched edge filler, no crowded cluster of text/photo/CTA/logo, no overlapping information modules.
      Build clear zones with gutters and whitespace. Keep headline, supporting copy, CTA, logo, badges, legal copy, faces, and products inside a central safe area; only decorative background may bleed to the edges.
      The result must be immediately recognizable as the same ad — same content, same visual identity, just fitting a different frame.
      For 9:16 (vertical story): create a tall story layout with separate vertical zones. Use the upper zone for headline/brand hook, the middle zone for the photo or main visual, and the lower zone for offer/proof/CTA/logo. Do not squeeze the square layout into the center."
    `);
  });

  it("snapshots restyling factual-source section from style_reference_contamination fixture", () => {
    const fixture = QUALITY_FIXTURES.find(
      (f) => f.failureMode === "style_reference_contamination"
    )!;
    const prompt = buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    expect(extractPromptRestylingFactualSourceSection(prompt)).toMatchInlineSnapshot(`
      "RESTYLING FACTUAL-SOURCE RULE:
      The base image is the ONLY source of factual content (brand name, product name, offer, CTA, price, course name, logo). The style reference provides visual language (color, typography style, layout composition, mood) only. Do NOT copy factual claims, text, prices, offers, brand names, or CTAs from the style reference into the output."
    `);
  });
});
