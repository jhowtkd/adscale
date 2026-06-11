import type { BillingPlanKey } from "@/server/billing/plans";

export const conversionReasons = [
  "insufficient_credits",
  "beta_exhausted",
  "subscription_required",
  "past_due_recovery",
] as const;

export type ConversionReason = (typeof conversionReasons)[number];

export type RecommendedAction = "checkout" | "billing" | "portal";

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
    record.recommendedAction !== "portal"
  ) {
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
    analytics: analytics as ConversionAnalyticsFields,
  };
}
