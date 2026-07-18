import type { ClientOutputLearning } from "../db/schema";
import type { OutputLearningEvidenceRef } from "../output-learning/types";
import {
  OUTPUT_DECISION_EVENT_IDS,
  OUTPUT_DECISION_EVENT_SCOPE,
} from "./output-decision-event.fixture";

/** Deterministic learning row IDs for multi-learning scenarios. */
export const CLIENT_OUTPUT_LEARNING_IDS = {
  stylePolicy: "880e8400-e29b-41d4-a716-446655440001",
  cta: "880e8400-e29b-41d4-a716-446655440002",
} as const;

const DEFAULT_TIMESTAMP = new Date("2026-06-01T00:00:00.000Z");

/** Minimal evidence ref — tests only assert eventId/polarity/strength. */
export function buildOutputLearningEvidenceRef(
  overrides: Partial<OutputLearningEvidenceRef> & Pick<OutputLearningEvidenceRef, "eventId"> = {
    eventId: "evt-1",
  }
): OutputLearningEvidenceRef {
  return {
    campaignId: OUTPUT_DECISION_EVENT_SCOPE.campaignId,
    derivationId: OUTPUT_DECISION_EVENT_SCOPE.derivationId,
    action: "approved",
    direction: "positive",
    strength: "strong",
    variableKey: "cta",
    variableValue: "Comprar agora",
    polarity: "supporting",
    generationMode: "art_variation",
    format: "1:1",
    reasonCode: null,
    recordedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Approved style_policy learning — baseline for guard and trace tests. */
export function buildClientOutputLearning(
  overrides: Partial<ClientOutputLearning> = {}
): ClientOutputLearning {
  return {
    id: CLIENT_OUTPUT_LEARNING_IDS.stylePolicy,
    workspaceId: OUTPUT_DECISION_EVENT_SCOPE.workspaceId,
    clientProfileId: "client-1",
    variableKey: "style_policy",
    variableValue: "extreme",
    scopeGenerationMode: "",
    scopeFormat: "",
    preferenceDirection: "prefer",
    statement: "prefer extreme style",
    confidence: "high",
    confidenceScore: "0.9",
    sampleEventCount: 3,
    sampleCampaignCount: 1,
    supportingEvidence: [
      buildOutputLearningEvidenceRef({
        eventId: "evt-1",
        variableKey: "style_policy",
        variableValue: "extreme",
      }),
    ],
    contradictingEvidence: [],
    algorithmVersion: "1.0.0",
    status: "approved",
    mem0MemoryId: null,
    approvedAt: DEFAULT_TIMESTAMP,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    lastEvidenceAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

/** Scoped CTA approval — preset for pipeline-eval and recommendation tests. */
export function buildApprovedCtaClientOutputLearning(
  overrides: Partial<ClientOutputLearning> = {}
): ClientOutputLearning {
  return buildClientOutputLearning({
    id: CLIENT_OUTPUT_LEARNING_IDS.cta,
    clientProfileId: OUTPUT_DECISION_EVENT_SCOPE.clientProfileId,
    variableKey: "cta",
    variableValue: "Comprar agora",
    scopeGenerationMode: "art_variation",
    scopeFormat: "1:1",
    statement: "preferir CTA Comprar agora",
    confidenceScore: "0.8500",
    sampleEventCount: 4,
    sampleCampaignCount: 2,
    supportingEvidence: [
      buildOutputLearningEvidenceRef({
        eventId: OUTPUT_DECISION_EVENT_IDS.primary,
        strength: "strong",
      }),
      buildOutputLearningEvidenceRef({
        eventId: OUTPUT_DECISION_EVENT_IDS.secondary,
        strength: "medium",
      }),
    ],
    ...overrides,
  });
}
