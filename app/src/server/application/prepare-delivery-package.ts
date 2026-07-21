/**
 * Canonical application command: prepare multi-format delivery package (Phase 4).
 * HTTP POST delivery-package and Assistente quick_package adapt transport only.
 *
 * Implements full panel semantics: ready vs generatable formats, skip active
 * children, charge only new formats, createPackageChildIfAbsent, brand memory.
 */
import { logger } from "@/lib/logger";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { spend, type SpendResult } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createPackageChildIfAbsent,
  getActivePackageChildren,
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";

export type DeliveryFormatResult = {
  id: string;
  format: string;
};

export type PrepareDeliveryPackageInput = {
  workspaceId: string;
  sourceDerivationId: string;
  formats: string[];
  userId: string;
  locale?: string;
  /** When omitted, uses historical HTTP key delivery-package:{id}:{formats}. */
  billingIdempotencyKey?: string;
  billingMetadata?: Record<string, unknown>;
  assistantActionId?: string | null;
  /** When true, fail if there is nothing new to generate (Assistente UX). */
  requireGeneratableFormats?: boolean;
};

export type PrepareDeliveryPackageError =
  | { code: "derivation_not_found" }
  | { code: "source_not_approved" }
  | { code: "source_missing_output" }
  | {
      code: "derivation_hard_failures";
      qualityVerdict: string | null;
      hardFailures: unknown;
    }
  | { code: "no_formats_to_generate" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> };

export type PrepareDeliveryPackageSuccess = {
  source: { id: string; format: string | null };
  requestedFormats: string[];
  readyFormats: string[];
  queued: DeliveryFormatResult[];
  failed: DeliveryFormatResult[];
  skipped: string[];
};

export type PrepareDeliveryPackageResult =
  | { ok: true; value: PrepareDeliveryPackageSuccess }
  | { ok: false; error: PrepareDeliveryPackageError };

export async function prepareDeliveryPackage(
  input: PrepareDeliveryPackageInput
): Promise<PrepareDeliveryPackageResult> {
  const source = await getDerivationById(
    input.sourceDerivationId,
    input.workspaceId
  );
  if (!source) {
    return { ok: false, error: { code: "derivation_not_found" } };
  }
  if (source.status !== "approved") {
    return { ok: false, error: { code: "source_not_approved" } };
  }
  if (!source.outputKey) {
    return { ok: false, error: { code: "source_missing_output" } };
  }

  const approvable = assertDerivationApprovable(source);
  if (!approvable.ok) {
    return {
      ok: false,
      error: {
        code: "derivation_hard_failures",
        qualityVerdict: approvable.qualityVerdict ?? null,
        hardFailures: approvable.hardFailures,
      },
    };
  }

  const requestedFormats = [...new Set(input.formats)];
  const readyFormats = source.format
    ? requestedFormats.filter((format) => format === source.format)
    : [];
  const generatableFormats = requestedFormats.filter(
    (format) => format !== source.format
  );

  if (
    input.requireGeneratableFormats &&
    generatableFormats.length === 0
  ) {
    return { ok: false, error: { code: "no_formats_to_generate" } };
  }

  const activeChildren = await getActivePackageChildren({
    parentId: source.id,
    workspaceId: input.workspaceId,
    formats: generatableFormats,
  });
  const activeFormats = new Set(
    activeChildren.flatMap((child) => (child.format ? [child.format] : []))
  );
  const formatsToCreate = generatableFormats.filter(
    (format) => !activeFormats.has(format)
  );

  if (formatsToCreate.length > 0) {
    const billingIdempotencyKey =
      input.billingIdempotencyKey ??
      `delivery-package:${source.id}:${[...formatsToCreate].sort().join(",")}`;

    const spendResult = await spend({
      workspaceId: input.workspaceId,
      action: "delivery_package_child",
      amount: formatsToCreate.length * 5,
      idempotencyKey: billingIdempotencyKey,
      metadata: {
        sourceDerivationId: source.id,
        formats: formatsToCreate,
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
  }

  const queuedResults = await Promise.all(
    formatsToCreate.map(async (format) => {
      const { child, created } = await createPackageChildIfAbsent({
        campaignId: source.campaignId,
        workspaceId: input.workspaceId,
        planId: source.planId ?? undefined,
        parentId: source.id,
        status: "queued",
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex ?? undefined,
        ctaText: source.ctaText ?? undefined,
        format,
      });

      if (!created) {
        return { status: "skipped" as const, id: child.id, format };
      }

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
            format,
            ...(input.assistantActionId
              ? { assistantActionId: input.assistantActionId }
              : {}),
          },
        });
        return { status: "queued" as const, id: child.id, format };
      } catch (sendErr) {
        logger.error(
          `[prepareDeliveryPackage] event send FAILED derivationId=${child.id}`,
          sendErr
        );
        await updateDerivationStatus(
          child.id,
          input.workspaceId,
          "failed"
        );
        return { status: "failed" as const, id: child.id, format };
      }
    })
  );

  const { queued, failed, skippedFromRace } = queuedResults.reduce<{
    queued: DeliveryFormatResult[];
    failed: DeliveryFormatResult[];
    skippedFromRace: DeliveryFormatResult[];
  }>(
    (acc, { status, id, format }) => {
      if (status === "queued") {
        acc.queued.push({ id, format });
      } else if (status === "failed") {
        acc.failed.push({ id, format });
      } else {
        acc.skippedFromRace.push({ id, format });
      }
      return acc;
    },
    { queued: [], failed: [], skippedFromRace: [] }
  );

  if (queued.length > 0) {
    await updateCampaign(source.campaignId, input.workspaceId, {
      status: "generating",
    });
  }

  const skipped = [
    ...activeFormats,
    ...skippedFromRace.map((item) => item.format),
  ];

  await recordBrandMemoryEvent({
    type: "delivery_prepared",
    workspaceId: input.workspaceId,
    campaignId: source.campaignId,
    derivationId: source.id,
    occurredAt: new Date(),
    summary: `Delivery package was prepared from approved creative ${source.id}.`,
    payload: {
      source: {
        id: source.id,
        format: source.format,
        ctaText: source.ctaText,
        generationMode: source.generationMode,
        qualityScore: source.qualityScore,
        qaStatus: source.qaStatus,
      },
      requestedFormats,
      readyFormats,
      queued,
      failed,
      skipped,
    },
  });

  return {
    ok: true,
    value: {
      source: { id: source.id, format: source.format },
      requestedFormats,
      readyFormats,
      queued,
      failed,
      skipped,
    },
  };
}
