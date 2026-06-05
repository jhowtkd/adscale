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
    expect(brief.promptFeedback).toContain('Preserve the exact CTA "Shop Now"');
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

  it("enforces char cap while preserving contract tail", () => {
    const longIssues = Array.from({ length: 40 }, (_, i) => `Issue ${i}: ${"x".repeat(80)}`);
    const brief = buildRegenerationCorrectionBrief({
      contract: baseContract,
      scoreIssues: longIssues,
    });

    expect(brief.promptFeedback.length).toBeLessThanOrEqual(1800);
    expect(brief.promptFeedback).toContain('Preserve the exact CTA "Shop Now"');
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
