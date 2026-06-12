import { describe, expect, it } from "vitest";
import { canonicalPerformanceSnapshotInputSchema } from "./validation";

const validInput = {
  campaignId: "550e8400-e29b-41d4-a716-446655440000",
  derivationId: "550e8400-e29b-41d4-a716-446655440001",
  platform: "meta",
  placementRaw: "Instagram Feed",
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  sourceTimezone: "America/Sao_Paulo",
  currency: "BRL",
  sourceType: "manual",
  scope: { kind: "total" },
  metrics: {
    impressions: "1000",
    clicks: "25",
    spend: "50.25",
    conversions: "2.5",
    conversionValue: "201",
  },
};

describe("canonical performance snapshot validation", () => {
  it("accepts a total snapshot", () => {
    expect(canonicalPerformanceSnapshotInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts an explicit segment and optional account", () => {
    expect(
      canonicalPerformanceSnapshotInputSchema.safeParse({
        ...validInput,
        adAccountId: "act-1",
        scope: { kind: "segment", dimensions: { country: "BR" } },
      }).success
    ).toBe(true);
  });

  it.each([
    [{ endDate: "2026-05-31" }, "endDate"],
    [{ currency: "brl" }, "currency"],
    [{ metrics: { ...validInput.metrics, spend: "-1" } }, "metrics"],
    [{ metrics: { ...validInput.metrics, clicks: "1001" } }, "clicks"],
    [{ scope: { kind: "segment", dimensions: {} } }, "scope"],
  ])("rejects invalid input %o", (change, expectedPath) => {
    const result = canonicalPerformanceSnapshotInputSchema.safeParse({
      ...validInput,
      ...change,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".").includes(expectedPath))).toBe(true);
    }
  });
});
