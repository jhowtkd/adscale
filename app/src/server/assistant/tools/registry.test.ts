import { describe, expect, it } from "vitest";
import { listToolsForProvider } from "./registry";

describe("assistant tool provider schemas", () => {
  it("preserves nested update_goal_plan types for MiniMax tool calls", () => {
    const tool = listToolsForProvider().find(
      (candidate) => candidate.name === "update_goal_plan"
    );

    expect(tool?.parameters).toMatchObject({
      type: "object",
      properties: {
        expectedRevision: { type: "number" },
        brief: {
          type: "object",
          properties: {
            productOffer: { type: "string" },
            referenceIds: { type: "array", items: { type: "string" } },
            baseAssetId: { type: ["string", "null"] },
          },
        },
        plan: {
          type: "object",
          properties: {
            strategy: { type: "string" },
            angles: { type: "array", items: { type: "string" } },
          },
        },
        assumptions: { type: "array", items: { type: "string" } },
      },
    });
  });
});
