import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/server/human-quality/trend/service", () => ({
  runQualityTrend: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runQualityTrend } from "@/server/human-quality/trend/service";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockRunTrend = vi.mocked(runQualityTrend);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "660e8400-e29b-41d4-a716-446655440003";

const baseReport = {
  status: "ok" as const,
  evaluatedItemCount: 8,
  populatedBucketCount: 2,
  buckets: [
    {
      bucketKey: "2026-W23",
      periodStart: "2026-06-02T00:00:00.000Z",
      periodEnd: "2026-06-08T23:59:59.999Z",
      count: 4,
      meanHumanVisualScore: 74,
      factualPassRate: 1,
      learningImpactStatus: "ok" as const,
      evidenceRefs: null,
    },
  ],
  alertFlags: {
    insufficientCoverage: false,
    staleEvidence: false,
    regressionDetected: false,
  },
  sampleGuidance: [] as const,
  capturedAt: "2026-06-18T12:00:00.000Z",
  latestEvaluatedAt: "2026-06-17T10:00:00.000Z",
  evidenceSource: "live_human" as const,
};

describe("/api/feedback/quality-trend GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockRunTrend.mockResolvedValue({ report: baseReport });
  });

  it("returns 200 with QualityTrendReport for authorized platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/quality-trend"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report).toMatchObject({
      status: "ok",
      evaluatedItemCount: 8,
      buckets: expect.any(Array),
      alertFlags: expect.objectContaining({
        insufficientCoverage: false,
        staleEvidence: false,
        regressionDetected: false,
      }),
    });
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mockRunTrend).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
      generationMode: undefined,
      format: undefined,
      clientProfileId: undefined,
      primaryFailureReason: undefined,
      capturedAt: expect.any(String),
    });
  });

  it("passes dimensional filters to runQualityTrend", async () => {
    const res = await GET(
      new Request(
        `http://localhost/api/feedback/quality-trend?workspaceId=${WORKSPACE_ID}&cohort=baseline&generationMode=art_variation&format=1%3A1&clientProfileId=${CLIENT_PROFILE_ID}&primaryFailureReason=visual_overload`
      )
    );

    expect(res.status).toBe(200);
    expect(mockRunTrend).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      clientProfileId: CLIENT_PROFILE_ID,
      primaryFailureReason: "visual_overload",
      capturedAt: expect.any(String),
    });
  });

  it("returns 403 for unauthorized user", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/quality-trend"));

    expect(res.status).toBe(403);
    expect(mockRunTrend).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid workspaceId", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/quality-trend?workspaceId=not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(mockRunTrend).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid primaryFailureReason", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/feedback/quality-trend?primaryFailureReason=not_a_real_reason"
      )
    );

    expect(res.status).toBe(400);
    expect(mockRunTrend).not.toHaveBeenCalled();
  });
});
