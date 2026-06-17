import { logger } from "@/lib/logger";
import { validateCampaignOwnership, validateDerivationOwnership } from "../feedback/validate-refs";
import { insertOutputDecisionEvent } from "../repositories/output-decision-event";
import type { OutputDecisionEvent } from "../db/schema";
import { dispatchOutputLearningRecomputeBestEffort } from "./dispatch";
import {
  buildOutputDecisionSnapshot,
  mapActionToSemantics,
  type OutputDecisionAction,
  type OutputDecisionSnapshot,
} from "./output-decision-events";

export interface RecordOutputDecisionInput {
  workspaceId: string;
  userId: string;
  clientProfileId?: string | null;
  campaignId: string;
  derivationId: string;
  parentDerivationId?: string | null;
  action: OutputDecisionAction;
  source: string;
  snapshotInput?: Parameters<typeof buildOutputDecisionSnapshot>[0];
  snapshotExtras?: Partial<OutputDecisionSnapshot>;
  idempotencyKey?: string | null;
}

export async function recordOutputDecisionEvidence(
  input: RecordOutputDecisionInput
): Promise<OutputDecisionEvent> {
  await validateCampaignOwnership(input.workspaceId, input.campaignId);
  await validateDerivationOwnership(
    input.workspaceId,
    input.derivationId,
    input.campaignId
  );

  const semantics = mapActionToSemantics(input.action);
  const contextSnapshot = buildOutputDecisionSnapshot(
    input.snapshotInput ?? {},
    input.snapshotExtras
  );

  return insertOutputDecisionEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    clientProfileId: input.clientProfileId ?? null,
    campaignId: input.campaignId,
    derivationId: input.derivationId,
    parentDerivationId: input.parentDerivationId ?? null,
    action: semantics.action,
    direction: semantics.direction,
    strength: semantics.strength,
    source: input.source,
    contextSnapshot,
    idempotencyKey: input.idempotencyKey ?? null,
  }).then(async (event) => {
    void dispatchOutputLearningRecomputeBestEffort({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      campaignId: input.campaignId,
    });
    return event;
  });
}

export async function recordOutputDecisionEvidenceBestEffort(
  input: RecordOutputDecisionInput
): Promise<OutputDecisionEvent | null> {
  try {
    return await recordOutputDecisionEvidence(input);
  } catch (error) {
    logger.warn("[output-learning] evidence capture failed (non-blocking)", {
      action: input.action,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      derivationId: input.derivationId,
      source: input.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
