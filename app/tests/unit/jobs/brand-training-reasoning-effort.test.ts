import { describe, expect, it } from "vitest";

import { lowestReasoningEffort } from "@/server/ai/utils";

// The lowest reasoning level each model accepts, measured against the API on 2026-10-05 (ticket 22); a wrong value is a 400.
// Unmeasured gpt-5.x / gpt-6* / o* models (gpt-6, gpt-6.2-sol, gpt-5.7) fall back to "low", the only value every measured
// reasoning model accepted. Non-reasoning models must not receive the field.
describe("lowestReasoningEffort", () => {
  it.each([
    ["gpt-6-luna", "none"],
    ["gpt-6-sol", "none"],
    ["gpt-5.1", "none"],
    ["gpt-5.2", "none"],
    ["gpt-5.5", "none"],
    ["gpt-5.6", "none"],
    ["gpt-5.6-luna", "none"],
    ["gpt-5.6-sol", "none"],
    ["gpt-5.6-terra", "none"],
    ["gpt-6-luna-2026-09-01", "none"],
    ["gpt-5", "minimal"],
    ["gpt-5-mini", "minimal"],
    ["gpt-5-nano", "minimal"],
    ["gpt-5-mini-2025-08-07", "minimal"],
    ["gpt-6.1-sol", "low"],
    ["gpt-6-astra", "low"],
    ["o3", "low"],
    ["o4-mini", "low"],
    ["gpt-6", "low"],
    ["gpt-6.2-sol", "low"],
    ["gpt-5.7", "low"],
    ["gpt-4o-mini", undefined],
    ["gpt-4.1", undefined],
    ["gpt-4.1-mini", undefined],
    ["gpt-60", undefined],
    ["", undefined],
  ] as const)("%j -> %s", (model, expected) => {
    expect(lowestReasoningEffort(model)).toBe(expected);
  });
});
