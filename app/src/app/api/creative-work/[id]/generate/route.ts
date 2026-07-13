import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { spendOrApiError } from "@/server/billing/paywall";
import { refundCredits } from "@/server/billing/credits";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationRequest,
} from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";
import {
  getCreativeWork,
  createCreativeWorkOutputs,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import { CREATIVE_LEVELS } from "@/server/creative-work/contracts";

/**
 * Dispatch the standalone create-post triplet. Charges 15 credits idempotently,
 * creates one output row per `CREATIVE_LEVELS` entry (idempotent), and sends a
 * `creative-work.generate` event per output.
 *
 * Only refunds when `inngest.send` throws BEFORE any job is queued. Individual
 * job failures are handled inside the job (per `creative-work.generate`
 * consumer) — they do NOT refund.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    if (existing.work.status !== "ready" || !existing.work.identitySnapshot) {
      return apiError("creativeWorkNotReady", 409, {
        status: existing.work.status,
      });
    }

    const chargeRequest: GenerationRequest = {
      authorship: { workspaceId: workspace.id, userId: user.id },
      origin: "quick_tool",
      surface: "quick_tool",
      intent: {
        mode: "social_post",
        objective: existing.work.brief.objective ?? null,
      },
      identity: {
        clientProfileId: existing.work.clientProfileId,
        referenceImages: [],
        brandConstraints: null,
      },
      format: {
        targetFormat: existing.work.format,
        dimensions: { width: 1024, height: 1024 },
        constraints: null,
      },
      source: {
        parentId: null,
        sourceVersionId: null,
        lineageId: null,
        packageSource: "creative_work_brief",
      },
      prompt: { text: existing.work.brief.theme || "social_post" },
      cost: {
        chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkTriplet,
        refundPolicy: "default",
      },
      idempotency: {
        billingKey: `creative-work:${id}:triplet`,
        skipWhenOutputExists: true,
      },
      destination: {
        kind: "creative_work_output",
        id,
        storagePrefix: `creative-work/${id}`,
        workItemId: id,
      },
    };
    // Charge via canonical request fields (same amounts/keys as chargeForGeneration).
    const creditError = await spendOrApiError({
      workspaceId: chargeRequest.authorship.workspaceId,
      action: "image_derivation",
      amount: chargeRequest.cost.chargeAmount,
      idempotencyKey: chargeRequest.idempotency.billingKey,
      metadata: {
        creativeWorkId: id,
        surface: chargeRequest.surface,
        operation_key: "image_derivation",
      },
      userId: user.id,
      returnPath: `/quick-tools/create-post?workId=${id}`,
    });
    if (creditError) {
      return creditError;
    }

    // Idempotent triplet creation: repeated calls return the same output IDs.
    const outputs = await createCreativeWorkOutputs(workspace.id, id);

    const events = CREATIVE_LEVELS.map((creativeLevel, index) => {
      const output = outputs[index];
      return {
        name: "creative-work.generate" as const,
        data: {
          workspaceId: workspace.id,
          workItemId: id,
          outputId: output.id,
          creativeLevel,
        },
      };
    });

    try {
      await inngest.send(events);
    } catch {
      // Dispatch failed before any job started: refund the charge so the
      // user isn't billed for work that never queued.
      await refundCredits({
        workspaceId: workspace.id,
        action: "image_derivation",
        idempotencyKey: `creative-work:${id}:triplet:dispatch-refund`,
        amount: GENERATION_CREDIT_COSTS.creativeWorkTriplet,
        metadata: {
          creativeWorkId: id,
          description: "creative_work_dispatch_refund",
        },
        userId: user.id,
      });
      return apiError("creativeWorkDispatchUnavailable", 502, {
        creativeWorkId: id,
      });
    }

    // Flip the work status to `generating` so the wizard's polling hook
    // engages. `refreshCreativeWorkStatus` will overwrite this with the
    // next aggregate (partial/completed/failed) once outputs settle.
    await setCreativeWorkStatus(workspace.id, id, "generating");

    return NextResponse.json(
      { work: existing.work, outputs },
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error, "creative-work.[id].generate.POST");
  }
}