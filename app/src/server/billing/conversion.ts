import type { WorkspaceBillingAccess } from "@/server/billing/access";
import { getWorkspaceBillingAccess } from "@/server/billing/access";
import type { SpendCheck } from "@/server/billing/credits";
import {
  buildConversionErrorPayload,
  resolveConversionGate,
  type ConversionGateInput,
} from "@/lib/billing/conversion-gate";

type BlockedSpendCheck = Extract<SpendCheck, { allowed: false }>;

function toGateAccess(access: WorkspaceBillingAccess) {
  return {
    kind: access.kind,
    creditBalance: access.creditBalance,
    remainingAds: access.remainingAds,
    hasSpendAccess: access.hasSpendAccess,
    subscriptionStatus: access.subscriptionStatus,
  };
}

export async function buildConversionErrorPayloadForWorkspace(input: {
  workspaceId: string;
  check: BlockedSpendCheck;
  returnPath?: string;
  operation?: string;
}) {
  const access = await getWorkspaceBillingAccess(input.workspaceId);
  return buildConversionErrorPayload({
    check: input.check,
    access: toGateAccess(access),
    returnPath: input.returnPath,
    operation: input.operation,
  });
}

export { resolveConversionGate, type ConversionGateInput };
