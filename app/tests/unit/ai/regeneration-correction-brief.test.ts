import { describe, it, expect } from "vitest";
import {
  buildRegenerationCorrectionBrief,
  mergeUserRegenerationNotes,
} from "@/server/ai/regeneration-correction-brief";
import type { CreativeContract } from "@/server/ai/creative-contract";

const baseContract: CreativeContract = {
  generationMode: "art_variation",
  targetFormat: "4:5",
  ctaSemantics: { kind: "explicit", text: "Shop Now" },
  baseAssetId: null,
  styleAssetId: null,
  client: "Acme",
  product: null,
  offer: null,
  constraints: null,
};

describe("buildRegenerationCorrectionBrief", () => {
  it("merges hard failures with contract preservation tail", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [{ code: "cta_drift", message: "CTA was replaced." }],
    });

    expect(brief.promptFeedback).toContain("Hard failures:");
    expect(brief.promptFeedback).toContain("cta_drift: CTA was replaced.");
    expect(brief.promptFeedback).toContain("action intent");
    expect(brief.promptFeedback).toContain("4:5");
    expect(brief.promptFeedback).toContain("art_variation");
    expect(brief.structured.sources).toContain("hard_failures");
  });

  it("includes score issues and preservation tail on score-only path", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      scoreIssues: ["Low contrast on CTA"],
    });

    expect(brief.promptFeedback).toContain("Score issues:");
    expect(brief.promptFeedback).toContain("Low contrast on CTA");
    expect(brief.promptFeedback).toContain("Shop Now");
    expect(brief.structured.sources).toContain("score_issues");
  });

  it("includes QA failed items and caps warnings in prompt", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      qaChecklist: {
        legibility: { status: "failed", note: "Text too small" },
        briefMatch: { status: "warning", note: "Minor drift" },
        ctaOffer: { status: "warning", note: "CTA small" },
        informationPreservation: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
    });

    expect(brief.promptFeedback).toContain("QA issues:");
    expect(brief.promptFeedback).toContain("legibility");
    expect(brief.promptFeedback).toContain("Text too small");
    expect(brief.promptFeedback).toContain("(warning)");
    expect(brief.structured.qaFailed).toHaveLength(1);
    expect(brief.structured.qaWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("adds feedback category line without message body", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [{ code: "wrong_brand", message: "Logo mismatch." }],
      feedbackCategory: "generation",
    });

    expect(brief.promptFeedback).toContain("Feedback context (generation):");
    expect(brief.promptFeedback).toContain("generation-quality issue");
    expect(brief.promptFeedback).not.toContain("user typed this secret");
  });

  it("lists QA failed in QA issues section and surfaces warnings in structured output", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      qaChecklist: {
        legibility: { status: "failed", note: "Unreadable CTA" },
        briefMatch: { status: "warning", note: "Slight drift" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
    });

    expect(brief.promptFeedback).toContain("QA issues:");
    expect(brief.promptFeedback).toContain("legibility");
    expect(brief.structured.qaFailed).toHaveLength(1);
    expect(brief.structured.qaWarnings.length).toBeGreaterThanOrEqual(1);
    expect(brief.primaryReason).toContain("legibility failed");
  });

  it("enforces char cap while preserving contract tail", () => {
    const longIssues = Array.from({ length: 40 }, (_, i) => `Issue ${i}: ${"x".repeat(80)}`);
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      scoreIssues: longIssues,
    });

    expect(brief.promptFeedback.length).toBeLessThanOrEqual(1800);
    expect(brief.promptFeedback).toContain("action intent");
  });
});

