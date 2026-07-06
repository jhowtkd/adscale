import { describe, expect, it } from "vitest";
import {
  resolveCanonicalCreativePolicy,
  resolveFidelityVerdict,
} from "./canonical-creative-contract";

describe("resolveFidelityVerdict", () => {
  it.each([
    ["conservative", 75, "inside_range"],
    ["conservative", 74, "outside_range"],
    ["balanced", 60, "inside_range"],
    ["balanced", 59, "outside_range"],
    ["bold", 50, "inside_range"],
    ["extreme", 40, "inside_range"],
  ] as const)("level %s score %i is %s", (level, score, verdict) => {
    const policy = resolveCanonicalCreativePolicy("art_variation", level);
    expect(resolveFidelityVerdict(policy, score)).toBe(verdict);
  });
});
