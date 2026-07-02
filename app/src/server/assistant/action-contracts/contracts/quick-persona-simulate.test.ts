import { describe, expect, it } from "vitest";
import "./index";
import { getActionContract } from "../registry";
import { quickPersonaSimulateContract } from "./quick-persona-simulate";

describe("quick_persona_simulate contract", () => {
  it("is registered in the registry", () => {
    const fetched = getActionContract("quick_persona_simulate");
    expect(fetched).toBeDefined();
    expect(fetched?.label).toBe(quickPersonaSimulateContract.label);
  });

  it("requires a uuid baseCreativeId", () => {
    const parsed = quickPersonaSimulateContract.inputSchema.safeParse({
      baseCreativeId: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts valid input with optional personaCount and notes", () => {
    const parsed = quickPersonaSimulateContract.inputSchema.safeParse({
      baseCreativeId: "550e8400-e29b-41d4-a716-446655440000",
      personaCount: 3,
      notes: "Focus on price-sensitive buyers",
    });
    expect(parsed.success).toBe(true);
  });

  it("has confirmationPolicy required", () => {
    expect(quickPersonaSimulateContract.confirmationPolicy).toBe("required");
  });

  it("reports a fixed credit cost derived from CREDIT_COSTS.personaSimulation", () => {
    expect(quickPersonaSimulateContract.creditImpact.kind).toBe("fixed");
    expect(
      (quickPersonaSimulateContract.creditImpact as { credits: number }).credits
    ).toBeGreaterThan(0);
  });
});
