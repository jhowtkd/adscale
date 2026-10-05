import type { BillingPlanKey } from "@/server/billing/plans";

export const conversionReasons = [
  "insufficient_credits",
  "beta_exhausted",
  "subscription_required",
  "past_due_recovery",
  // Ticket 11, part 2: the Equipe free plan spends no credit. Its CTA is the plan request of flow 0, not a checkout.
  "free_plan",
] as const;

export type ConversionReason = (typeof conversionReasons)[number];

/** `plan_request`: the free plan's "Falar com uma pessoa" (the `request_support` plan request of `accountId`). */
export type RecommendedAction = "checkout" | "billing" | "portal" | "plan_request";

export interface ConversionAnalyticsFields {
  reasonCode: string;
  estimateCredits: number;
  operation?: string;
}

export interface ConversionErrorPayload {
  reason: ConversionReason;
  recommendedAction: RecommendedAction;
  suggestedPlan?: BillingPlanKey;
  amount: number;
  balance: number;
  returnPath?: string;
  /** Only with `plan_request`: the free entry account the plan request goes to. */
  accountId?: string;
  analytics: ConversionAnalyticsFields;
}

export function isConversionReason(value: string): value is ConversionReason {
  return (conversionReasons as readonly string[]).includes(value);
}

export function parseConversionErrorPayload(
  details: unknown
): ConversionErrorPayload | null {
  if (!details || typeof details !== "object") return null;
  const record = details as Record<string, unknown>;
  if (typeof record.reason !== "string" || !isConversionReason(record.reason)) {
    return null;
  }
  if (
    record.recommendedAction !== "checkout" &&
    record.recommendedAction !== "billing" &&
    record.recommendedAction !== "portal" &&
    record.recommendedAction !== "plan_request"
  ) {
    return null;
  }
  // The plan request needs the account it goes to; without it there is no CTA to show.
  const accountId = typeof record.accountId === "string" && record.accountId.length > 0 ? record.accountId : undefined;
  if (record.recommendedAction === "plan_request" && !accountId) {
    return null;
  }
  if (typeof record.amount !== "number" || typeof record.balance !== "number") {
    return null;
  }
  const analytics = record.analytics;
  if (
    !analytics ||
    typeof analytics !== "object" ||
    typeof (analytics as Record<string, unknown>).reasonCode !== "string" ||
    typeof (analytics as Record<string, unknown>).estimateCredits !== "number"
  ) {
    return null;
  }

  return {
    reason: record.reason,
    recommendedAction: record.recommendedAction,
    suggestedPlan:
      record.suggestedPlan === "starter" ||
      record.suggestedPlan === "growth" ||
      record.suggestedPlan === "scale"
        ? record.suggestedPlan
        : undefined,
    amount: record.amount,
    balance: record.balance,
    returnPath: typeof record.returnPath === "string" ? record.returnPath : undefined,
    ...(accountId ? { accountId } : {}),
    analytics: analytics as ConversionAnalyticsFields,
  };
}

/**
 * The conversion payload a blocked spend carries, wherever the caller put it: the payload itself or a spend result
 * that wraps it (`{ conversionPayload }`). Routes and the MCP use it to tell the free plan apart (ticket 11, part 2).
 */
export function conversionPayloadOf(details: unknown): ConversionErrorPayload | null {
  const direct = parseConversionErrorPayload(details);
  if (direct) return direct;
  if (!details || typeof details !== "object") return null;
  return parseConversionErrorPayload((details as { conversionPayload?: unknown }).conversionPayload);
}
