import { describe, expect, it } from "vitest";
import type { CreativePerformanceSnapshot } from "../../db/schema";
import { compareVariants } from "./compare";

function snap(
  overrides: Partial<CreativePerformanceSnapshot> & {
    derivationId: string;
    platform?: string;
    startDate?: string;
    endDate?: string;
    impressions?: string;
    clicks?: string;
    spend?: string;
    conversions?: string;
    conversionValue?: string;
  }
): CreativePerformanceSnapshot {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: "ws-1",
    clientProfileId: "cp-1",
    campaignId: "camp-1",
    derivationId: overrides.derivationId,
    platform: overrides.platform ?? "meta",
    placement: "feed",
    placementRaw: "feed",
    adAccountId: null,
    startDate: overrides.startDate ?? "2026-01-01",
    endDate: overrides.endDate ?? "2026-01-31",
    sourceTimezone: "America/Sao_Paulo",
    currency: "BRL",
    impressions: overrides.impressions ?? "5000",
    clicks: overrides.clicks ?? "100",
    spend: overrides.spend ?? "200",
    conversions: overrides.conversions ?? "10",
    conversionValue: overrides.conversionValue ?? "1000",
    sourceType: "manual",
    externalCampaignId: null,
    externalAdGroupId: null,
    externalAdId: null,
    sourceKey: `key-${overrides.derivationId}`,
    scopeKind: "total",
    scopeDimensions: null,
    sourceMetadata: null,
    createdByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("compareVariants", () => {
  const baseInput = {
    kind: "controlled_hypothesis" as const,
    campaignId: "camp-1",
    campaignObjective: "conversions",
    platform: "meta" as string | null,
    periodStart: null as string | null,
    periodEnd: null as string | null,
    primaryMetric: "ctr" as const,
    expectedDirection: "increase" as const,
  };

  it("returns not_comparable when platforms differ", () => {
    const report = compareVariants({
      ...baseInput,
      platform: null,
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1", platform: "meta" })]],
        ["d2", [snap({ derivationId: "d2", platform: "google" })]],
      ]),
    });

    expect(report.verdict).toBe("not_comparable");
    expect(report.exclusions.some((e) => e.code === "platform_mismatch")).toBe(true);
  });

  it("returns not_comparable when periods do not overlap", () => {
    const report = compareVariants({
      ...baseInput,
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        [
          "d1",
          [
            snap({
              derivationId: "d1",
              startDate: "2026-01-01",
              endDate: "2026-01-15",
            }),
          ],
        ],
        [
          "d2",
          [
            snap({
              derivationId: "d2",
              startDate: "2026-02-01",
              endDate: "2026-02-28",
            }),
          ],
        ],
      ]),
    });

    expect(report.verdict).toBe("not_comparable");
    expect(report.exclusions.some((e) => e.code === "period_no_overlap")).toBe(true);
  });

  it("returns insufficient_evidence when impressions are below threshold", () => {
    const report = compareVariants({
      ...baseInput,
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1", impressions: "100", clicks: "0" })]],
        ["d2", [snap({ derivationId: "d2", impressions: "100", clicks: "0" })]],
      ]),
    });

    expect(report.verdict).toBe("insufficient_evidence");
    expect(report.outcome).toBe("inconclusive");
  });

  it("returns insufficient_evidence on zero denominators for ctr", () => {
    const report = compareVariants({
      ...baseInput,
      primaryMetric: "ctr",
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1", impressions: "0", clicks: "0" })]],
        ["d2", [snap({ derivationId: "d2", impressions: "0", clicks: "0" })]],
      ]),
    });

    expect(report.verdict).toBe("insufficient_evidence");
  });

  it("declares winner when gap exceeds threshold and outcome supported", () => {
    const report = compareVariants({
      ...baseInput,
      expectedDirection: "increase",
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1", impressions: "10000", clicks: "100" })]],
        ["d2", [snap({ derivationId: "d2", impressions: "10000", clicks: "300" })]],
      ]),
    });

    expect(report.verdict).toBe("winner");
    expect(report.winnerDerivationId).toBe("d2");
    expect(report.outcome).toBe("supported");
  });

  it("returns no_clear_winner when metrics are too close", () => {
    const report = compareVariants({
      ...baseInput,
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1", impressions: "10000", clicks: "200" })]],
        ["d2", [snap({ derivationId: "d2", impressions: "10000", clicks: "205" })]],
      ]),
    });

    expect(report.verdict).toBe("no_clear_winner");
    expect(report.outcome).toBe("inconclusive");
  });

  it("returns not_comparable when campaign objective is missing", () => {
    const report = compareVariants({
      ...baseInput,
      campaignObjective: null,
      variants: [
        { derivationId: "d1", campaignId: "camp-1", role: "control" },
        { derivationId: "d2", campaignId: "camp-1", role: "variant" },
      ],
      snapshotsByDerivation: new Map([
        ["d1", [snap({ derivationId: "d1" })]],
        ["d2", [snap({ derivationId: "d2" })]],
      ]),
    });

    expect(report.verdict).toBe("not_comparable");
    expect(report.exclusions.some((e) => e.code === "missing_objective")).toBe(true);
  });
});
