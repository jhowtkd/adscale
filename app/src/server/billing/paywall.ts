import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";
import {
  getWorkspaceBillingAccess,
  type WorkspaceBillingAccess,
} from "./access";
import {
  recordUsage,
  type CreditAction,
} from "./credits";
import { buildConversionErrorPayloadForWorkspace } from "./conversion";

/** Canonical billing access snapshot for spend and conversion decisions. */
export type BillingAccess = WorkspaceBillingAccess;

export type SpendParams = {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  userId?: string;
  returnPath?: string;
};

export type SpendResult =
  | { ok: true; creditsSpent: number; duplicate?: boolean }
  | { ok: false; status: 402; conversionPayload: ConversionErrorPayload };

/**
 * Canonical server-side spend decision: record usage when allowed, or return a
 * structured conversion payload for 402 responses. Composes credits + conversion
 * without embedding Stripe or route-handler concerns.
 */
export async function spend(params: SpendParams): Promise<SpendResult> {
  const result = await recordUsage(params);

  if (result.status === "blocked") {
    const conversionPayload = await buildConversionErrorPayloadForWorkspace({
      workspaceId: params.workspaceId,
      check: result.check,
      returnPath: params.returnPath,
      operation: params.action,
    });
    return { ok: false, status: 402, conversionPayload };
  }

  if (result.status === "duplicate") {
    return { ok: true, creditsSpent: 0, duplicate: true };
  }

  return { ok: true, creditsSpent: result.check.amount };
}

/** Resolve workspace billing access (subscription, beta, tester, credits). */
export async function getAccess(workspaceId: string): Promise<BillingAccess> {
  return getWorkspaceBillingAccess(workspaceId);
}

/**
 * Normalize an already-resolved billing access snapshot for paywall consumers.
 * Useful when access was fetched once and passed through orchestration layers.
 */
export function getAccessFromBilling(billing: WorkspaceBillingAccess): BillingAccess {
  return billing;
}
