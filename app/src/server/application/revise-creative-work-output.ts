import { refundCredits } from "@/server/billing/credits";
import { chargeForGenerationBatch } from "@/server/generation/canonical/charge";
import { GENERATION_CREDIT_COSTS, type GenerationBatchCharge } from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  createCreativeWorkRevision,
  failQueuedCreativeWorkOutput,
  getCreativeWork,
} from "@/server/repositories/creative-work";

type RevisionErrorCode =
  | "work_not_found"
  | "output_not_ready"
  | "invalid_revision"
  | "credit_blocked"
  | "dispatch_failed";

export type ReviseCreativeWorkOutputResult =
  | { ok: true; value: { output: NonNullable<Awaited<ReturnType<typeof createCreativeWorkRevision>>>["output"] } }
  | { ok: false; error: { code: RevisionErrorCode; details?: unknown } };

export async function reviseCreativeWorkOutput(input: {
  workspaceId: string;
  workItemId: string;
  userId: string;
  outputId: string;
  revisionKey: string;
  instruction: string;
  revisionAssetId: string | null;
}): Promise<ReviseCreativeWorkOutputResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };

  const parent = aggregate.outputs.find((output) => output.id === input.outputId);
  if (!parent || parent.status !== "completed" || !parent.outputKey) {
    return { ok: false, error: { code: "output_not_ready" } };
  }

  const reservation = await createCreativeWorkRevision(
    input.workspaceId,
    input.workItemId,
    input.revisionKey,
    parent.id,
    input.instruction,
    input.revisionAssetId,
  );
  if (!reservation) return { ok: false, error: { code: "invalid_revision" } };
  const { output, claimedForDispatch } = reservation;
  if (!claimedForDispatch) return { ok: true, value: { output } };

  const billingKey = `creative-work:${input.workItemId}:revision:${output.id}`;
  const chargeRequest: GenerationBatchCharge = {
    kind: "batch",
    authorship: { workspaceId: input.workspaceId, userId: input.userId },
    origin: "quick_tool",
    surface: "quick_tool",
    intent: { mode: "creative_revision", objective: aggregate.work.brief?.objective ?? null },
    parentId: input.workItemId,
    unitCount: 1,
    chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    billingKey,
    refundPolicy: "default",
  };
  const charged = await chargeForGenerationBatch(chargeRequest, {
    metadata: { creativeWorkId: input.workItemId, outputId: output.id, revisionOf: parent.id },
  });
  if (!charged.ok) {
    if (output.status === "queued") {
      await failQueuedCreativeWorkOutput(input.workspaceId, input.workItemId, output.id, "credit_blocked");
    }
    return { ok: false, error: { code: "credit_blocked", details: charged.conversionPayload } };
  }

  try {
    await inngest.send({
      id: `creative-work-revision:${output.id}`,
      name: heavyImageEventName("creative-work.generate"),
      data: { workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: output.id },
    });
  } catch {
    await failQueuedCreativeWorkOutput(input.workspaceId, input.workItemId, output.id, "dispatch_failed");
    await refundCredits({
      workspaceId: input.workspaceId,
      action: "image_derivation",
      amount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      idempotencyKey: `${billingKey}:dispatch-refund`,
      metadata: { creativeWorkId: input.workItemId, outputId: output.id, description: "creative_work_revision_dispatch_refund" },
      userId: input.userId,
    });
    return { ok: false, error: { code: "dispatch_failed" } };
  }

  return { ok: true, value: { output } };
}
