import { describe, expect, it } from "vitest";
import type { GenerationDestination } from "./types";
import { creativeWorkUnitBillingKey, unitCostFromBatch } from "./types";

const kinds: GenerationDestination["kind"][] = [
  "derivation",
  "creative_work_output",
  "creative_work_carousel_slide",
];

describe("GenerationDestination kinds", () => {
  it("additively supports the carousel slide destination", () => {
    expect(kinds).toEqual([
      "derivation",
      "creative_work_output",
      "creative_work_carousel_slide",
    ]);
  });

  it("keeps the existing destinations unchanged", () => {
    const derivation: GenerationDestination = {
      kind: "derivation",
      id: "derivation-1",
      storagePrefix: "derivations/derivation-1",
      campaignId: "campaign-1",
    };
    const output: GenerationDestination = {
      kind: "creative_work_output",
      id: "output-1",
      storagePrefix: "creative-work/output-1",
      workItemId: "work-1",
      generationCorrelationId: "generation-1",
    };
    const slide: GenerationDestination = {
      kind: "creative_work_carousel_slide",
      id: "slide-1",
      storagePrefix: "creative-work/work-1/carousel/slides/slide-1",
      workItemId: "work-1",
    };

    expect(derivation.kind).toBe("derivation");
    expect(output.kind).toBe("creative_work_output");
    expect(slide.kind).toBe("creative_work_carousel_slide");
    expect(slide.workItemId).toBe("work-1");
  });

  it("keeps the canonical unit billing helpers stable", () => {
    expect(creativeWorkUnitBillingKey("work-1", "output-1")).toBe(
      "creative-work:work-1:output:output-1:generate",
    );
    const { cost, idempotency } = unitCostFromBatch(
      {
        kind: "batch",
        authorship: { workspaceId: "workspace-1", userId: "user-1" },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: { mode: "social_post", objective: null },
        parentId: "work-1",
        unitCount: 1,
        chargeAmount: 50,
        unitChargeAmount: 50,
        billingKey: "creative-work:work-1:initial",
        refundPolicy: "default",
      },
      "output-1",
    );
    expect(cost.chargeAmount).toBe(50);
    expect(idempotency.billingKey).toBe("creative-work:work-1:output:output-1:generate");
  });
});
