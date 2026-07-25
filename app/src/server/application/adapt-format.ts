/**
 * Canonical application command: adapt one derivation to a target format (Phase 4).
 * Assistente quick_format_adapt adapts transport; no dedicated panel route today —
 * campaign batch format_adaptation remains the multi-format campaign entry.
 *
 * Distinct from prepareDeliveryPackage: does not require approved status or package
 * child dedupe; single child via createDerivation.
 */
import { logger } from "@/lib/logger";
import { spend, type SpendResult } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createDerivation,
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";

export type AdaptFormatInput = {
  workspaceId: string;
  sourceDerivationId: string;
  targetFormat: string;
  userId: string;
  locale?: string;
  billingIdempotencyKey: string;
  billingMetadata?: Record<string, unknown>;
  assistantActionId?: string | null;
};

export type AdaptFormatError =
  | { code: "derivation_not_found" }
  | { code: "source_missing_output" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> }
  | { code: "dispatch_failed"; derivationId: string };

export type AdaptFormatSuccess = {
  derivation: Awaited<ReturnType<typeof createDerivation>>;
  source: NonNullable<Awaited<ReturnType<typeof getDerivationById>>>;
};

export type AdaptFormatResult =
  | { ok: true; value: AdaptFormatSuccess }
  | { ok: false; error: AdaptFormatError };

export async function adaptFormat(
  input: AdaptFormatInput
): Promise<AdaptFormatResult> {
  const source = await getDerivationById(
    input.sourceDerivationId,
    input.workspaceId
  );
  if (!source) {
    return { ok: false, error: { code: "derivation_not_found" } };
  }
  if (!source.outputKey) {
    return { ok: false, error: { code: "source_missing_output" } };
  }

  const spendResult = await spend({
    workspaceId: input.workspaceId,
    action: "image_derivation",
    amount: 5,
    idempotencyKey: input.billingIdempotencyKey,
    metadata: {
      sourceDerivationId: source.id,
      targetFormat: input.targetFormat,
      ...input.billingMetadata,
    },
    userId: input.userId,
  });
  if (!spendResult.ok) {
    return {
      ok: false,
      error: { code: "credit_blocked", spend: spendResult },
    };
  }

  const child = await createDerivation({
    campaignId: source.campaignId,
    workspaceId: input.workspaceId,
    planId: source.planId ?? undefined,
    parentId: source.id,
    status: "queued",
    generationMode: "format_adaptation",
    variantIndex: source.variantIndex ?? undefined,
    ctaText: source.ctaText ?? undefined,
    format: input.targetFormat,
  });

  try {
    await inngest.send({
      name: heavyImageEventName("derivation.generate"),
      data: {
        derivationId: child.id,
        campaignId: source.campaignId,
        workspaceId: input.workspaceId,
        triggeredByUserId: input.userId,
        locale: input.locale,
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex,
        ctaText: source.ctaText,
        format: input.targetFormat,
        ...(input.assistantActionId
          ? { assistantActionId: input.assistantActionId }
          : {}),
      },
    });
  } catch (sendErr) {
    logger.error(
      `[adaptFormat] event send FAILED derivationId=${child.id}`,
      sendErr
    );
    await updateDerivationStatus(child.id, input.workspaceId, "failed");
    return {
      ok: false,
      error: { code: "dispatch_failed", derivationId: child.id },
    };
  }

  await updateCampaign(source.campaignId, input.workspaceId, {
    status: "generating",
  });

  return { ok: true, value: { derivation: child, source } };
}
