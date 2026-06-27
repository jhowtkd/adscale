import { describe, expect, it } from "vitest";
import { journeyStateFromRow } from "./state";

const baseRow = {
  id: "flow-1",
  workspaceId: "00000000-0000-4000-8000-000000000001",
  clientProfileId: "00000000-0000-4000-8000-000000000002",
  threadId: "00000000-0000-4000-8000-000000000003",
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  slots: {},
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  revision: 0,
  schemaVersion: 1,
  recoverableError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("journeyStateFromRow", () => {
  it("rejects a path and step combination outside the versioned contract", () => {
    expect(() =>
      journeyStateFromRow({
        ...baseRow,
        currentStep: "review_diagnosis",
      } as never)
    ).toThrow(/invalid guided journey state/i);
  });

  it("migrates known legacy steps before parsing", () => {
    const state = journeyStateFromRow({
      ...baseRow,
      path: "existing_creative",
      currentStep: "await_diagnosis",
    } as never);

    expect(state.currentStep).toBe("review_diagnosis");
  });
});
