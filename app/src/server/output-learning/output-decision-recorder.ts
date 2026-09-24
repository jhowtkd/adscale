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

  return insertValidatedOutputDecisionEvidence(input);
}

async function insertValidatedOutputDecisionEvidence(input: RecordOutputDecisionInput): Promise<OutputDecisionEvent> {
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

async function bestEffort(input: RecordOutputDecisionInput, write: () => Promise<OutputDecisionEvent>) {
  try {
    return await write();
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

export function recordOutputDecisionEvidenceBestEffort(
  input: RecordOutputDecisionInput
): Promise<OutputDecisionEvent | null> {
  return bestEffort(input, () => recordOutputDecisionEvidence(input));
}

/** For approval-package roots loaded from workspace-scoped campaign and derivation queries. */
export function recordOutputDecisionEvidenceFromValidatedRootsBestEffort(
  input: RecordOutputDecisionInput,
  context: {
    campaign: { id: string; workspaceId: string };
    approvedRootIds: ReadonlySet<string>;
  },
): Promise<OutputDecisionEvent | null> {
  return bestEffort(input, () => {
    if (
      context.campaign.workspaceId !== input.workspaceId ||
      context.campaign.id !== input.campaignId ||
      !context.approvedRootIds.has(input.derivationId)
    ) {
      throw new Error("Output decision is outside the validated approval package");
    }
    return insertValidatedOutputDecisionEvidence(input);
  });
}
