import { describe, expect, it } from "vitest";
import { normalizePlacement } from "./placement";

describe("placement normalization", () => {
  it.each([
    ["meta", "Instagram Feed", "feed"],
    ["meta", "Facebook Stories", "stories_reels"],
    ["google", "Google Search", "search"],
    ["google", "YouTube in-stream", "video"],
    ["tiktok", "TikTok Feed", "feed"],
  ] as const)("normalizes %s placement %s", (platform, raw, expected) => {
    expect(normalizePlacement(platform, raw)).toEqual({
      placement: expected,
      placementRaw: raw,
    });
  });

  it("keeps an unknown raw placement", () => {
    expect(normalizePlacement("other", "Provider Surface X")).toEqual({
      placement: "other",
      placementRaw: "Provider Surface X",
    });
  });

  it("rejects an empty placement", () => {
    expect(() => normalizePlacement("meta", "  ")).toThrow("Placement is required");
  });
});
