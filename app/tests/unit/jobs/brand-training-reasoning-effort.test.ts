import { describe, expect, it } from "vitest";

import { lowestReasoningEffort } from "@/server/ai/utils";

// The lowest reasoning level each model family accepts (ticket 22): "none" for gpt-6* and gpt-5.6*,
// "minimal" for gpt-5 / -mini / -nano, and the field must be omitted for everything else.
describe("lowestReasoningEffort", () => {
  it.each([
    ["gpt-6-luna", "none"],
    ["gpt-6-sol", "none"],
    ["gpt-6.1-sol", "none"],
    ["gpt-6", "none"],
    ["gpt-5.6", "none"],
    ["gpt-5.6-sol", "none"],
    ["gpt-5.6-luna", "none"],
    ["gpt-5", "minimal"],
    ["gpt-5-mini", "minimal"],
    ["gpt-5-nano", "minimal"],
    ["gpt-5-mini-2025-08-07", "minimal"],
    ["gpt-4o-mini", undefined],
    ["gpt-4.1", undefined],
    ["gpt-5.1", undefined],
    ["gpt-60", undefined],
    ["o3", undefined],
    ["", undefined],
  ] as const)("%j -> %s", (model, expected) => {
    expect(lowestReasoningEffort(model)).toBe(expected);
  });
});
