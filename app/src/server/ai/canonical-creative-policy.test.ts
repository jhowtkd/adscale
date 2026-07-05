import { describe, expect, it } from "vitest";
import { resolveCanonicalCreativePolicy } from "./canonical-creative-contract";

describe("resolveCanonicalCreativePolicy", () => {
  it.each(["conservative", "balanced", "bold", "extreme"] as const)(
    "keeps %s as the requested fidelity band",
    (level) => {
      expect(resolveCanonicalCreativePolicy("art_variation", level).fidelityLevel).toBe(level);
    }
  );

  it("makes CTA optional and preserves action intent", () => {
    expect(resolveCanonicalCreativePolicy("art_variation", "balanced").cta).toEqual({
      presence: "optional",
      wording: "preserve_action_intent",
    });
  });

  it("keeps fixed layout numbers advisory", () => {
    expect(resolveCanonicalCreativePolicy("format_adaptation", "balanced").heuristics).toEqual([
      "three_zones",
      "free_space_20_percent",
      "safe_margin_8_percent",
      "thumbnail_25_percent",
    ]);
  });
});
