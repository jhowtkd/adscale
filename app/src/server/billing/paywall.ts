import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import {
  conversionPayloadOf,
  type ConversionErrorPayload,
} from "@/lib/billing/conversion-contract";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
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

/**
 * The 402 of a route that answers a blocked spend with its own code (`insufficientCredits`, `creditBlocked`) instead
 * of the payload's reason. A workspace on the free plan gets the free plan's reason and CTA (ticket 11, part 2);
 * everyone else gets exactly the route's previous answer. `details` is whatever the route had: a conversion payload,
 * a raw spend check, or nothing (then the free plan is read again: the spend was refused for it a moment ago).
 */
export async function creditBlockedApiError(
  workspaceId: string,
  code: string,
  details?: unknown
): Promise<NextResponse> {
  const payload = conversionPayloadOf(details);
  if (payload?.reason === "free_plan") return apiError("free_plan", 402, payload);
  const raw = details as { reason?: unknown; accountId?: unknown; amount?: unknown; balance?: unknown } | undefined;
  const freePlan =
    raw?.reason === "free_plan" && typeof raw.accountId === "string"
      ? { accountId: raw.accountId }
      : payload
        ? null
        : await findFreePlanAccount(workspaceId);
  if (freePlan) {
    return apiError(
      "free_plan",
      402,
      buildConversionErrorPayload({
        check: {
          allowed: false,
          amount: typeof raw?.amount === "number" ? raw.amount : 0,
          balance: typeof raw?.balance === "number" ? raw.balance : 0,
          reason: "free_plan",
          accountId: freePlan.accountId,
        },
        // Not read for the free plan: its answer never depends on the subscription.
        access: { kind: "none", creditBalance: 0, remainingAds: null, hasSpendAccess: false, subscriptionStatus: "none" },
      })
    );
  }
  return details === undefined ? apiError(code, 402) : apiError(code, 402, details);
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
