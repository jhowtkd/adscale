import { recordLocalLearningDecisionEvidence } from "../output-learning/output-decision-recorder";
import { recordCalibrationSignalFromOutputDecisionEvent } from "../brand-taste/calibration-signal-recorder";
import type { LocalLearningAuthorizationPort } from "../brand-taste/local-learning-authorization";
import type { OutputDecisionAction } from "../output-learning/output-decision-events";
import type { OutputRevisionContextV1 } from "../creative-work/output-review";

const ACTION_BY_REVIEW_ACTION: Record<OutputRevisionContextV1["action"], OutputDecisionAction> = {
  refine: "regenerated",
  variation: "variation_requested",
  format: "format_adapted",
};

/**
 * Classified evidence of a confirmed Peça revision request (#664).
 * Recorded only after the review context is confirmed and the child
 * operation exists; keyed by the revision identity so a replay keeps the
 * original event and signal. The #655 port gates projection: a denial
 * stores nothing. Evidence never fails the confirmed revision.
 */
export async function recordRevisionDecisionEvidence(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  parentOutputId: string;
  revisionKey: string;
  context: OutputRevisionContextV1;
}, authorize?: LocalLearningAuthorizationPort): Promise<void> {
  try {
    const notes = input.context.annotations.map((annotation) => annotation.text);
    const scopedText = [input.context.instruction, ...notes].filter(Boolean).join("\n");
    const event = await recordLocalLearningDecisionEvidence({
      workspaceId: input.workspaceId,
      userId: input.userId,
      creativeWorkOutputId: input.parentOutputId,
      action: ACTION_BY_REVIEW_ACTION[input.context.action],
      source: "composer",
      snapshotExtras: {
        userFeedback: input.context.instruction || null,
        notes: notes.length > 0 ? notes.join("\n") : null,
        reason: { text: scopedText || undefined, source: "operator" },
      },
      idempotencyKey: `creative-work-revision:${input.revisionKey}`,
    }, authorize);
    await recordCalibrationSignalFromOutputDecisionEvent({
      event,
      sourceLabel: "real_customer",
      idempotencyKey: `creative-work-revision:${input.revisionKey}:signal`,
    });
  } catch {
    // Best effort: the confirmed revision stands; a later replay of the
    // same revision re-records under the same idempotency keys.
  }
}
