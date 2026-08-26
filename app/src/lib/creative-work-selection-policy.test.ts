import { describe, expect, it } from "vitest";
import { getCreativeWorkSelectionPolicy } from "./creative-work-selection-policy";

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
});
