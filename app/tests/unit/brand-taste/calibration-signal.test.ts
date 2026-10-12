import { describe, expect, it } from "vitest";
import {
  buildCalibrationSignalFromOutputDecisionEvent,
  sanitizeCalibrationNote,
  validateCalibrationSignalPayload,
} from "@/server/brand-taste/calibration-signal";
import type { OutputDecisionEvent } from "@/server/db/schema";
import { mapActionToSemantics } from "@/server/output-learning/output-decision-events";

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
    authorType: "human", actorId: null, actorRole: null, equipeEventId: null,
    creativeWorkOutputId: null,
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
  it("does not turn agent authorship into human approval through real_customer provenance", () => {
    const event = { ...baseEvent(), authorType: "agent" as const };
    expect(buildCalibrationSignalFromOutputDecisionEvent({ event, sourceLabel: "real_customer" })).toBeNull();
  });

  it("projects a current Peça without fabricating a campaign, derivation or Olhar verdict", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent({ campaignId: null, derivationId: null, creativeWorkOutputId: "output-1", contextSnapshot: {} }),
      sourceLabel: "synthetic_fixture",
    })!;
    expect(payload).toMatchObject({
      campaignId: null, derivationId: null, creativeWorkOutputId: "output-1",
      humanVerdict: "entra", systemOlharVerdict: null, systemExportStatus: null,
    });
    expect(validateCalibrationSignalPayload(payload)).toEqual([]);
    const second = buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent({ campaignId: null, derivationId: null, creativeWorkOutputId: "output-2", contextSnapshot: {} }),
      sourceLabel: "synthetic_fixture",
    })!;
    expect(second.idempotencyKey).not.toBe(payload.idempotencyKey);
  });

  it("requires exactly one Peça reference and a campaign for legacy signals", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({ event: baseEvent(), sourceLabel: "synthetic_fixture" })!;
    expect(validateCalibrationSignalPayload({ ...payload, derivationId: null })).toContain("exactly one Peça reference is required");
    expect(validateCalibrationSignalPayload({ ...payload, creativeWorkOutputId: "output-1" })).toContain("exactly one Peça reference is required");
    expect(validateCalibrationSignalPayload({ ...payload, campaignId: null })).toContain("campaignId is required for a legacy derivation");
    expect(payload.idempotencyKey).toBe("calibration-signal:ws-1:deriv-1:user-1");
  });

  it.each([
    "alternative_not_selected", "favorited", "favorite_removed", "selection_replaced",
    "variation_requested", "format_adapted", "layer_regenerated", "saved_reference", "selected_for_delivery",
  ] as const)("does not invent a whole-Peça human verdict for %s", (action) => {
    expect(buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent({ ...mapActionToSemantics(action), contextSnapshot: { reason: { code: "nao_entra" } } }),
      sourceLabel: "real_customer",
    })).toBeNull();
  });

  it.each([
    { strength: "weak" }, { direction: "neutral" },
  ])("refuses weak or neutral evidence even with an approval label: %j", (semantics) => {
    expect(buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent(semantics), sourceLabel: "synthetic_fixture",
    })).toBeNull();
  });

  it("requires an explicit human verdict on a signal", () => {
    const payload = buildCalibrationSignalFromOutputDecisionEvent({
      event: baseEvent(), sourceLabel: "synthetic_fixture",
    })!;
    expect(validateCalibrationSignalPayload({ ...payload, humanVerdict: undefined as never }))
      .toContain("humanVerdict is invalid");
  });

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
