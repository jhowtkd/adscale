import { describe, expect, it } from "vitest";
import {
  buildFromZeroPromptAugment,
  deriveBriefMissingFields,
} from "./from-zero";

describe("from-zero guided path", () => {
  it("builds an executable creative-plan proposal at confirm_plan", () => {
    const augment = buildFromZeroPromptAugment({
      currentStep: "confirm_plan",
      slots: { briefSnapshot: { offer: "Sale" } },
      referenceIds: ["a", "b", "c"],
    });
    expect(augment).toContain("create_creative_plan");
    expect(augment).toContain("3 visual references");
  });

  it("does not propose an action before confirmation", () => {
    expect(buildFromZeroPromptAugment({ currentStep: "select_references", slots: {}, referenceIds: [] })).toBeNull();
  });

  it("reports the next missing briefing decision deterministically", () => {
    expect(deriveBriefMissingFields({ product: "Shoes" })).toEqual(["audience"]);
  });
});
