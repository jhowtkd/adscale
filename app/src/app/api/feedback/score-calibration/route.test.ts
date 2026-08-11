import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/human-quality/calibration/service", () => ({
  runScoreCalibration: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runScoreCalibration } from "@/server/human-quality/calibration/service";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockRunCalibration = vi.mocked(runScoreCalibration);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

function makeComparison(index: number) {
  return {
    corpusItemId: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
    derivationId: `550e8400-e29b-41d4-a716-44665545${String(index).padStart(4, "0")}`,
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    automaticQualityScore: 80,
    humanVisualScore: 65,
    scoreDelta: 15,
    absError: 15,
    primaryFailureReason: "weak_hierarchy" as const,
    factualPass: true,
    qualityVerdict: "improvable",
    hardFailureCodes: [],
  };
}

const baseReport = {
  schemaVersion: 1 as const,
  rubricCalibrationVersion: "1.0.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  snapshotCapturedAtNote: "Automatic scores use qualitySnapshot frozen at corpus selection time; not live re-scored.",
  status: "ok" as const,
  evaluatedItemCount: 5,
  visualMetrics: {
    meanAbsError: 12,
    meanSignedDelta: 8,
    overScoreCount: 1,
    underScoreCount: 0,
    divergenceByFailureReason: {},
    divergenceByMode: {},
    divergenceByFormat: {},
    comparisons: Array.from({ length: 5 }, (_, index) => makeComparison(index)),
  },
  factualMetrics: {
    factualPassRate: 0.8,
    factualFailCount: 1,
    highVisualButFactualFail: [],
  },
  adjustments: [],
};

describe("/api/feedback/score-calibration GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockRunCalibration.mockResolvedValue({
      report: baseReport,
      persistedAdjustments: [],
    });
  });

  it("allows platform-owner global rollup without workspaceId", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/score-calibration"));

    expect(res.status).toBe(200);
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mockRunCalibration).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
      capturedAt: expect.any(String),
    });
  });

  it("rejects workspace admin even with scoped workspaceId", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/score-calibration?workspaceId=${WORKSPACE_ID}&cohort=baseline`
      )
    );

    expect(res.status).toBe(403);
    expect(mockRunCalibration).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin member", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/score-calibration"));

    expect(res.status).toBe(403);
    expect(mockRunCalibration).not.toHaveBeenCalled();
  });

  it("caps comparisons at 100 with truncated flag", async () => {
    const manyComparisons = Array.from({ length: 150 }, (_, index) => makeComparison(index));
    mockRunCalibration.mockResolvedValue({
      report: {
        ...baseReport,
        evaluatedItemCount: 150,
        visualMetrics: {
          ...baseReport.visualMetrics,
          comparisons: manyComparisons,
        },
      },
      persistedAdjustments: [],
    });

    const res = await GET(new Request("http://localhost/api/feedback/score-calibration"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.visualMetrics.comparisons).toHaveLength(100);
    expect(body.report.truncated).toBe(true);
    expect(body.report.totalComparisonCount).toBe(150);
  });

  it("rejects invalid cohort query param", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/score-calibration?cohort=invalid")
    );

    expect(res.status).toBe(400);
    expect(mockRunCalibration).not.toHaveBeenCalled();
  });

  it("rejects invalid workspaceId query param", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/score-calibration?workspaceId=not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(mockRunCalibration).not.toHaveBeenCalled();
  });
});