describe("buildRegenerationCorrectionBrief specific correction directives", () => {
  it("invented_factual_entity includes remove-entity and allowed-registry language", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "invented_factual_entity", message: "Cantona detected." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/allowed-entity registry|contract-approved entities/i);
    expect(brief.promptFeedback).toMatch(/remove any person|remove.*not in/i);
  });

  it("replaced_source_subject instructs restoring original hero", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "replaced_source_subject", message: "Hero was swapped." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/restore the original hero/i);
  });

  it("campaign_identity_drift instructs restoring campaign concept and CTA", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "campaign_identity_drift", message: "Became a different ad." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/restore the original campaign concept/i);
    expect(brief.promptFeedback).toMatch(/same campaign/i);
  });

  it("style_reference_contamination limits facts to base image only", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        {
          code: "style_reference_contamination",
          message: "Copied offer from style ref.",
        },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/visual style only/i);
    expect(brief.promptFeedback).toMatch(/base image only/i);
  });

  it("visual_overload instructs reducing to three information zones", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [{ code: "visual_overload", message: "Too many modules." }],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/three information zones/i);
    expect(brief.promptFeedback).toMatch(/dominant hook/i);
  });

  it("decorative_only_variation requires new visual mechanism not color-only", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "decorative_only_variation", message: "Glow-only change." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/new visual mechanism/i);
    expect(brief.promptFeedback).toMatch(/not background\/glow\/color-only/i);
  });

  it("cta_drift instructs restoring contract CTA", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [{ code: "cta_drift", message: "CTA replaced." }],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/preserve action intent|intended action/i);
  });

  it("generic_template_aesthetic instructs removing generic template stacks", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "generic_template_aesthetic", message: "Neon glass stack." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/generic neon\/glass\/template/i);
  });

  it("includes each matching directive when multiple failures are present", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "invented_factual_entity", message: "Invented player." },
        { code: "cta_drift", message: "CTA wrong." },
        { code: "visual_overload", message: "Too busy." },
      ],
    });

    expect(brief.promptFeedback).toContain("Correction directives:");
    expect(brief.promptFeedback).toMatch(/allowed-entity registry|contract-approved entities/i);
    expect(brief.promptFeedback).toMatch(/preserve action intent|intended action/i);
    expect(brief.promptFeedback).toMatch(/three information zones/i);
    expect(brief.promptFeedback).toContain("Hard failures:");
    expect(brief.promptFeedback).toContain("invented_factual_entity:");
    expect(brief.promptFeedback).toContain("cta_drift:");
  });

  it("still respects MAX_PROMPT_FEEDBACK_CHARS with correction directives", () => {
    const longIssues = Array.from({ length: 40 }, (_, i) => `Issue ${i}: ${"x".repeat(80)}`);
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      hardFailures: [
        { code: "invented_factual_entity", message: "Entity invented." },
        { code: "visual_overload", message: "Overload." },
      ],
      scoreIssues: longIssues,
    });

    expect(brief.promptFeedback.length).toBeLessThanOrEqual(1800);
    expect(brief.promptFeedback).toContain("action intent");
  });
});

const restylingContract: CreativeContract = {
  ...baseContract,
  generationMode: "restyling",
  ctaSemantics: { kind: "inherited" },
};

describe("buildRegenerationCorrectionBrief restyling factual-source rule", () => {
  it("restyling with style_reference_contamination includes RESTYLING FACTUAL-SOURCE RULE", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: restylingContract,
      hardFailures: [
        {
          code: "style_reference_contamination",
          message: "Copied CTA from style reference.",
        },
      ],
    });

    expect(brief.promptFeedback).toContain("RESTYLING FACTUAL-SOURCE RULE");
    expect(brief.promptFeedback).toMatch(/base image is the ONLY source/i);
    expect(brief.promptFeedback).toContain("Correction directives:");
  });

  it("restyling brief includes factual-source rule even without contamination failure", () => {
    const brief = buildRegenerationCorrectionBrief({
      contract: restylingContract,
      hardFailures: [{ code: "cta_drift", message: "CTA changed." }],
    });

    expect(brief.promptFeedback).toContain("RESTYLING FACTUAL-SOURCE RULE");
    expect(brief.promptFeedback).toMatch(/base image is the ONLY source/i);
  });
});

describe("mergeUserRegenerationNotes", () => {
  const machine = "Hard failures:\n- cta_drift: missing\n\nSuggestion: Fix it. Preserve the exact CTA.";

  it("returns machine brief when user text is empty", () => {
    expect(mergeUserRegenerationNotes(machine, "")).toBe(machine);
    expect(mergeUserRegenerationNotes(machine, "   ")).toBe(machine);
  });

  it("returns machine brief when user text matches after whitespace normalize", () => {
    expect(mergeUserRegenerationNotes(machine, machine.replace(/\n/g, " "))).toBe(machine);
  });

  it("wraps distinct user text as Additional notes", () => {
    const merged = mergeUserRegenerationNotes(machine, "warmer palette only");
    expect(merged).toContain("Hard failures:");
    expect(merged).toContain("Additional notes: warmer palette only");
  });
});
