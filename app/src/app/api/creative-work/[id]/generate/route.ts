import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { refundCredits } from "@/server/billing/credits";
import { chargeForBatchOrApiError } from "@/server/generation/canonical/charge";
import {
  GENERATION_CREDIT_COSTS,
  type GenerationBatchCharge,
} from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";
import {
  getCreativeWork,
  createCreativeWorkOutputs,
  setCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import { CREATIVE_LEVELS } from "@/server/creative-work/contracts";

/**
 * Dispatch the standalone create-post triplet.
 * Charges via GenerationBatchCharge (not a unit GenerationRequest),
 * creates one output row per CREATIVE_LEVELS entry, and sends unit jobs.
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

    const batchCharge: GenerationBatchCharge = {
      kind: "batch",
      authorship: { workspaceId: workspace.id, userId: user.id },
      origin: "quick_tool",
      surface: "quick_tool",
      intent: {
        mode: "social_post",
        objective: existing.work.brief.objective ?? null,
      },
      parentId: id,
      unitCount: CREATIVE_LEVELS.length,
      chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkTriplet,
      unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      billingKey: `creative-work:${id}:triplet`,
      refundPolicy: "default",
    };

    const creditError = await chargeForBatchOrApiError(batchCharge, {
      returnPath: `/quick-tools/create-post?workId=${id}`,
      metadata: { creativeWorkId: id },
    });
    if (creditError) {
      return creditError;
    }

    // Idempotent triplet creation: repeated calls return the same output IDs.
    const outputs = await createCreativeWorkOutputs(workspace.id, id);

    const events = outputs.map((output) => {
      return {
        name: "creative-work.generate" as const,
        data: {
          workspaceId: workspace.id,
          workItemId: id,
          outputId: output.id,
          creativeLevel: output.creativeLevel,
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

    await setCreativeWorkStatus(workspace.id, id, "generating");

    return NextResponse.json(
      { work: existing.work, outputs },
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error, "creative-work.[id].generate.POST");
  }
}
