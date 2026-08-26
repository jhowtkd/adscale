import type {
  ConversionErrorPayload,
} from "@/lib/billing/conversion-contract";
import type { BillingPlanKey } from "@/server/billing/plans";

type AccessKind = "paid" | "trial" | "beta" | "tester" | "none";
type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "none";

type BlockedSpendCheck =
  | {
      allowed: false;
      amount: number;
      balance: number;
      reason: "inactive_subscription";
    }
  | {
      allowed: false;
      amount: number;
      balance: number;
      reason: "insufficient_credits";
    };

interface GateAccessContext {
  kind: AccessKind;
  creditBalance: number;
  remainingAds: number | null;
  hasSpendAccess: boolean;
  subscriptionStatus: SubscriptionStatus;
}

function defaultSuggestedPlan(): BillingPlanKey {
  return "starter";
}

function isBetaExhausted(access: GateAccessContext): boolean {
  if (access.kind !== "beta") return false;
  if (access.creditBalance <= 0) return true;
  return access.remainingAds !== null && access.remainingAds <= 0;
}

function resolveFromInactiveSubscription(
  access: GateAccessContext
): Pick<ConversionErrorPayload, "reason" | "recommendedAction" | "suggestedPlan"> {
  if (access.subscriptionStatus === "past_due") {
    return {
      reason: "past_due_recovery",
      recommendedAction: "portal",
    };
  }

  if (isBetaExhausted(access)) {
    return {
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      suggestedPlan: defaultSuggestedPlan(),
    };
  }

  return {
    reason: "subscription_required",
    recommendedAction: "checkout",
    suggestedPlan: defaultSuggestedPlan(),
  };
}

function resolveFromInsufficientCredits(
  access: GateAccessContext
): Pick<ConversionErrorPayload, "reason" | "recommendedAction" | "suggestedPlan"> {
  if (isBetaExhausted(access)) {
    return {
      reason: "beta_exhausted",
      recommendedAction: "checkout",
      suggestedPlan: defaultSuggestedPlan(),
    };
  }

  if (access.kind === "beta" || access.kind === "trial") {
    return {
      reason: "insufficient_credits",
      recommendedAction: "checkout",
      suggestedPlan: defaultSuggestedPlan(),
    };
  }

  if (access.kind === "paid") {
    return {
      reason: "insufficient_credits",
      recommendedAction: "billing",
    };
  }

  return {
    reason: "subscription_required",
    recommendedAction: "checkout",
    suggestedPlan: defaultSuggestedPlan(),
  };
}

export function buildConversionErrorPayload(input: {
  check: BlockedSpendCheck;
  access: GateAccessContext;
  returnPath?: string;
  operation?: string;
}): ConversionErrorPayload {
  const resolved =
    input.check.reason === "inactive_subscription"
      ? resolveFromInactiveSubscription(input.access)
      : resolveFromInsufficientCredits(input.access);

  return {
    ...resolved,
    amount: input.check.amount,
    balance: input.check.balance,
    returnPath: input.returnPath,
    analytics: {
      reasonCode: resolved.reason,
      estimateCredits: input.check.amount,
      ...(input.operation ? { operation: input.operation } : {}),
    },
  };
}

export interface ConversionGateInput {
  creditBalance: number;
  requiredCredits: number;
  hasSpendAccess: boolean;
  accessKind: AccessKind;
  subscriptionStatus: SubscriptionStatus;
  remainingAds: number | null;
  returnPath?: string;
  operation?: string;
}

export function resolveConversionGate(
  input: ConversionGateInput
): ConversionErrorPayload | null {
  const needsConversion =
    !input.hasSpendAccess || input.creditBalance < input.requiredCredits;

  if (!needsConversion || input.requiredCredits <= 0) {
    return null;
  }

  const access: GateAccessContext = {
    kind: input.accessKind,
    creditBalance: input.creditBalance,
    remainingAds: input.remainingAds,
    hasSpendAccess: input.hasSpendAccess,
    subscriptionStatus: input.subscriptionStatus,
  };

  const check: BlockedSpendCheck = input.hasSpendAccess
    ? {
        allowed: false,
        amount: input.requiredCredits,
        balance: input.creditBalance,
        reason: "insufficient_credits",
      }
    : {
        allowed: false,
        amount: input.requiredCredits,
        balance: input.creditBalance,
        reason: "inactive_subscription",
      };

  return buildConversionErrorPayload({
    check,
    access,
    returnPath: input.returnPath,
    operation: input.operation,
  });
}
