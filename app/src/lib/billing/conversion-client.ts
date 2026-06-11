import type { BillingStatus } from "@/lib/hooks/use-billing";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";
import { resolveConversionGate } from "@/lib/billing/conversion-gate";

export function resolveConversionGateFromBilling(input: {
  billing: BillingStatus | undefined;
  requiredCredits: number;
  returnPath: string;
  operation?: string;
}): ConversionErrorPayload | null {
  if (!input.billing) return null;

  return resolveConversionGate({
    creditBalance: input.billing.creditBalance,
    requiredCredits: input.requiredCredits,
    hasSpendAccess: input.billing.access.hasSpendAccess,
    accessKind: input.billing.access.kind,
    subscriptionStatus: input.billing.subscriptionStatus,
    remainingAds: input.billing.access.remainingAds,
    returnPath: input.returnPath,
    operation: input.operation,
  });
}

export async function parseConversionErrorResponse(
  response: Response
): Promise<ConversionErrorPayload | null> {
  if (response.status !== 402) return null;
  try {
    const body = (await response.json()) as { details?: unknown };
    const { parseConversionErrorPayload } = await import(
      "@/lib/billing/conversion-contract"
    );
    return parseConversionErrorPayload(body.details);
  } catch {
    return null;
  }
}
