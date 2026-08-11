import { describe, expect, it } from "vitest";
import { getCreativeWorkSelectionPolicy } from "./creative-work-selection-policy";

describe("getCreativeWorkSelectionPolicy", () => {
  it.each([
    [{ schemaVersion: 1, objectiveVerdict: "pass" }, { verdict: "pass", selectable: true, requiresConfirmation: false, nextStep: "approve" }],
    [{ schemaVersion: 1, objectiveVerdict: "fail" }, { verdict: "fail", selectable: false, requiresConfirmation: false, nextStep: "generate_again" }],
    [{ schemaVersion: 1, objectiveVerdict: "inconclusive" }, { verdict: "inconclusive", selectable: true, requiresConfirmation: true, nextStep: "review_then_confirm" }],
    [null, { verdict: "legacy", selectable: true, requiresConfirmation: true, nextStep: "review_then_confirm" }],
  ] as const)("returns one objective decision for %j", (quality, expected) => {
    expect(getCreativeWorkSelectionPolicy(quality)).toEqual(expect.objectContaining(expected));
  });
});
