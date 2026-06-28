import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/human-quality/sampling/service", () => ({
  runSampleCoverage: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runSampleCoverage } from "@/server/human-quality/sampling/service";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockRunCoverage = vi.mocked(runSampleCoverage);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";

const baseReport = {
  schemaVersion: 1 as const,
  capturedAt: "2026-06-17T12:00:00.000Z",
  evaluatedItemCount: 6,
  gates: [
    { id: "calibration_global", status: "ok", blockedClaims: [] as string[] },
    { id: "impact_global", status: "ok", blockedClaims: [] as string[] },
    { id: "quality_improvement", status: "insufficient_sample", blockedClaims: ["targeted failure-frequency improvement"] },
    { id: "trend_global", status: "ok", blockedClaims: [] as string[] },
  ],
  sliceGaps: [
    {
      gate: "quality_improvement_reason" as const,
      dimension: "visual_overload",
      arm: "after" as const,
      currentCount: 1,
      requiredCount: 3,
      additionalNeeded: 2,
      blockedClaim: "targeted failure-frequency improvement",
    },
  ],
  nextGate: "quality_improvement" as const,
  nextOperatorAction: "Need 2 more evaluations for targeted failure-frequency improvement (1/3).",
};

describe("/api/feedback/sample-coverage GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockRunCoverage.mockResolvedValue({ report: baseReport });
  });

  it("returns 200 with SampleCoverageReport for authorized platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/sample-coverage"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report).toMatchObject({
      schemaVersion: 1,
      evaluatedItemCount: 6,
      nextOperatorAction: expect.any(String),
      sliceGaps: expect.any(Array),
      gates: expect.any(Array),
    });
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mockRunCoverage).toHaveBeenCalledWith({
      workspaceId: undefined,
      cohort: undefined,
      capturedAt: expect.any(String),
    });
  });

  it("scopes to workspace when workspaceId provided", async () => {
    mockRequireAccess.mockResolvedValue({
      user: { id: "admin-1", email: "admin@test.com" },
      scope: "workspace-admin",
      workspaceId: WORKSPACE_ID,
    });

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/sample-coverage?workspaceId=${WORKSPACE_ID}&cohort=baseline`
      )
    );

    expect(res.status).toBe(200);
    expect(mockRequireAccess).toHaveBeenCalledWith(expect.any(Request), WORKSPACE_ID);
    expect(mockRunCoverage).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      cohort: "baseline",
      capturedAt: expect.any(String),
    });
  });

  it("returns 403 for unauthorized user", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/sample-coverage"));

    expect(res.status).toBe(403);
    expect(mockRunCoverage).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid workspaceId", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/sample-coverage?workspaceId=not-a-uuid")
    );

    expect(res.status).toBe(400);
    expect(mockRunCoverage).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid cohort", async () => {
    const res = await GET(
      new Request("http://localhost/api/feedback/sample-coverage?cohort=invalid")
    );

    expect(res.status).toBe(400);
    expect(mockRunCoverage).not.toHaveBeenCalled();
  });
});
