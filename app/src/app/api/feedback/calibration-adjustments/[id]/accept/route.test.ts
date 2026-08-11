import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/human-quality/improvement/accept", () => ({
  acceptProposedAdjustment: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { acceptProposedAdjustment } from "@/server/human-quality/improvement/accept";
import { CalibrationAdjustmentError } from "@/server/repositories/calibration-adjustment-errors";
import { RUBRIC_CALIBRATION_VERSION } from "@/server/human-quality/calibration/report";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockAccept = vi.mocked(acceptProposedAdjustment);

const acceptedAdjustment = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  adjustmentVersion: "1.1.0",
  status: "accepted" as const,
  targetModule: "score_ceiling" as const,
  targetKey: "visual_overload",
  sliceKey: "visual_overload|art_variation|1:1",
  rationale: "Over-score slice",
  evidenceRefs: {
    corpusItemIds: ["item-1", "item-2", "item-3"],
    sliceStats: { count: 3, meanSignedDelta: 18, meanAbsError: 18 },
    itemRefs: [],
  },
  proposedAt: new Date("2026-06-17"),
  acceptedAt: new Date("2026-06-17"),
  acceptedBy: "owner-1",
  changeSpec: { ceilingDelta: -5 },
  createdAt: new Date("2026-06-17"),
};

describe("/api/feedback/calibration-adjustments/[id]/accept PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockAccept.mockResolvedValue(acceptedAdjustment);
  });

  it("allows platform-owner to accept with optional changeSpec", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSpec: { ceilingDelta: -5 } }),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalledWith({
      adjustmentId: "adj-1",
      reviewerUserId: "owner-1",
      changeSpec: { ceilingDelta: -5 },
    });
  });

  it("rejects workspace admin via requireCalibrationAccess", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin member", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid changeSpec ceilingDelta", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSpec: { ceilingDelta: 99 } }),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("returns 422 when proposed row has insufficient evidence", async () => {
    mockAccept.mockRejectedValue(
      new CalibrationAdjustmentError(
        "insufficient_evidence",
        "Adjustment adj-1 has insufficient corpus evidence"
      )
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("returns 409 when adjustment is rejected", async () => {
    mockAccept.mockRejectedValue(
      new CalibrationAdjustmentError(
        "adjustment_not_proposed",
        "Adjustment adj-1 is not proposed (status=rejected)"
      )
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(409);
  });

  it("returns 422 insufficient_acknowledgment for fixtureOnly cross_client without ack", async () => {
    mockAccept.mockRejectedValue(
      new CalibrationAdjustmentError(
        "insufficient_acknowledgment",
        "Fixture-only cross-client proposal requires explicit acknowledgment"
      )
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("accepts fixtureOnly cross_client proposal with acknowledgeFixtureOnly", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/accept", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgeFixtureOnly: true }),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockAccept).toHaveBeenCalledWith({
      adjustmentId: "adj-1",
      reviewerUserId: "owner-1",
      changeSpec: undefined,
      acknowledgeFixtureOnly: true,
    });
  });

  it("RUBRIC_CALIBRATION_VERSION is 1.1.0 after Phase 132 bump", () => {
    expect(RUBRIC_CALIBRATION_VERSION).toBe("1.1.0");
  });
});
