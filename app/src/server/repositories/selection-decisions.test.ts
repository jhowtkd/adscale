import { describe, expect, it, vi } from "vitest";
import type { CreativeWorkSelectionDecision } from "../db/schema";
vi.mock("../db", () => ({ db: {} }));
import { groupSelectionDecisionSupport } from "./selection-decisions";

const base = { workspaceId: "workspace", clientProfileId: "brand", workItemId: "work", userId: "human",
  contextSnapshot: { format: "4:5", generationMode: "single", creativeLevel: "balanced" } };
const entry = (id: string, outputId: string, isCurrent: boolean, changes = {}) => ({
  decision: { ...base, id, outputId, ...changes } as CreativeWorkSelectionDecision, isCurrent,
});

describe("selection support grouping", () => {
  it("retains all three deliberate A→B→A identities in one sample and identifies current support", () => {
    expect(groupSelectionDecisionSupport([entry("first", "A", false), entry("second", "B", false), entry("third", "A", true)]))
      .toEqual([{ groupKey: expect.any(String), decisionIds: ["first", "second", "third"], currentDecisionId: "third" }]);
  });

  it("keeps different people, works and contexts independent while JSON key order cannot multiply a sample", () => {
    const groups = groupSelectionDecisionSupport([entry("A", "output", false),
      entry("repeat", "output", true, { contextSnapshot: { creativeLevel: "balanced", generationMode: "single", format: "4:5" } }),
      entry("person", "output", false, { userId: "other" }), entry("work", "output", false, { workItemId: "other" }),
      entry("context", "output", false, { contextSnapshot: { ...base.contextSnapshot, format: "9:16" } }),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toMatchObject({ decisionIds: ["A", "repeat"], currentDecisionId: "repeat" });
    expect(groups.slice(1).map(group => group.decisionIds)).toEqual([["person"], ["work"], ["context"]]);
  });
});
