import { describe, expect, it } from "vitest";
import {
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
