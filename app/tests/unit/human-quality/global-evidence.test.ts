import { describe, expect, it } from "vitest";
import { buildSampleCoverageReport } from "@/server/human-quality/sampling/coverage";
import {
  buildGlobalCorpusEvidenceReport,
  emptySourceComposition,
  evaluateGlobalCorpusClaims,
  groupEvaluationsByClientProfile,
  isFixtureOnlySourceComposition,
  resolveOperationalStatus,
} from "@/server/human-quality/global-evidence";

const emptyCoverageInput = {
  capturedAt: "2026-06-20T00:00:00.000Z",
  calibration: {
    status: "insufficient_corpus" as const,
    evaluatedItemCount: 0,
    sampleGuidance: [],
  },
  impact: { status: "insufficient_sample" as const, evaluatedItemCount: 0, sampleGuidance: [] },
  quality: { status: "insufficient_sample" as const, sampleGuidance: [] },
  trend: {
    status: "insufficient_sample" as const,
    sampleGuidance: [],
    evaluatedItemCount: 0,
    populatedBucketCount: 0,
  },
};

const passingCoverageInput = {
  capturedAt: "2026-06-20T00:00:00.000Z",
  calibration: { status: "ok" as const, evaluatedItemCount: 10, sampleGuidance: [] },
  impact: { status: "ok" as const, evaluatedItemCount: 10, sampleGuidance: [] },
  quality: { status: "ok" as const, sampleGuidance: [] },
  trend: {
    status: "ok" as const,
    sampleGuidance: [],
    evaluatedItemCount: 10,
    populatedBucketCount: 3,
  },
};

describe("global-evidence", () => {
  it("groups evaluated rows by client profile without mixing workspaces", () => {
    const scopes = groupEvaluationsByClientProfile([
      {
        item: {
          clientProfileId: "client-a",
          workspaceId: "ws-1",
        },
      },
      {
        item: {
          clientProfileId: "client-a",
          workspaceId: "ws-2",
        },
      },
      {
        item: {
          clientProfileId: "client-a",
          workspaceId: "ws-1",
        },
      },
    ] as never);

    expect(scopes).toHaveLength(2);
    expect(scopes.find((s) => s.workspaceId === "ws-1")?.evaluationCount).toBe(2);
    expect(scopes.find((s) => s.workspaceId === "ws-2")?.evaluationCount).toBe(1);
  });

  it("marks fixture-only when no real_customer rows exist", () => {
    expect(
      isFixtureOnlySourceComposition({
        synthetic_fixture: 3,
        operator_imported: 1,
        real_customer: 0,
      })
    ).toBe(true);
  });

  it("treats operator-only scope as fixture-only for customer-real claims", () => {
    expect(
      isFixtureOnlySourceComposition({
        synthetic_fixture: 0,
        operator_imported: 8,
        real_customer: 0,
      })
    ).toBe(true);
  });

  it("blocks validated_against_customer_real for synthetic-only scope", () => {
    const coverage = buildSampleCoverageReport(passingCoverageInput);
    const claims = evaluateGlobalCorpusClaims({
      evaluatedItemCount: 10,
      fixtureOnly: isFixtureOnlySourceComposition({
        synthetic_fixture: 10,
        operator_imported: 0,
        real_customer: 0,
      }),
      operationalStatus: "ok",
      sampleCoverage: coverage,
    });

    expect(claims.claimsBlocked).toContain("validated_against_customer_real");
    expect(claims.claimsAllowed).not.toContain("validated_against_customer_real");
  });

  it("blocks validated_against_customer_real for operator-only scope", () => {
    const coverage = buildSampleCoverageReport(passingCoverageInput);
    const claims = evaluateGlobalCorpusClaims({
      evaluatedItemCount: 10,
      fixtureOnly: isFixtureOnlySourceComposition({
        synthetic_fixture: 0,
        operator_imported: 10,
        real_customer: 0,
      }),
      operationalStatus: "ok",
      sampleCoverage: coverage,
    });

    expect(claims.claimsBlocked).toContain("validated_against_customer_real");
    expect(claims.dependsOnOperator.some((m) => m.includes("real_customer"))).toBe(true);
  });

  it("blocks validated_against_customer_real for mixed operator and synthetic without real customer", () => {
    const coverage = buildSampleCoverageReport(passingCoverageInput);
    const claims = evaluateGlobalCorpusClaims({
      evaluatedItemCount: 12,
      fixtureOnly: isFixtureOnlySourceComposition({
        synthetic_fixture: 5,
        operator_imported: 7,
        real_customer: 0,
      }),
      operationalStatus: "ok",
      sampleCoverage: coverage,
    });

    expect(claims.claimsBlocked).toContain("validated_against_customer_real");
    expect(claims.claimsAllowed).not.toContain("validated_against_customer_real");
  });

  it("allows validated_against_customer_real when real_customer sufficiency and sampling gates pass", () => {
    const coverage = buildSampleCoverageReport(passingCoverageInput);
    const claims = evaluateGlobalCorpusClaims({
      evaluatedItemCount: 10,
      fixtureOnly: isFixtureOnlySourceComposition({
        synthetic_fixture: 2,
        operator_imported: 1,
        real_customer: 7,
      }),
      operationalStatus: "ok",
      sampleCoverage: coverage,
    });

    expect(claims.claimsAllowed).toContain("validated_against_customer_real");
    expect(claims.claimsBlocked).not.toContain("validated_against_customer_real");
  });

  it("returns human_needed when no evaluations exist", () => {
    const coverage = buildSampleCoverageReport(emptyCoverageInput);
    expect(resolveOperationalStatus(coverage)).toBe("human_needed");
  });

  it("blocks global improvement claims until sampling gates pass", () => {
    const coverage = buildSampleCoverageReport(emptyCoverageInput);
    const claims = evaluateGlobalCorpusClaims({
      evaluatedItemCount: 0,
      fixtureOnly: true,
      operationalStatus: "human_needed",
      sampleCoverage: coverage,
    });

    expect(claims.claimsBlocked).toContain("global_calibration_reports_available");
    expect(claims.dependsOnOperator[0]).toMatch(/Evaluate pending global corpus items/i);
  });

  it("builds a global evidence report with source composition and client scopes", () => {
    const coverage = buildSampleCoverageReport(emptyCoverageInput);
    const report = buildGlobalCorpusEvidenceReport({
      capturedAt: "2026-06-20T00:00:00.000Z",
      evaluatedItemCount: 2,
      pendingItemCount: 4,
      sourceComposition: {
        ...emptySourceComposition(),
        synthetic_fixture: 2,
      },
      sampleCoverage: coverage,
      brandTasteClientScopes: [
        { clientProfileId: "client-a", workspaceId: "ws-1", evaluationCount: 2 },
      ],
    });

    expect(report.fixtureOnly).toBe(true);
    expect(report.brandTasteClientScopes).toHaveLength(1);
    expect(report.claimsAllowed).toContain("global_corpus_evaluations_recorded");
    expect(report.claimsBlocked).toContain("validated_against_customer_real");
  });
});
