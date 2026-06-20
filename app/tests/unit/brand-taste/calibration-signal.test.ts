import { describe, expect, it } from "vitest";
import {
  buildCalibrationSignalFromOutputDecisionEvent,
  sanitizeCalibrationNote,
  validateCalibrationSignalPayload,
} from "@/server/brand-taste/calibration-signal";
import type { OutputDecisionEvent } from "@/server/db/schema";

function baseEvent(
  overrides: Partial<OutputDecisionEvent> = {}
): OutputDecisionEvent {
  return {
    id: "event-1",
    workspaceId: "ws-1",
    userId: "user-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    parentDerivationId: null,
    action: "approved",
    direction: "positive",
    strength: "strong",
    source: "test",
    contextSnapshot: {
      olharVerdict: { value: "pronta" },
      exportStatus: { value: "pronta" },
    },
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("calibration-signal", () => {
  it("maps approved event to entra calibration signal", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent(),
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
      event: baseEvent({
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
