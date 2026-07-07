import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { spendOrApiError } from "@/server/billing/paywall";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { generateSocialPostCopy } from "@/server/creative-work/copy";

/**
 * Generate (or return the persisted) social post copy for a work item.
 * Charges 2 credits idempotently, calls OpenAI once, and stores the result.
 * A repeat request short-circuits to the persisted copy without calling
 * OpenAI again.
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

    // Repeated requests return the persisted copy and skip spend + OpenAI.
    if (existing.work.copy) {
      return NextResponse.json({ copy: existing.work.copy });
    }

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "copy_generation",
      amount: 2,
      idempotencyKey: `creative-work:${id}:copy`,
      metadata: { creativeWorkId: id, operation_key: "copy_generation" },
      userId: user.id,
      returnPath: `/quick-tools/create-post?workId=${id}`,
    });
    if (creditError) {
      return creditError;
    }

    const profile = await getClientProfile(
      workspace.id,
      existing.work.clientProfileId,
    );
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const brandKit = await getBrandKit(workspace.id, existing.work.clientProfileId);

    try {
      const copy = await generateSocialPostCopy({
        brief: existing.work.brief,
        brandName: profile.name,
        toneOfVoice: brandKit?.toneOfVoice ?? null,
        requiredElements: brandKit?.requiredElements ?? null,
        prohibitedElements: brandKit?.prohibitedElements ?? null,
      });

      await setCreativeWorkCopy(workspace.id, id, copy);

      return NextResponse.json({ copy });
    } catch {
      // Provider failure after spend: do not delete the work item, do not
      // refund (the spend idempotency key handles retries). Return a
      // sanitized 502 so the UI can offer a retry without leaking provider
      // detail.
      return apiError("copyProviderUnavailable", 502, {
        creativeWorkId: id,
      });
    }
  } catch (error) {
    return handleApiError(error, "creative-work.[id].copy.POST");
  }
}