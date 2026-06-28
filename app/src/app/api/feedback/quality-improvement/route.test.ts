import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/human-quality/improvement/service", () => ({
  runQualityImprovement: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runQualityImprovement } from "@/server/human-quality/improvement/service";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockRunQualityImprovement = vi.mocked(runQualityImprovement);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

function makeComparison(index: number) {
  return {
    corpusItemId: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
    derivationId: `deriv-${index}`,
    generationMode: "art_variation",
    format: "1:1",
    cohort: index % 2 === 0 ? "baseline" : "post_learning",
    automaticQualityScore: 80,
    humanVisualScore: 60,
    scoreDelta: 20,
    absError: 20,
    primaryFailureReason: "visual_overload" as const,
    factualPass: true,
    qualityVerdict: "improvable",
    hardFailureCodes: [],
  };
}

const baseReport = {
  schemaVersion: 1 as const,
  rubricCalibrationVersion: "1.1.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  status: "ok" as const,
  targetedFailureReasons: [
    "visual_overload",
    "weak_hierarchy",
    "generic_template_feel",
    "illegible_cta",
    "unfocused_composition",
  ] as const,
  visualMetrics: {
    failureFrequencyBefore: {
      visual_overload: { count: 3, rate: 0.2 },
      weak_hierarchy: { count: 3, rate: 0.2 },
      generic_template_feel: { count: 3, rate: 0.2 },
      illegible_cta: { count: 3, rate: 0.2 },
      unfocused_composition: { count: 3, rate: 0.2 },
    },
    failureFrequencyAfter: {
      visual_overload: { count: 3, rate: 0.2 },
      weak_hierarchy: { count: 3, rate: 0.2 },
      generic_template_feel: { count: 3, rate: 0.2 },
      illegible_cta: { count: 3, rate: 0.2 },
      unfocused_composition: { count: 3, rate: 0.2 },
    },
    deltaRateByReason: {
      visual_overload: -0.05,
      weak_hierarchy: 0,
      generic_template_feel: 0,
      illegible_cta: 0,
      unfocused_composition: 0,
    },
  },
  factualMetrics: {
    factualPassRateBefore: 0.9,
    factualPassRateAfter: 0.95,
  },
  fixtureMetrics: {
    targetedArchetypePassRateBefore: 1,
    targetedArchetypePassRateAfter: 1,
  },
  acceptedAdjustments: [
    {
      adjustmentId: "adj-1",
      targetModule: "score_ceiling",
      targetKey: "visual_overload",
    },
  ],
};

describe("/api/feedback/quality-improvement GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockRunQualityImprovement.mockResolvedValue({
      report: baseReport,
      comparisons: Array.from({ length: 6 }, (_, index) => makeComparison(index)),
    });
  });

  it("allows platform-owner global rollup without workspaceId", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/quality-improvement"));

    expect(res.status).toBe(200);
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mockRunQualityImprovement).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
      improvementDeployedAt: undefined,
      capturedAt: expect.any(String),
    });
  });

  it("allows workspace admin with scoped workspaceId", async () => {
    mockRequireAccess.mockResolvedValue({
      user: { id: "admin-1", email: "admin@test.com" },
      scope: "workspace-admin",
      workspaceId: WORKSPACE_ID,
    });

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/quality-improvement?workspaceId=${WORKSPACE_ID}&cohort=baseline`
      )
    );

    expect(res.status).toBe(200);
    expect(mockRunQualityImprovement).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      improvementDeployedAt: undefined,
      capturedAt: expect.any(String),
    });
  });

  it("returns 403 for non-admin member", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/quality-improvement"));

    expect(res.status).toBe(403);
    expect(mockRunQualityImprovement).not.toHaveBeenCalled();
  });

  it("caps comparisons at 100 with truncated flag", async () => {
    const manyComparisons = Array.from({ length: 150 }, (_, index) => makeComparison(index));
    mockRunQualityImprovement.mockResolvedValue({
      report: baseReport,
      comparisons: manyComparisons,
    });

    const res = await GET(new Request("http://localhost/api/feedback/quality-improvement"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.comparisons).toHaveLength(100);
    expect(body.report.truncated).toBe(true);
    expect(body.report.totalComparisonCount).toBe(150);
  });

  it("rejects invalid cohort query param", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/quality-improvement?cohort=invalid")
    );

    expect(res.status).toBe(400);
    expect(mockRunQualityImprovement).not.toHaveBeenCalled();
  });

  it("passes improvementDeployedAt when provided", async () => {
    const deployedAt = "2026-06-10T00:00:00.000Z";
    const res = await GET(
      new Request(
        `http://localhost/api/feedback/quality-improvement?improvementDeployedAt=${encodeURIComponent(deployedAt)}`
      )
    );

    expect(res.status).toBe(200);
    expect(mockRunQualityImprovement).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
      improvementDeployedAt: deployedAt,
      capturedAt: expect.any(String),
    });
  });
});
