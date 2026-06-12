import { describe, expect, it } from "vitest";
import { aggregateLearningsFromComparisons } from "./aggregate";
import type { ComparisonEvidenceInput } from "./aggregate";

function baseInput(
  overrides: Partial<ComparisonEvidenceInput> & {
    outcome: "supported" | "contradicted";
  }
): ComparisonEvidenceInput {
  const comparisonId = overrides.comparison?.id ?? crypto.randomUUID();
  const hypothesisId = overrides.hypothesis?.id ?? crypto.randomUUID();
  const campaignId = overrides.comparison?.campaignId ?? crypto.randomUUID();
  const derivationId = "variant-1";

  return {
    comparison: {
      id: comparisonId,
      workspaceId: "ws-1",
      campaignId,
      hypothesisId,
      kind: "controlled_hypothesis",
      verdict: "winner",
      primaryMetric: "ctr",
      expectedDirection: "increase",
      winnerDerivationId: derivationId,
      outcome: overrides.outcome,
      platform: "meta",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      exclusionReasons: [],
      variantResults: {
        kind: "controlled_hypothesis",
        verdict: "winner",
        primaryMetric: "ctr",
        expectedDirection: "increase",
        winnerDerivationId: derivationId,
        outcome: overrides.outcome,
        platform: "meta",
        objective: "conversions",
        period: { startDate: "2026-01-01", endDate: "2026-01-31" },
        exclusions: [],
        variants: [
          {
            derivationId,
            role: "variant",
            label: "Variante",
            raw: {
              impressions: "2500",
              clicks: "100",
              spend: "50",
              conversions: "10",
              conversionValue: "100",
            },
            derived: { ctr: "0.04", cpc: "0.5", cpa: "5", roas: "2" },
            primaryMetricValue: "0.04",
            period: { startDate: "2026-01-01", endDate: "2026-01-31" },
          },
        ],
        differences: [],
      },
      createdByUserId: "user-1",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
    hypothesis: {
      id: hypothesisId,
      workspaceId: "ws-1",
      campaignId,
      title: null,
      variableKey: "cta",
      primaryMetric: "ctr",
      expectedDirection: "increase",
      rationale: "test",
      kind: "controlled_hypothesis",
      platform: "meta",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      outcome: overrides.outcome,
      status: "concluded",
      lastComparisonAt: new Date(),
      createdByUserId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    variants: [
      {
        id: crypto.randomUUID(),
        hypothesisId,
        derivationId,
        role: "variant",
        label: "Variante",
        createdAt: new Date(),
      },
    ],
    derivations: new Map([
      [
        derivationId,
        {
          id: derivationId,
          campaignId,
          format: "story",
          generationMode: "art_variation",
          ctaText: "Comprar agora",
          styleAssetId: null,
        },
      ],
    ]),
    campaigns: new Map([
      [
        campaignId,
        {
          id: campaignId,
          name: "Campanha A",
          objective: "conversions",
          generationMode: "art_variation",
          styleIntensity: "medium",
        },
      ],
    ]),
    ...overrides,
  };
}

describe("aggregateLearningsFromComparisons", () => {
  it("creates supporting learning drafts from supported hypotheses", () => {
    const drafts = aggregateLearningsFromComparisons([
      baseInput({ outcome: "supported" }),
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.variableKey).toBe("cta");
    expect(drafts[0]?.variableValue).toBe("Comprar agora");
    expect(drafts[0]?.supportingEvidence).toHaveLength(1);
    expect(drafts[0]?.contradictingEvidence).toHaveLength(0);
  });

  it("records contradicting evidence separately", () => {
    const drafts = aggregateLearningsFromComparisons([
      baseInput({ outcome: "contradicted" }),
    ]);

    expect(drafts[0]?.contradictingEvidence).toHaveLength(1);
    expect(drafts[0]?.supportingEvidence).toHaveLength(0);
  });
});
