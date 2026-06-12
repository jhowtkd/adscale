import { describe, expect, it } from "vitest";
import { buildPerformanceSourceKey } from "./source-key";

const base = {
  sourceType: "csv" as const,
  derivationId: "derivation-1",
  platform: "meta" as const,
  placement: "feed" as const,
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  scope: { kind: "total" as const },
};

describe("performance source key", () => {
  it("is stable when optional IDs are absent", () => {
    expect(buildPerformanceSourceKey(base)).toBe(buildPerformanceSourceKey({ ...base }));
  });

  it("is stable for segment dimensions regardless of key order", () => {
    const first = buildPerformanceSourceKey({
      ...base,
      scope: { kind: "segment", dimensions: { country: "BR", device: "mobile" } },
    });
    const second = buildPerformanceSourceKey({
      ...base,
      scope: { kind: "segment", dimensions: { device: "mobile", country: "BR" } },
    });
    expect(first).toBe(second);
  });

  it.each([
    { adAccountId: "account-2" },
    { placement: "stories_reels" as const },
    { endDate: "2026-06-08" },
    { scope: { kind: "segment" as const, dimensions: { country: "BR" } } },
  ])("changes when identity changes: %o", (change) => {
    expect(buildPerformanceSourceKey({ ...base, ...change })).not.toBe(
      buildPerformanceSourceKey(base)
    );
  });
});
