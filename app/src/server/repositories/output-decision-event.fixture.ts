import type { OutputDecisionEvent } from "../db/schema";

/** Stable scope IDs reused across output-learning and calibration tests. */
export const OUTPUT_DECISION_EVENT_SCOPE = {
  workspaceId: "ws-1",
  userId: "user-1",
  clientProfileId: "profile-1",
  campaignId: "camp-1",
  derivationId: "deriv-1",
} as const;

/** Deterministic event row IDs for multi-event aggregate scenarios. */
export const OUTPUT_DECISION_EVENT_IDS = {
  primary: "770e8400-e29b-41d4-a716-446655440001",
  secondary: "770e8400-e29b-41d4-a716-446655440002",
  tertiary: "770e8400-e29b-41d4-a716-446655440003",
} as const;

const DEFAULT_CREATED_AT = new Date("2026-06-01T00:00:00.000Z");

/** Approved art_variation review with CTA context — baseline for aggregate/pipeline tests. */
export function buildOutputDecisionEvent(
  overrides: Partial<OutputDecisionEvent> = {}
): OutputDecisionEvent {
  return {
    id: OUTPUT_DECISION_EVENT_IDS.primary,
    ...OUTPUT_DECISION_EVENT_SCOPE,
    parentDerivationId: null,
    action: "approved",
    direction: "positive",
    strength: "strong",
    source: "derivations.review.PATCH",
    contextSnapshot: {
      generationMode: "art_variation",
      format: "1:1",
      ctaText: "Comprar agora",
    },
    idempotencyKey: null,
    createdAt: DEFAULT_CREATED_AT,
    ...overrides,
  };
}

/** Olhar/export snapshot defaults for brand-taste calibration-signal tests. */
export function buildCalibrationOutputDecisionEvent(
  overrides: Partial<OutputDecisionEvent> = {}
): OutputDecisionEvent {
  return buildOutputDecisionEvent({
    id: "event-1",
    clientProfileId: "client-1",
    source: "test",
    contextSnapshot: {
      olharVerdict: { value: "pronta" },
      exportStatus: { value: "pronta" },
    },
    createdAt: new Date("2026-06-20T12:00:00.000Z"),
    ...overrides,
  });
}
