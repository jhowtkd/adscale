import { describe, it, expect } from "vitest";
import "./contracts";
import {
  ACTION_CONTRACT_REGISTRY,
  getActionContract,
} from "./registry";

describe("ACTION_CONTRACT_REGISTRY", () => {
  it("contains quick_restyle with quick_action intent and restyling credits", () => {
    const contract = ACTION_CONTRACT_REGISTRY.quick_restyle;
    expect(contract).toBeDefined();
    expect(contract.actionType).toBe("quick_restyle");
    expect(contract.intentFamily).toBe("quick_action");
    expect(contract.confirmationPolicy).toBe("required");
    expect(contract.creditImpact).toEqual({
      kind: "creditAction",
      action: "restyling",
      label: "5 créditos",
    });
    expect(contract.requiredFields).toEqual(["baseCreativeId"]);
  });

  it("contains start_complete_campaign with complete_campaign intent", () => {
    const contract = ACTION_CONTRACT_REGISTRY.start_complete_campaign;
    expect(contract).toBeDefined();
    expect(contract.actionType).toBe("start_complete_campaign");
    expect(contract.intentFamily).toBe("complete_campaign");
    expect(contract.confirmationPolicy).toBe("required");
    expect(contract.creditImpact).toMatchObject({
      kind: "creditAction",
      action: "creative_plan",
    });
    expect(contract.requiredFields).toEqual([
      "productOffer",
      "audience",
      "objective",
      "cta",
      "platformOrFormat",
      "constraints",
      "baseCreativeId",
    ]);
  });

  it("returns undefined for unknown action types", () => {
    expect(getActionContract("unknown")).toBeUndefined();
  });
});
