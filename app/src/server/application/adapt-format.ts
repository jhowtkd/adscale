/**
 * Canonical application command: adapt one derivation to a target format (Phase 4).
 * Assistente quick_format_adapt adapts transport; no dedicated panel route today —
 * campaign batch format_adaptation remains the multi-format campaign entry.
 *
 * Distinct from prepareDeliveryPackage: does not require approved status.
 */
import type { SpendResult } from "@/server/billing/paywall";
import {
  formatAdaptationSettlementAdapter,
  type FormatAdaptationSettlementValue,
} from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getDerivationById } from "@/server/repositories/derivation";

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
  derivation: FormatAdaptationSettlementValue["derivation"];
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

  const settled = await startGenerationSettlement(
    formatAdaptationSettlementAdapter({ ...input, source }),
  );
  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      return {
        ok: false,
        error: { code: "credit_blocked", spend: settled.error.spend },
      };
    }
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        derivationId: settled.error.value.derivation.id,
      },
    };
  }

  return { ok: true, value: settled.value };
}
