import { readGenerationIdentity } from "../output-learning/generation-identity";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkSelectionDecisions } from "../db/schema";
import { recordLocalLearningDecisionEvidence } from "../output-learning/output-decision-recorder";
import { recordCalibrationSignalFromOutputDecisionEvent } from "../brand-taste/calibration-signal-recorder";
import { authorizeLocalLearning, type LocalLearningAuthorizationPort } from "../brand-taste/local-learning-authorization";

export async function applyLearningSelectionEffect(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  selectionDecisionId: string;
}, authorize?: LocalLearningAuthorizationPort): Promise<{ code?: string }> {
  const [decision] = await db.select().from(creativeWorkSelectionDecisions).where(and(
    eq(creativeWorkSelectionDecisions.id, input.selectionDecisionId),
    eq(creativeWorkSelectionDecisions.workspaceId, input.workspaceId),
    eq(creativeWorkSelectionDecisions.workItemId, input.workItemId),
    eq(creativeWorkSelectionDecisions.outputId, input.outputId),
  )).limit(1);
  if (!decision) throw Object.assign(new Error("Decisão de seleção ausente."), { code: "invalid_payload" });
  const authorization = await (authorize ?? authorizeLocalLearning)({
    workspaceId: decision.workspaceId, clientProfileId: decision.clientProfileId,
  });
  if (!authorization.allowed) return { code: authorization.reason };
  const isAgent = decision.authorType === "agent";
  const action = isAgent ? "selected_for_delivery" : "approved";
  const event = await recordLocalLearningDecisionEvidence({
    workspaceId: decision.workspaceId, userId: decision.userId,
    clientProfileId: decision.clientProfileId, campaignId: decision.campaignId,
    authorType: isAgent ? "agent" : "human", actorId: decision.actorId ?? null,
    creativeWorkOutputId: decision.outputId, action, source: isAgent ? "mcp" : "composer",
    snapshotInput: decision.contextSnapshot,
    snapshotExtras: { ...decision.contextSnapshot, selectionDecisionId: decision.id, selectedOutputId: decision.outputId,
      generationIdentity: readGenerationIdentity(decision.contextSnapshot.generationIdentity) },
    occurredAt: decision.createdAt,
    idempotencyKey: `selection-decision:${decision.id}:${action}`,
  }, async () => authorization);
  if (isAgent) return {};
  const result = await recordCalibrationSignalFromOutputDecisionEvent({
    event, sourceLabel: "real_customer", reviewedAt: decision.createdAt.toISOString(),
    idempotencyKey: `selection-decision:${decision.id}:signal`,
  });
  if (!result.signalId) throw new Error("Selection learning signal was not persisted");
  for (const alternative of decision.alternatives ?? []) {
    await recordLocalLearningDecisionEvidence({
      workspaceId: decision.workspaceId, userId: decision.userId,
      clientProfileId: decision.clientProfileId, campaignId: decision.campaignId,
      creativeWorkOutputId: alternative.outputId, action: "alternative_not_selected", source: "composer",
      snapshotInput: alternative.contextSnapshot,
      snapshotExtras: { ...alternative.contextSnapshot, selectionDecisionId: decision.id, selectedOutputId: decision.outputId,
        generationIdentity: readGenerationIdentity(alternative.contextSnapshot.generationIdentity) },
      occurredAt: decision.createdAt,
      idempotencyKey: `selection-decision:${decision.id}:alternative:${alternative.outputId}`,
    }, async () => authorization);
  }
  return {};
}
