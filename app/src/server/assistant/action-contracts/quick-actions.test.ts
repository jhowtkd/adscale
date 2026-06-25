import { describe, it, expect } from "vitest";
import "./contracts";
import { ACTION_CONTRACT_REGISTRY } from "./registry";

const QUICK_ACTION_TYPES = [
  "quick_restyle",
  "quick_format_adapt",
  "quick_regenerate",
  "quick_review",
  "quick_save_reference",
  "quick_package",
] as const;

const CAMPAIGN_BRIEF_FIELDS = [
  "productOffer",
  "audience",
  "objective",
  "cta",
  "platformOrFormat",
  "constraints",
  "brief",
  "campaignName",
];

describe("ACT-04 quick action contracts", () => {
  it.each(QUICK_ACTION_TYPES)("registers %s with quick_action intent", (actionType) => {
    const contract = ACTION_CONTRACT_REGISTRY[actionType];
    expect(contract).toBeDefined();
    expect(contract.intentFamily).toBe("quick_action");
    expect(contract.confirmationPolicy).toBe("required");
  });

  it("quick actions do not require full campaign brief fields", () => {
    for (const actionType of QUICK_ACTION_TYPES) {
      const contract = ACTION_CONTRACT_REGISTRY[actionType]!;
      for (const briefField of CAMPAIGN_BRIEF_FIELDS) {
        expect(contract.requiredFields).not.toContain(briefField);
      }
    }
  });

  it("quick_restyle only requires baseCreativeId", () => {
    expect(ACTION_CONTRACT_REGISTRY.quick_restyle.requiredFields).toEqual([
      "baseCreativeId",
    ]);
  });

  it("quick_format_adapt requires source and target format only", () => {
    expect(ACTION_CONTRACT_REGISTRY.quick_format_adapt.requiredFields).toEqual([
      "sourceDerivationId",
      "targetFormat",
    ]);
  });
});
