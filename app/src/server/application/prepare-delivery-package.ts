/**
 * Canonical application command: prepare multi-format delivery package (Phase 4).
 * HTTP POST delivery-package and Assistente quick_package adapt transport only.
 *
 * Implements full panel semantics: ready vs generatable formats, skip active
 * children, charge only new formats, createPackageChildIfAbsent, brand memory.
 */
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import type { SpendResult } from "@/server/billing/paywall";
import { deliveryPackageSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import {
  getActivePackageChildren,
  getDerivationById,
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

  const queued: DeliveryFormatResult[] = [];
  const failed: DeliveryFormatResult[] = [];
  const skippedFromRace: string[] = [];

  if (formatsToCreate.length > 0) {
    const billingIdempotencyKey =
      input.billingIdempotencyKey ??
      `delivery-package:${source.id}:${[...formatsToCreate].sort().join(",")}`;

    const settled = await startGenerationSettlement(
      deliveryPackageSettlementAdapter({
        workspaceId: input.workspaceId,
        userId: input.userId,
        source,
        formatsToCreate,
        billingKey: billingIdempotencyKey,
        billingMetadata: input.billingMetadata,
        locale: input.locale,
        assistantActionId: input.assistantActionId,
      }),
    );

    if (!settled.ok) {
      if (settled.error.code === "credit_blocked") {
        const spend: Extract<SpendResult, { ok: false }> = {
          ok: false,
          status: 402,
          conversionPayload: settled.error.details as Extract<
            SpendResult,
            { ok: false }
          >["conversionPayload"],
        };
        return {
          ok: false,
          error: { code: "credit_blocked", spend },
        };
      }
      for (const row of settled.error.value.derivations) {
        if (row.format) failed.push({ id: row.id, format: row.format });
      }
    } else {
      const newlyCreated = new Set(settled.value.newlyCreatedIds ?? []);
      for (const row of settled.value.derivations) {
        if (!row.format) continue;
        if (newlyCreated.has(row.id)) {
          queued.push({ id: row.id, format: row.format });
        } else if (formatsToCreate.includes(row.format)) {
          skippedFromRace.push(row.format);
        }
      }
    }
  }

  const skipped = [...activeFormats, ...skippedFromRace];

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
