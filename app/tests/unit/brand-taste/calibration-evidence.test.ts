import { describe, expect, it } from "vitest";
import {
  buildBrandProfilesFromSignals,
  buildPerBrandEvidenceReport,
  evaluateClaimsMatrix,
} from "@/server/brand-taste/calibration-evidence";
import type { CalibrationSignal } from "@/server/db/schema";

function signal(overrides: Partial<CalibrationSignal> = {}): CalibrationSignal {
  return {
    id: `sig-${Math.random()}`,
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: `deriv-${Math.random()}`,
    outputDecisionEventId: null,
    humanVerdict: "entra",
    systemOlharVerdict: "pronta",
    systemExportStatus: "pronta",
    mismatchBucket: null,
    sourceLabel: "synthetic_fixture",
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: null,
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("buildPerBrandEvidenceReport", () => {
  it("fixture-only 15 decisions → assisted, fixtureOnly, validated_against_customer_real blocked", () => {
    const signals = Array.from({ length: 15 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(report.evidenceLevel).toBe("assisted");
    expect(report.fixtureOnly).toBe(true);
    expect(report.claimsBlocked).toContain("validated_against_customer_real");
    expect(report.fixtureCaveat).toBe(
      "Evidência apenas de fixture/operador — não validado com cliente real"
    );
    expect(report.schemaVersion).toBe(1);
  });

  it("mixed-source (3 real_customer, 12 total) → evidence_backed when thresholds met", () => {
    const signals = [
      ...Array.from({ length: 9 }, (_, i) =>
        signal({ id: `fix-${i}`, derivationId: `deriv-fix-${i}` })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        signal({
          id: `real-${i}`,
          derivationId: `deriv-real-${i}`,
          sourceLabel: "real_customer",
        })
      ),
    ];

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(report.evidenceLevel).toBe("evidence_backed");
    expect(report.fixtureOnly).toBe(false);
    expect(report.claimsAllowed).toContain("validated_against_customer_real");
    expect(report.sourceComposition.real_customer).toBe(3);
    expect(report.decisionCount).toBe(12);
  });

  it("missingConditions includes seed gate when decisionCount < 5", () => {
    const signals = Array.from({ length: 3 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(report.missingConditions.some((c) => c.includes("calibração inicial"))).toBe(
      true
    );
    expect(report.missingConditions.some((c) => c.includes("5"))).toBe(true);
  });

  it("missingConditions includes customer-real gate when real_customer === 0 and decisionCount > 0", () => {
    const signals = Array.from({ length: 7 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(
      report.missingConditions.some((c) =>
        c.toLowerCase().includes("cliente real")
      )
    ).toBe(true);
  });

  it("withheldClaims is subset of claimsBlocked for customer-real and commercial keys", () => {
    const signals = Array.from({ length: 15 }, (_, i) =>
      signal({ id: `sig-${i}`, derivationId: `deriv-${i}` })
    );

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    const withheldKeys = [
      "customer_real_validation",
      "commercial_quality_claim",
      "validated_against_customer_real",
    ];

    for (const key of report.withheldClaims) {
      expect(report.claimsBlocked).toContain(key);
      expect(withheldKeys).toContain(key);
    }
    expect(report.withheldClaims).toContain("validated_against_customer_real");
    expect(report.withheldClaims).toContain("customer_real_validation");
    expect(report.withheldClaims).toContain("commercial_quality_claim");
  });

  it("keeps synthetic_fixture, operator_imported and real_customer separate in sourceComposition", () => {
    const signals = [
      ...Array.from({ length: 4 }, (_, i) =>
        signal({ id: `fix-${i}`, derivationId: `deriv-fix-${i}`, sourceLabel: "synthetic_fixture" })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        signal({
          id: `op-${i}`,
          derivationId: `deriv-op-${i}`,
          sourceLabel: "operator_imported",
        })
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        signal({
          id: `real-${i}`,
          derivationId: `deriv-real-${i}`,
          sourceLabel: "real_customer",
        })
      ),
    ];

    const report = buildPerBrandEvidenceReport({
      clientProfileId: "client-1",
      workspaceId: "ws-1",
      signals,
    });

    expect(report.sourceComposition).toEqual({
      synthetic_fixture: 4,
      operator_imported: 3,
      real_customer: 2,
    });
    expect(report.decisionCount).toBe(9);
    expect(report.fixtureOnly).toBe(false);
  });

  it("only counts signals for the selected clientProfileId when pool is filtered per brand", () => {
    const profileA = "11111111-1111-4111-8111-111111111111";
    const profileB = "22222222-2222-4222-8222-222222222222";

    const signalsForA = Array.from({ length: 8 }, (_, i) =>
      signal({
        id: `a-${i}`,
        clientProfileId: profileA,
        derivationId: `deriv-a-${i}`,
        sourceLabel: "synthetic_fixture",
      })
    );
    const signalsForB = [
      ...Array.from({ length: 5 }, (_, i) =>
        signal({
          id: `b-op-${i}`,
          clientProfileId: profileB,
          derivationId: `deriv-b-op-${i}`,
          sourceLabel: "operator_imported",
        })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        signal({
          id: `b-real-${i}`,
          clientProfileId: profileB,
          derivationId: `deriv-b-real-${i}`,
          sourceLabel: "real_customer",
        })
      ),
    ];

    const mixedPool = [...signalsForA, ...signalsForB];
    const filterForProfile = (clientProfileId: string) =>
      mixedPool.filter((entry) => entry.clientProfileId === clientProfileId);

    const reportA = buildPerBrandEvidenceReport({
      clientProfileId: profileA,
      workspaceId: "ws-1",
      signals: filterForProfile(profileA),
    });
    const reportB = buildPerBrandEvidenceReport({
      clientProfileId: profileB,
      workspaceId: "ws-1",
      signals: filterForProfile(profileB),
    });

    expect(reportA.decisionCount).toBe(8);
    expect(reportA.sourceComposition.real_customer).toBe(0);
    expect(reportA.fixtureOnly).toBe(true);
    expect(reportA.claimsBlocked).toContain("validated_against_customer_real");

    expect(reportB.decisionCount).toBe(8);
    expect(reportB.sourceComposition).toEqual({
      synthetic_fixture: 0,
      operator_imported: 5,
      real_customer: 3,
    });
    expect(reportB.fixtureOnly).toBe(false);
  });

  it("selected profile lacks real-customer sufficiency even when another profile has sufficient real_customer evidence", () => {
    const profileSelected = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const profileOther = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    const signalsForSelected = [
      ...Array.from({ length: 4 }, (_, i) =>
        signal({
          id: `sel-op-${i}`,
          clientProfileId: profileSelected,
          derivationId: `deriv-sel-op-${i}`,
          sourceLabel: "operator_imported",
        })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        signal({
          id: `sel-fix-${i}`,
          clientProfileId: profileSelected,
          derivationId: `deriv-sel-fix-${i}`,
          sourceLabel: "synthetic_fixture",
        })
      ),
    ];
    const signalsForOther = [
      ...Array.from({ length: 5 }, (_, i) =>
        signal({
          id: `oth-real-${i}`,
          clientProfileId: profileOther,
          derivationId: `deriv-oth-real-${i}`,
          sourceLabel: "real_customer",
        })
      ),
    ];

    const mixedPool = [...signalsForSelected, ...signalsForOther];
    const reportSelected = buildPerBrandEvidenceReport({
      clientProfileId: profileSelected,
      workspaceId: "ws-1",
      signals: mixedPool.filter((s) => s.clientProfileId === profileSelected),
    });

    expect(reportSelected.decisionCount).toBe(10);
    expect(reportSelected.sourceComposition).toEqual({
      synthetic_fixture: 6,
      operator_imported: 4,
      real_customer: 0,
    });
    expect(reportSelected.fixtureOnly).toBe(true);
    expect(reportSelected.claimsBlocked).toContain("validated_against_customer_real");
    expect(reportSelected.claimsAllowed).not.toContain("validated_against_customer_real");
    expect(reportSelected.withheldClaims).toContain("validated_against_customer_real");
    expect(reportSelected.fixtureCaveat).toBe(
      "Evidência apenas de fixture/operador — não validado com cliente real"
    );
  });

  it("buildBrandProfilesFromSignals keeps each clientProfileId evidence isolated", () => {
    const profileA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const profileB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const signalsByClient = new Map([
      [
        profileA,
        {
          workspaceId: "ws-1",
          signals: Array.from({ length: 6 }, (_, i) =>
            signal({
              id: `a-${i}`,
              clientProfileId: profileA,
              derivationId: `deriv-a-${i}`,
            })
          ),
        },
      ],
      [
        profileB,
        {
          workspaceId: "ws-1",
          signals: Array.from({ length: 12 }, (_, i) =>
            signal({
              id: `b-${i}`,
              clientProfileId: profileB,
              derivationId: `deriv-b-${i}`,
              sourceLabel: i < 3 ? "real_customer" : "synthetic_fixture",
            })
          ),
        },
      ],
    ]);

    const profiles = buildBrandProfilesFromSignals(signalsByClient);

    expect(profiles).toHaveLength(2);
    const brandA = profiles.find((p) => p.clientProfileId === profileA)!;
    const brandB = profiles.find((p) => p.clientProfileId === profileB)!;

    expect(brandA.decisionCount).toBe(6);
    expect(brandA.sourceComposition.real_customer).toBe(0);
    expect(brandB.decisionCount).toBe(12);
    expect(brandB.sourceComposition.real_customer).toBe(3);
    expect(brandB.evidenceLevel).toBe("evidence_backed");
    expect(brandA.evidenceLevel).toBe("seed_calibrated");
  });
});

describe("calibration-evidence claims matrix", () => {
  it("blocks agreement claims with zero human decisions", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 0,
      comparableCount: 0,
      agreementRate: null,
      fixtureOnly: true,
      evidenceLevel: "uncalibrated",
    });

    expect(result.claimsBlocked).toContain("agreement_rate_reported");
    expect(result.claimsBlocked).toContain("calibrated_from_operator_decisions");
  });

  it("allows seed calibration claim at 5 decisions", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 5,
      comparableCount: 3,
      agreementRate: 0.6,
      fixtureOnly: true,
      evidenceLevel: "seed_calibrated",
    });

    expect(result.claimsAllowed).toContain("calibrated_from_operator_decisions");
    expect(result.claimsBlocked).toContain("validated_against_customer_real");
  });

  it("blocks customer-real claim for fixture-only corpus", () => {
    const result = evaluateClaimsMatrix({
      humanDecisionCount: 15,
      comparableCount: 10,
      agreementRate: 0.8,
      fixtureOnly: true,
      evidenceLevel: "assisted",
    });

    expect(result.claimsBlocked).toContain("validated_against_customer_real");
    expect(result.claimsAllowed).toContain("system_applies_learned_brand_criteria");
  });
});
