import { describe, expect, it } from "vitest";
import type { JourneyState } from "./state";
import { transitionJourney, GuidedTransitionError } from "./transition";

function baseState(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    id: "flow-1",
    workspaceId: "ws-1",
    clientProfileId: "cp-1",
    threadId: "thread-1",
    path: "from_zero",
    status: "active",
    currentStep: "select_references",
    revision: 2,
    schemaVersion: 1,
    slots: {
      navigationHistory: ["collect_brief", "select_references"],
      answers: { product: { value: "Shoes", source: "user", confirmed: true } },
    },
    missingFields: [],
    assetIds: [],
    referenceIds: ["r1", "r2", "r3"],
    campaignId: null,
    recoverableError: null,
    ...overrides,
  };
}

describe("transitionJourney", () => {
  it("goes back to the previous from_zero step", () => {
    const result = transitionJourney(baseState(), { type: "back" });
    expect(result.state.currentStep).toBe("collect_brief");
  });

  it("rejects back at the first step", () => {
    expect(() =>
      transitionJourney(
        baseState({ currentStep: "collect_brief", slots: { navigationHistory: ["collect_brief"] } }),
        { type: "back" }
      )
    ).toThrow(GuidedTransitionError);
  });

  it("invalidates dependent fields on edit_field", () => {
    const state = baseState({
      path: "from_zero",
      currentStep: "collect_brief",
      slots: {
        navigationHistory: ["collect_brief"],
        answers: { product: { value: "Old", source: "user", confirmed: true } },
        recommendedAction: "creative_plan",
        diagnosis: { summary: "x" },
      },
    });

    const result = transitionJourney(state, {
      type: "edit_field",
      field: "offer",
      value: "50% off",
    });

    expect(result.state.slots.answers?.offer?.value).toBe("50% off");
    expect(result.state.slots.recommendedAction).toBeUndefined();
    expect(result.state.slots.staleFields).toContain("offer");
  });

  it("returns retention preview without mutating state", () => {
    const state = baseState({ path: "from_zero" });
    const result = transitionJourney(state, {
      type: "preview_switch",
      path: "existing_creative",
    });

    expect(result.noop).toBe(true);
    expect(result.preview?.cleared).toContain("referenceIds");
    expect(result.state.revision).toBe(state.revision);
  });

  it("restarts from_zero journey with cleared slots", () => {
    const result = transitionJourney(baseState(), { type: "restart" });
    expect(result.state.currentStep).toBe("collect_brief");
    expect(result.state.referenceIds).toEqual([]);
    expect(result.state.slots.answers).toEqual({});
  });

  it("select_path initializes unclassified flow", () => {
    const result = transitionJourney(
      baseState({ path: "unclassified", currentStep: "start" }),
      { type: "select_path", path: "existing_creative" }
    );
    expect(result.state.path).toBe("existing_creative");
    expect(result.state.currentStep).toBe("select_creative");
  });
});
