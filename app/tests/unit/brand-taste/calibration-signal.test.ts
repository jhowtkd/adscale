import { describe, expect, it } from "vitest";
import {
  buildCalibrationSignalFromOutputDecisionEvent,
  sanitizeCalibrationNote,
  validateCalibrationSignalPayload,
} from "@/server/brand-taste/calibration-signal";
import { buildCalibrationOutputDecisionEvent } from "@/server/repositories/output-decision-event.fixture";

describe("calibration-signal", () => {
  it("maps approved event to entra calibration signal", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({
      event: buildCalibrationOutputDecisionEvent(),
      sourceLabel: "synthetic_fixture",
    });

    expect(payload).toMatchObject({
      humanVerdict: "entra",
      systemOlharVerdict: "pronta",
      systemExportStatus: "pronta",
      sourceLabel: "synthetic_fixture",
      reviewerId: "user-1",
    });
  });

  it("maps rejected quase to quase verdict", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({
      event: buildCalibrationOutputDecisionEvent({
        action: "rejected",
        contextSnapshot: {
          reason: { code: "quase", text: "Almost there", source: "direction_reason" },
        },
      }),
      sourceLabel: "operator_imported",
    });

    expect(payload?.humanVerdict).toBe("quase");
    expect(payload?.sanitizedNote).toBe("Almost there");
  });

  it("strips forbidden note content", () => {
    expect(sanitizeCalibrationNote("looks good")).toBe("looks good");
    expect(sanitizeCalibrationNote("contains prompt leak")).toBeNull();
    expect(sanitizeCalibrationNote("postgres://secret")).toBeNull();
  });

  it("validates required payload fields", () => {
    const errors = validateCalibrationSignalPayload({
      workspaceId: "",
      clientProfileId: null,
      campaignId: "",
      derivationId: "",
      outputDecisionEventId: null,
      humanVerdict: "entra",
      systemOlharVerdict: null,
      systemExportStatus: null,
      mismatchBucket: null,
      sourceLabel: "synthetic_fixture",
      reviewerId: "",
      reviewedAt: "",
      sanitizedNote: null,
      idempotencyKey: null,
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});
