import { describe, expect, it } from "vitest";
import {
  getArtRefinementIssue,
  getArtRefinementPresentation,
  getCreativeWorkSelectionPolicy,
} from "./creative-work-selection-policy";

describe("getCreativeWorkSelectionPolicy", () => {
  it.each([
    [{ schemaVersion: 1, objectiveVerdict: "pass", qualityScore: 1 }, { verdict: "pass", selectable: true, requiresConfirmation: false, rationale: "objective_pass", nextStep: "approve" }],
    [{ schemaVersion: 1, objectiveVerdict: "fail", qualityScore: 100 }, { verdict: "fail", selectable: false, requiresConfirmation: false, rationale: "objective_fail", nextStep: "generate_again" }],
    [{ schemaVersion: 1, objectiveVerdict: "inconclusive" }, { verdict: "inconclusive", selectable: true, requiresConfirmation: true, rationale: "objective_inconclusive", nextStep: "review_then_confirm" }],
    [{ qualityVerdict: "invalid", qualityScore: 100 }, { verdict: "legacy", selectable: false, requiresConfirmation: false, rationale: "objective_legacy_fail", nextStep: "generate_again" }],
    [{ verdict: "invalid", qualityScore: 100 }, { verdict: "legacy", selectable: false, requiresConfirmation: false, rationale: "objective_legacy_fail", nextStep: "generate_again" }],
    [{ qualityVerdict: "acceptable", hardFailures: [{ code: "wrong_brand" }] }, { verdict: "legacy", selectable: false, requiresConfirmation: false, rationale: "objective_legacy_fail", nextStep: "generate_again" }],
    [{ qualityVerdict: "acceptable", qualityScore: 90 }, { verdict: "legacy", selectable: true, requiresConfirmation: true, rationale: "objective_legacy", nextStep: "review_then_confirm" }],
    [{ qualityVerdict: "improvable", qualityScore: 40 }, { verdict: "legacy", selectable: true, requiresConfirmation: true, rationale: "objective_legacy", nextStep: "review_then_confirm" }],
    [null, { verdict: "legacy", selectable: true, requiresConfirmation: true, rationale: "objective_legacy", nextStep: "review_then_confirm" }],
  ] as const)("returns one objective decision for %j", (quality, expected) => {
    expect(getCreativeWorkSelectionPolicy(quality)).toEqual(expect.objectContaining(expected));
  });

  it("keeps legacy payloads selectable without an outputId", () => {
    expect(getCreativeWorkSelectionPolicy({ schemaVersion: 1, objectiveVerdict: "pass" }))
      .toEqual(expect.objectContaining({ selectable: true, requiresConfirmation: false }));
  });
});

describe("getCreativeWorkSelectionPolicy person fidelity (plan 03, T3)", () => {
  const OUTPUT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const PERSON_ID = "11111111-1111-4111-8111-111111111111";
  const HASH = "a".repeat(64);
  const base = { schemaVersion: 1, objectiveVerdict: "pass" };
  const blockFor = (findings: unknown[], review?: unknown) => ({
    ...base,
    personFidelity: {
      findings,
      referenceHash: HASH,
      ...(review === undefined ? {} : { review }),
    },
  });

  it("blocks a confirmed mismatch even with an accepted review", () => {
    const quality = blockFor(
      [{ personId: PERSON_ID, status: "mismatch", evidence: ["rosto trocado"], issue: "troca" }],
      { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT_ID, referenceHash: HASH, accepted: true },
    );
    expect(getCreativeWorkSelectionPolicy(quality, OUTPUT_ID)).toEqual(expect.objectContaining({
      selectable: false,
      requiresConfirmation: false,
      rationale: "objective_fail",
      nextStep: "generate_again",
    }));
  });

  it("blocks doubt until the review bound to this output and hash", () => {
    const quality = blockFor([{ personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "ocluído" }]);
    expect(getCreativeWorkSelectionPolicy(quality, OUTPUT_ID)).toEqual(expect.objectContaining({
      selectable: false,
      requiresConfirmation: false,
      nextStep: "review_then_confirm",
    }));
  });

  it("accepts the bound review and ignores reviews of other outputs", () => {
    const reviewed = blockFor(
      [{ personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "ocluído" }],
      { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT_ID, referenceHash: HASH, accepted: true },
    );
    expect(getCreativeWorkSelectionPolicy(reviewed, OUTPUT_ID)).toEqual(expect.objectContaining({
      selectable: true,
      requiresConfirmation: false,
    }));
    expect(getCreativeWorkSelectionPolicy(reviewed, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb").selectable).toBe(false);
  });

  it("stays blocking without an outputId and keeps consistent findings selectable", () => {
    const doubt = blockFor([{ personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "ocluído" }]);
    expect(getCreativeWorkSelectionPolicy(doubt).selectable).toBe(false);
    const consistent = blockFor([{ personId: PERSON_ID, status: "consistent", evidence: [], issue: null }]);
    expect(getCreativeWorkSelectionPolicy(consistent, OUTPUT_ID)).toEqual(expect.objectContaining({
      selectable: true,
      requiresConfirmation: false,
    }));
  });
});

describe("art refinement presentation (plan 04, T3)", () => {
  it("reads status, issues and recommendation, ignoring malformed state", () => {
    expect(getArtRefinementPresentation("a", {
      status: "ready",
      issues: ["Foco dividido", "", 42],
      recommendedOutputIds: ["a", ""],
    })).toEqual({ status: "ready", issues: ["Foco dividido"], isRecommended: true });
    expect(getArtRefinementPresentation("b", {
      status: "ready",
      issues: [],
      recommendedOutputIds: ["a"],
    }).isRecommended).toBe(false);
    expect(getArtRefinementPresentation("a", null)).toEqual({ status: null, issues: [], isRecommended: false });
    expect(getArtRefinementPresentation("a", { status: "bogus", recommendedOutputIds: ["a"] }))
      .toEqual({ status: null, issues: [], isRecommended: false });
  });

  it("surfaces only a validated weak-critique problem", () => {
    const weak = {
      verdict: "weak",
      problem: "Foco dividido",
      intervention: "Unificar foco",
      evidence: ["Dois títulos dominantes"],
    };
    expect(getArtRefinementIssue({ artCritique: weak })).toBe("Foco dividido");
    expect(getArtRefinementIssue({ artCritique: { ...weak, evidence: [] } })).toBeNull();
    expect(getArtRefinementIssue({ artCritique: { ...weak, verdict: "ready" } })).toBeNull();
    expect(getArtRefinementIssue(null)).toBeNull();
  });
});
