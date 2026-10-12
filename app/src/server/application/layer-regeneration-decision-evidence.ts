import { recordLocalLearningDecisionEvidence } from "../output-learning/output-decision-recorder";
import type { LocalLearningAuthorizationPort } from "../brand-taste/local-learning-authorization";

/**
 * Classified evidence of a confirmed layer regeneration (#665).
 * The event stays a local correction: linked to the layer and to the
 * confirmed operation, with no calibration signal and no whole-piece
 * verdict. Keyed by the operation identity so a retry keeps a single
 * event; the #655 port gates recording, and a denial stores nothing.
 * Evidence never fails the confirmed regeneration.
 */
export async function recordLayerRegenerationDecisionEvidence(input: {
  workspaceId: string;
  userId: string;
  outputId: string;
  operationId: string;
  layerId: string;
  instruction: string;
}, authorize?: LocalLearningAuthorizationPort): Promise<void> {
  try {
    await recordLocalLearningDecisionEvidence({
      workspaceId: input.workspaceId,
      userId: input.userId,
      creativeWorkOutputId: input.outputId,
      action: "layer_regenerated",
      source: "layer_editor",
      snapshotExtras: {
        userFeedback: input.instruction || null,
        layerId: input.layerId,
        operationId: input.operationId,
      },
      idempotencyKey: `creative-work-layer-regeneration:${input.operationId}`,
    }, authorize);
  } catch {
    // Best effort: the confirmed regeneration stands; a later retry of
    // the same operation re-records under the same idempotency key.
  }
}
