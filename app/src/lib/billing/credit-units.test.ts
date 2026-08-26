import { describe, expect, it } from "vitest";
import {
  CREDIT_COSTS,
  CREDIT_UNIT_VERSION,
  GENERATION_CREDIT_COSTS,
  PLAN_CREDIT_GRANTS,
  TRIAL_CREDIT_GRANT,
  type CreditAction,
} from "./credit-units";

describe("canonical credit units contract (v2 / 10x)", () => {
  it("exports canonical version and trial grant constants", () => {
    expect(CREDIT_UNIT_VERSION).toBe(2);
    expect(TRIAL_CREDIT_GRANT).toBe(500);
  });

  it("exports exact 10x credit costs for all action types", () => {
    expect(CREDIT_COSTS).toEqual({
      creative_plan: 10,
      image_derivation: 50,
      regeneration: 50,
      restyling: 50,
      delivery_package_child: 50,
      landing_page: 100,
      creative_qa: 10,
      copy_generation: 20,
      personaSimulation: 30,
    });
  });

  it("exports exact generation credit costs", () => {
    expect(GENERATION_CREDIT_COSTS).toEqual({
      singleDerivation: 50,
      creativeWorkOutput: 50,
      triplet: 150,
      creativeWorkTriplet: 150,
      goalPackage: 150,
    });
    expect(GENERATION_CREDIT_COSTS.creativeWorkTriplet).toBe(GENERATION_CREDIT_COSTS.triplet);
  });

  it("exports exact plan credit grants", () => {
    expect(PLAN_CREDIT_GRANTS).toEqual({
      starter: 300,
      growth: 1_200,
      scale: 3_600,
    });
  });

  it("preserves exact image allowance ratios across trial and plans", () => {
    expect(TRIAL_CREDIT_GRANT / CREDIT_COSTS.image_derivation).toBe(10);
    expect(PLAN_CREDIT_GRANTS.starter / CREDIT_COSTS.image_derivation).toBe(6);
    expect(PLAN_CREDIT_GRANTS.growth / CREDIT_COSTS.image_derivation).toBe(24);
    expect(PLAN_CREDIT_GRANTS.scale / CREDIT_COSTS.image_derivation).toBe(72);
  });

  it("ensures CreditAction type aligns with CREDIT_COSTS keys", () => {
    const actionKeys: CreditAction[] = [
      "creative_plan",
      "image_derivation",
      "regeneration",
      "restyling",
      "delivery_package_child",
      "landing_page",
      "creative_qa",
      "copy_generation",
      "personaSimulation",
    ];
    expect(Object.keys(CREDIT_COSTS).sort()).toEqual(actionKeys.sort());
  });
});
