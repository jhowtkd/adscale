import { loadOutputGenerationIdentity } from "../repositories/output-generation-identity";
import type { DecisionAuthor } from "./output-decision-author";
import { verifyDecisionAuthor } from "./output-decision-author-validation";
import { logger } from "@/lib/logger";
import { resolveOutputDecisionScope, type OutputDecisionScopeInput } from "./output-decision-scope";
import { insertOutputDecisionEvent } from "../repositories/output-decision-event";
import { getCampaignById } from "../repositories/campaign";
import type { OutputDecisionEvent } from "../db/schema";
import { dispatchOutputLearningRecomputeBestEffort } from "./dispatch";
import {
  requireLocalLearningAuthorization,
  LocalLearningAuthorizationError,
  type LocalLearningAuthorizationPort,
} from "../brand-taste/local-learning-authorization";
import {
  buildOutputDecisionSnapshot,
  mapActionToSemantics,
  type OutputDecisionAction,
  type OutputDecisionSnapshot,
} from "./output-decision-events";

export interface RecordOutputDecisionInput extends OutputDecisionScopeInput, DecisionAuthor {
  userId: string | null;
  occurredAt?: Date;
  parentDerivationId?: string | null;
  action: OutputDecisionAction;
  source: string;
  snapshotInput?: Parameters<typeof buildOutputDecisionSnapshot>[0];
  snapshotExtras?: Partial<OutputDecisionSnapshot>;
  idempotencyKey?: string | null;
}

// New local capture is gated separately from operational decisions in the legacy corpus cycle.
export async function recordLocalLearningDecisionEvidence(
  input: RecordOutputDecisionInput,
  authorize?: LocalLearningAuthorizationPort
): Promise<OutputDecisionEvent> {
  if (input.creativeWorkOutputId) {
    const scope = await resolveOutputDecisionScope(input);
    await requireLocalLearningAuthorization({ workspaceId: input.workspaceId, clientProfileId: scope.clientProfileId }, authorize);
    return insertValidatedOutputDecisionEvidence({ ...input, ...scope });
  }
  if (!input.campaignId) {
    throw new LocalLearningAuthorizationError("brand_out_of_scope");
  }
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new LocalLearningAuthorizationError("brand_out_of_scope");
  }
  if (!campaign.clientProfileId) {
    throw new LocalLearningAuthorizationError("missing_brand");
  }
  if (campaign.clientProfileId !== input.clientProfileId) {
    throw new LocalLearningAuthorizationError("brand_out_of_scope");
  }
  await requireLocalLearningAuthorization({
    workspaceId: input.workspaceId,
    clientProfileId: campaign.clientProfileId,
  }, authorize);
  return recordOutputDecisionEvidence({ ...input, clientProfileId: campaign.clientProfileId });
}

export async function recordOutputDecisionEvidence(
  input: RecordOutputDecisionInput
): Promise<OutputDecisionEvent> {
  const scope = await resolveOutputDecisionScope(input);
  return insertValidatedOutputDecisionEvidence({ ...input, ...scope });
}

async function insertValidatedOutputDecisionEvidence(input: RecordOutputDecisionInput): Promise<OutputDecisionEvent> {
  await verifyDecisionAuthor(input, input.userId);
  const semantics = mapActionToSemantics(input.action);
  const contextSnapshot = buildOutputDecisionSnapshot(
    input.snapshotInput ?? {},
    { ...input.snapshotExtras, generationIdentity: input.snapshotExtras?.generationIdentity
      ?? await loadOutputGenerationIdentity(input) }
  );

  return insertOutputDecisionEvent({
    workspaceId: input.workspaceId,
    createdAt: input.occurredAt,
    userId: input.userId,
    authorType: input.authorType ?? "human",
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    equipeEventId: input.equipeEventId ?? null,
    clientProfileId: input.clientProfileId ?? null,
    campaignId: input.campaignId ?? null,
    derivationId: input.derivationId ?? null,
    creativeWorkOutputId: input.creativeWorkOutputId ?? null,
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
      campaignId: input.campaignId ?? null,
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
      creativeWorkOutputId: input.creativeWorkOutputId,
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
      !input.derivationId || input.creativeWorkOutputId ||
      !context.approvedRootIds.has(input.derivationId)
    ) {
      throw new Error("Output decision is outside the validated approval package");
    }
    return insertValidatedOutputDecisionEvidence(input);
  });
}
