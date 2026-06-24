import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/calibration-access", () => ({
  requireCalibrationAccess: vi.fn(),
}));

vi.mock("@/server/repositories/rubric-calibration-adjustments", () => ({
  rejectAdjustment: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { rejectAdjustment } from "@/server/repositories/rubric-calibration-adjustments";
import { CalibrationAdjustmentError } from "@/server/repositories/calibration-adjustment-errors";

const mockRequireAccess = vi.mocked(requireCalibrationAccess);
const mockReject = vi.mocked(rejectAdjustment);

const rejectedAdjustment = {
  id: "adj-1",
  adjustmentVersion: "1.1.0",
  status: "rejected" as const,
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
  acceptedAt: null,
  acceptedBy: null,
  rejectedReason: "Insufficient cross-brand evidence",
  rejectedAt: new Date("2026-06-24"),
  rejectedBy: "owner-1",
  changeSpec: null,
  createdAt: new Date("2026-06-17"),
};

describe("/api/feedback/calibration-adjustments/[id]/reject PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAccess.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
      scope: "platform-owner",
    });
    mockReject.mockResolvedValue(rejectedAdjustment);
  });

  it("returns 200 with rejected adjustment when reason is provided", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/reject", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Insufficient cross-brand evidence" }),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adjustment.status).toBe("rejected");
    expect(mockReject).toHaveBeenCalledWith({
      adjustmentId: "adj-1",
      reviewerUserId: "owner-1",
      reason: "Insufficient cross-brand evidence",
    });
  });

  it("returns 400 when reason is missing", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/reject", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("returns 409 when adjustment is not proposed", async () => {
    mockReject.mockRejectedValue(
      new CalibrationAdjustmentError(
        "adjustment_not_proposed",
        "Adjustment adj-1 is not proposed (status=rejected)"
      )
    );

    const res = await PATCH(
      new Request("http://localhost/api/feedback/calibration-adjustments/adj-1/reject", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Already handled" }),
      }),
      { params: Promise.resolve({ id: "adj-1" }) }
    );

    expect(res.status).toBe(409);
  });
});
