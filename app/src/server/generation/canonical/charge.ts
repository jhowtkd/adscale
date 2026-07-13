/**
 * Cobrança canônica a partir de GenerationRequest (Gate 3 / item 21).
 */
import { spend, type SpendResult } from "@/server/billing/paywall";
import type { GenerationRequest } from "@/server/generation/canonical/types";

/**
 * Charges credits using the request's cost + idempotency contract.
 * Callers must build the same GenerationRequest they later execute.
 */
export async function chargeForGeneration(
  request: GenerationRequest,
  options?: { returnPath?: string }
): Promise<SpendResult> {
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
      operation_key: "image_derivation",
    },
    userId: request.authorship.userId ?? undefined,
    returnPath: options?.returnPath,
  });
}
