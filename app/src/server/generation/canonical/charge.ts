/**
 * Cobrança canônica (Gate 3 / item 21).
 *
 * - `chargeForGeneration` — unidade (1 GenerationRequest).
 * - `chargeForGenerationBatch` — lote explícito (GenerationBatchCharge),
 *   distinto do contrato executado pelos jobs.
 */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { spend, spendOrApiError, type SpendResult } from "@/server/billing/paywall";
import {
  assertGenerationBatchCharge,
  assertGenerationRequest,
  type GenerationBatchCharge,
  type GenerationRequest,
} from "@/server/generation/canonical/types";

/**
 * Charges credits for a single unit GenerationRequest.
 * Callers must execute the same request (or an equivalent unit) after charging.
 */
export async function chargeForGeneration(
  request: GenerationRequest,
  options?: { returnPath?: string; metadata?: Record<string, unknown> }
): Promise<SpendResult> {
  assertGenerationRequest(request);
  return spend({
    workspaceId: request.authorship.workspaceId,
    action: "image_derivation",
    amount: request.cost.chargeAmount,
    idempotencyKey: request.idempotency.billingKey,
    metadata: {
      surface: request.surface,
      origin: request.origin,
      destinationKind: request.destination.kind,
      destinationId: request.destination.id,
      mode: request.intent.mode,
      chargeKind: "unit",
      operation_key: "image_derivation",
      ...options?.metadata,
    },
    userId: request.authorship.userId ?? undefined,
    returnPath: options?.returnPath,
  });
}

/** HTTP adapter: 402 response when unit spend is blocked. */
export async function chargeForGenerationOrApiError(
  request: GenerationRequest,
  options?: { returnPath?: string; metadata?: Record<string, unknown> }
): Promise<NextResponse | null> {
  assertGenerationRequest(request);
  return spendOrApiError({
    workspaceId: request.authorship.workspaceId,
    action: "image_derivation",
    amount: request.cost.chargeAmount,
    idempotencyKey: request.idempotency.billingKey,
    metadata: {
      surface: request.surface,
      origin: request.origin,
      destinationKind: request.destination.kind,
      destinationId: request.destination.id,
      mode: request.intent.mode,
      chargeKind: "unit",
      operation_key: "image_derivation",
      ...options?.metadata,
    },
    userId: request.authorship.userId ?? undefined,
    returnPath: options?.returnPath,
  });
}

/**
 * Charges a batch once (e.g. Criar Post triplet = 15).
 * Jobs later execute unit GenerationRequests with `unitChargeAmount`.
 */
export async function chargeForGenerationBatch(
  batch: GenerationBatchCharge,
  options?: { returnPath?: string; metadata?: Record<string, unknown> }
): Promise<SpendResult> {
  assertGenerationBatchCharge(batch);
  return spend({
    workspaceId: batch.authorship.workspaceId,
    action: "image_derivation",
    amount: batch.chargeAmount,
    idempotencyKey: batch.billingKey,
    metadata: {
      surface: batch.surface,
      origin: batch.origin,
      mode: batch.intent.mode,
      chargeKind: "batch",
      parentId: batch.parentId,
      unitCount: batch.unitCount,
      unitChargeAmount: batch.unitChargeAmount,
      operation_key: "image_derivation",
      ...options?.metadata,
    },
    userId: batch.authorship.userId ?? undefined,
    returnPath: options?.returnPath,
  });
}

/** HTTP adapter for batch charges. */
export async function chargeForBatchOrApiError(
  batch: GenerationBatchCharge,
  options?: { returnPath?: string; metadata?: Record<string, unknown> }
): Promise<NextResponse | null> {
  assertGenerationBatchCharge(batch);
  const result = await chargeForGenerationBatch(batch, options);
  if (result.ok) {
    return null;
  }
  return apiError(result.conversionPayload.reason, 402, result.conversionPayload);
}
