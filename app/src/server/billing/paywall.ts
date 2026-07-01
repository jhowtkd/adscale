import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";
import {
  buildConversionErrorPayload,
  resolveConversionGate,
  type ConversionGateInput,
} from "@/lib/billing/conversion-gate";
import {
  getWorkspaceBillingAccess,
  type WorkspaceBillingAccess,
} from "./access";
import {
  canSpend,
  recordUsage,
  type CreditAction,
  type SpendCheck,
} from "./credits";

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

async function buildConversionErrorPayloadForWorkspace(input: {
  workspaceId: string;
  check: BlockedSpendCheck;
  returnPath?: string;
  operation?: string;
}): Promise<ConversionErrorPayload> {
  const access = await getWorkspaceBillingAccess(input.workspaceId);
  return buildConversionErrorPayload({
    check: input.check,
    access: toGateAccess(access),
    returnPath: input.returnPath,
    operation: input.operation,
  });
}

/**
 * Canonical server-side spend decision: record usage when allowed, or return a
 * structured conversion payload for 402 responses.
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

/**
 * HTTP adapter for route handlers: returns a 402 NextResponse when spend is
 * blocked, or null when the operation may proceed.
 */
export async function spendOrApiError(
  params: SpendParams
): Promise<NextResponse | null> {
  const result = await spend(params);
  if (result.ok) {
    return null;
  }
  const payload = result.conversionPayload;
  return apiError(payload.reason, 402, payload);
}

/** Pre-flight spend check without recording usage (assistant confirm flows). */
export const checkSpend = canSpend;

/** Resolve workspace billing access (subscription, beta, tester, credits). */
export async function getAccess(workspaceId: string): Promise<BillingAccess> {
  return getWorkspaceBillingAccess(workspaceId);
}

/**
 * Normalize an already-resolved billing access snapshot for paywall consumers.
 */
export function getAccessFromBilling(billing: WorkspaceBillingAccess): BillingAccess {
  return billing;
}

export { resolveConversionGate, type ConversionGateInput };
