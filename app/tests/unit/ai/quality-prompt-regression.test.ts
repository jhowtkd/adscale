import { describe, it, expect } from "vitest";
import { QUALITY_FIXTURES } from "@/server/ai/quality-fixtures";
import {
  buildDerivationPrompt,
  extractPromptCanonicalContractSection,
  extractPromptHardRulesSection,
  extractPromptIntegritySection,
  extractPromptModeSection,
  extractPromptPerModeRulesSection,
  extractPromptRestylingFactualSourceSection,
} from "@/server/ai/prompt-builder";
import { extractPromptVisualReferenceTransferSection } from "@/server/ai/factual-visual-separation";
import { derivationConfigFromContract } from "@/server/ai/prompt-builder.test-fixtures";

describe.each(QUALITY_FIXTURES)("prompt regression — $id", (fixture) => {
  it("builds a prompt honoring contract hard rules and mode invariants", async () => {
    const prompt = await buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    const hardRules = extractPromptHardRulesSection(prompt);
    const mode = extractPromptModeSection(prompt);
    const integrity = extractPromptIntegritySection(prompt);
    const canonical = extractPromptCanonicalContractSection(prompt);

    expect(integrity).toContain("VISUAL HIERARCHY CONTRACT");
    expect(integrity).toContain("ANTI-HALLUCINATION RULES");
    expect(canonical).toContain("RULE PRECEDENCE");

    expect(hardRules).toContain(`Target format: ${fixture.contract.targetFormat}`);
    expect(prompt.length).toBeGreaterThan(100);

    expect(prompt).toContain("CTA PRESENCE: optional");
    expect(prompt).toContain("Preserve the intended action when a CTA is rendered");
    expect(prompt).toContain("Facts are fixed; headline and supporting expression are flexible");
    expect(prompt).not.toContain("CTA text above is MANDATORY and FINAL");
    expect(prompt).not.toContain("must appear verbatim");
    expect(prompt).not.toContain("at least 8% of the canvas");

    if (fixture.contract.ctaSemantics.kind === "explicit") {
      expect(prompt).toContain(fixture.contract.ctaSemantics.text);
    }

    if (fixture.contract.generationMode === "format_adaptation") {
      expect(mode).toContain("format_adaptation");
      expect(mode).toMatch(/native composition|layout adaptation/i);
      expect(mode).toMatch(/No blank bands|blurred padding|letterboxing/i);
      expect(mode).not.toMatch(/resize only/i);
      expect(mode).toMatch(/mandatory tier|visual prominence|hierarchy/i);
      expect(mode).toContain("same campaign and visual system");
      expect(mode).toContain("may condense or rewrite non-factual copy");
      expect(mode).not.toContain("keeping all copy and facts verbatim");
      expect(mode).not.toMatch(
        /PRESERVE EXACTLY: the original photo\/subject, all text copy.*decorative shapes, icons, and graphic panels\./s
      );
    }

    if (fixture.contract.generationMode === "restyling") {
      const factual = extractPromptRestylingFactualSourceSection(prompt);
      const transfer = extractPromptVisualReferenceTransferSection(prompt);
      expect(factual).toMatch(/base|factual|content/i);
      expect(factual).toMatch(/style reference|visual language|style/i);
      expect(transfer).toContain("VISUAL REFERENCE TRANSFER RULE:");
      expect(transfer).toContain("ritmo");
      expect(transfer).toContain("pessoas");
      expect(prompt).not.toContain("Extracted Visual Token Brief");
      expect(fixture.contract.baseAssetId).toBeTruthy();
      expect(fixture.contract.styleAssetId).toBeTruthy();
    }

    if (fixture.failureMode === "wrong_cta") {
      expect(prompt).toContain("Comprar agora");
    }

    const perMode = extractPromptPerModeRulesSection(prompt);
    if (fixture.contract.generationMode === "art_variation") {
      expect(perMode).toMatch(/DECORATIVE-ONLY|decorative-only/i);
      expect(perMode).toMatch(/READING PATH AND GESTALT BUDGET|reading-path anchors/i);
    }
    if (fixture.contract.generationMode === "restyling") {
      expect(perMode).toMatch(/entity lock|base-locked|FACTUAL ENTITY LOCK/i);
      expect(perMode).not.toMatch(/DENYLIST/);
    }
    if (fixture.contract.generationMode === "format_adaptation") {
      expect(perMode).toMatch(/CAMPAIGN IDENTITY LOCK|same campaign/i);
      expect(perMode).toMatch(/CROSS-FORMAT IDENTITY/i);
      expect(perMode).toContain("PRESERVE FACTS, FLEX EXPRESSION");
    }
  });
});

describe("compact prompt section snapshots by generation mode", () => {
  it("snapshots art_variation hard rules from wrong_cta fixture", async () => {
    const fixture = QUALITY_FIXTURES.find((f) => f.failureMode === "wrong_cta")!;
    const prompt = await buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
    expect(extractPromptHardRulesSection(prompt)).toMatchInlineSnapshot(`
      "HARD RULES / NON-NEGOTIABLE CONTRACT:
      - Target format: 1:1. This target format overrides any flexible layout suggestion.
      - CRITICAL LOGO RULE: Do NOT invent a logo. Preserve the logo ONLY if it already exists in the reference asset. If no logo is visible in the reference, do not add one.
      - FACTUAL INTEGRITY PRECEDENCE: brand, product, price, conditions, dates, and claims must remain correct; factual accuracy outranks requested fidelity, and fidelity outranks art direction.
      - Creative strategy, diagnosis, feedback, and client references are flexible guidance only; they must not override these hard rules."
    `);
  });

  it("snapshots format_adaptation mode section from poor_format_adaptation fixture", async () => {
    const fixture = QUALITY_FIXTURES.find((f) => f.failureMode === "poor_format_adaptation")!;
    const prompt = await buildDerivationPrompt(derivationConfigFromContract(fixture.contract));
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
      For 9:16 (vertical story): create a tall story layout with separate vertical zones — for example, upper zone for headline/brand hook, middle zone for the photo or main visual, lower zone for offer/proof/CTA/logo. Do not squeeze the square layout into the center."
    `);
  });

  it("snapshots restyling factual-source section from style_reference_contamination fixture", async () => {
    const fixture = QUALITY_FIXTURES.find(
      (f) => f.failureMode === "style_reference_contamination"
    )!;
    const prompt = await buildDerivationPrompt(
      derivationConfigFromContract(fixture.contract, {
        visualTokenBrief: "Athlete jersey and rival brand discount from style ref.",
      })
    );
    expect(prompt).not.toContain("Extracted Visual Token Brief");
    expect(extractPromptVisualReferenceTransferSection(prompt)).toContain(
      "lógica compositiva"
    );
    expect(extractPromptRestylingFactualSourceSection(prompt)).toMatchInlineSnapshot(`
      "RESTYLING FACTUAL-SOURCE RULE:
      The base image is the ONLY source of factual content (brand name, product name, offer, CTA, price, course name, logo). The style reference provides visual language (color, typography style, layout composition, mood) only. Do NOT copy factual claims, text, prices, offers, brand names, or CTAs from the style reference into the output."
    `);
  });
});
