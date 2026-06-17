import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/human-quality/impact/service", () => ({
  runLearningImpact: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runLearningImpact } from "@/server/human-quality/impact/service";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockRunImpact = vi.mocked(runLearningImpact);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

function makeImpactRow(index: number) {
  return {
    corpusItemId: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
    clientProfileId: "550e8400-e29b-41d4-a716-446655440010",
    generationMode: "art_variation",
    format: "1:1",
    cohort: "baseline",
    learningApplied: index % 2 === 0,
    applicationResolution: index % 2 === 0 ? ("recorded" as const) : ("not_recorded" as const),
    visualScore: 70 + index,
    factualPass: true,
    intent: "approve",
  };
}

const baseReport = {
  schemaVersion: 1 as const,
  learningImpactVersion: "1.0.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  status: "ok" as const,
  evaluatedItemCount: 6,
  insufficientReasons: [] as string[],
  learningImpactMetrics: {
    learnedCount: 3,
    nonLearnedCount: 3,
    unlabeledCount: 0,
    slices: [],
    globalVisualScoreDelta: 12,
  },
  intentMetrics: {
    learned: { rejectRate: 0, regenerateRate: 0.33 },
    nonLearned: { rejectRate: 0.33, regenerateRate: 0 },
  },
  visualMovementMetrics: {
    learnedMeanVisualScore: 82,
    nonLearnedMeanVisualScore: 70,
    deltaLearnedMinusNonLearned: 12,
  },
  factualMetrics: {
    learnedFactualPassRate: 1,
    nonLearnedFactualPassRate: 0.67,
  },
  rows: Array.from({ length: 6 }, (_, index) => makeImpactRow(index)),
};

describe("/api/feedback/learning-impact GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockRunImpact.mockResolvedValue({ report: baseReport });
  });

  it("allows platform-owner global rollup without workspaceId", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/learning-impact"));

    expect(res.status).toBe(200);
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mockRunImpact).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
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
        `http://localhost/api/feedback/learning-impact?workspaceId=${WORKSPACE_ID}&cohort=baseline`
      )
    );

    expect(res.status).toBe(200);
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), WORKSPACE_ID);
    expect(mockRunImpact).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      capturedAt: expect.any(String),
    });
  });

  it("returns 403 for non-admin member", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/learning-impact"));

    expect(res.status).toBe(403);
    expect(mockRunImpact).not.toHaveBeenCalled();
  });

  it("caps rows at 100 with truncated flag", async () => {
    const manyRows = Array.from({ length: 150 }, (_, index) => makeImpactRow(index));
    mockRunImpact.mockResolvedValue({
      report: {
        ...baseReport,
        evaluatedItemCount: 150,
        rows: manyRows,
      },
    });

    const res = await GET(new Request("http://localhost/api/feedback/learning-impact"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.rows).toHaveLength(100);
    expect(body.report.truncated).toBe(true);
    expect(body.report.totalRowCount).toBe(150);
  });

  it("rejects invalid cohort query param", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/learning-impact?cohort=invalid")
    );

    expect(res.status).toBe(400);
    expect(mockRunImpact).not.toHaveBeenCalled();
  });

  it("rejects invalid workspaceId query param", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/learning-impact?workspaceId=not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(mockRunImpact).not.toHaveBeenCalled();
  });
});
