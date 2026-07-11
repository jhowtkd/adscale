import type { ClientOutputLearning } from "../db/schema";
import { OUTPUT_DECISION_EVENT_SCOPE } from "./output-decision-event.fixture";

/** Deterministic learning row IDs for multi-learning test scenarios. */
export const CLIENT_OUTPUT_LEARNING_IDS = {
  primary: "880e8400-e29b-41d4-a716-446655440001",
  cta: "880e8400-e29b-41d4-a716-446655440002",
  avoidPattern: "880e8400-e29b-41d4-a716-446655440003",
} as const;

const DEFAULT_TIMESTAMP = new Date("2026-06-01T00:00:00.000Z");

/** Approved style_policy learning — baseline for safety guard tests. */
export function buildClientOutputLearning(
  overrides: Partial<ClientOutputLearning> = {}
): ClientOutputLearning {
  return {
    id: CLIENT_OUTPUT_LEARNING_IDS.primary,
    workspaceId: OUTPUT_DECISION_EVENT_SCOPE.workspaceId,
    clientProfileId: OUTPUT_DECISION_EVENT_SCOPE.clientProfileId,
    variableKey: "style_policy",
    variableValue: "extreme",
    scopeGenerationMode: "",
    scopeFormat: "",
    preferenceDirection: "prefer",
    statement: "prefer extreme style",
    confidence: "high",
    confidenceScore: "0.9000",
    sampleEventCount: 3,
    sampleCampaignCount: 1,
    supportingEvidence: [{ eventId: "evt-1", polarity: "supporting", strength: "strong" }],
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

/** Approved CTA learning with art_variation scope — baseline for recommendation/pipeline tests. */
export function buildApprovedCtaClientOutputLearning(
  overrides: Partial<ClientOutputLearning> = {}
): ClientOutputLearning {
  return buildClientOutputLearning({
    id: CLIENT_OUTPUT_LEARNING_IDS.cta,
    variableKey: "cta",
    variableValue: "Comprar agora",
    scopeGenerationMode: "art_variation",
    scopeFormat: "1:1",
    preferenceDirection: "prefer",
    statement: "preferir CTA Comprar agora",
    confidenceScore: "0.8500",
    sampleEventCount: 4,
    sampleCampaignCount: 2,
    supportingEvidence: [
      { eventId: "evt-1", polarity: "supporting", strength: "strong" },
      { eventId: "evt-2", polarity: "supporting", strength: "medium" },
    ],
    ...overrides,
  });
}
