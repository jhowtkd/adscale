import { logger } from "@/lib/logger";
import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  getLatestSubscriptionByWorkspace,
} from "@/server/repositories/billing";
import {
  getActiveBetaEntitlementByWorkspace,
  getActiveTesterEntitlementByWorkspace,
} from "@/server/repositories/entitlements";

import {
  BETA_AD_ALLOWANCE,
  creditsToRemainingAds,
} from "./entitlements";
import {
  DEV_ADMIN_CREDIT_BALANCE,
  workspaceHasDevAdminOwner,
} from "@/server/auth/dev-admin";
import { UNLIMITED_CREDIT_BALANCE } from "@/server/billing/unlimited-access";

/**
 * Past-due spend policy (DUEN-01 / DUEN-03):
 * - Existing credit balance remains spendable while subscription is `past_due`.
 * - New monthly grants from `invoice.paid` stay suspended until payment recovers (see events.ts).
 * - Beta entitlements are unchanged and still gate spend when no active paid subscription exists.
 */
export const PAST_DUE_SPEND_POLICY = "existing_credits_spendable" as const;
export const PAST_DUE_LABEL = "Pagamento pendente";

export type WorkspaceAccessKind = "paid" | "beta" | "tester" | "none";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "none";

export type WorkspaceBillingAccess = {
  kind: WorkspaceAccessKind;
  label: string;
  creditBalance: number;
  remainingAds: number | null;
  hasSpendAccess: boolean;
  subscriptionStatus: SubscriptionStatus;
  subscription: Awaited<ReturnType<typeof getActiveSubscriptionByWorkspace>> | null;
  latestSubscription: Awaited<ReturnType<typeof getLatestSubscriptionByWorkspace>> | null;
  betaEntitlement: Awaited<ReturnType<typeof getActiveBetaEntitlementByWorkspace>> | null;
  testerEntitlement: Awaited<ReturnType<typeof getActiveTesterEntitlementByWorkspace>> | null;
};

export function normalizeSubscriptionStatus(
  rawStatus: string | null | undefined
): SubscriptionStatus {
  switch (rawStatus) {
    case "active":
      return "active";
    case "trialing":
    case "checkout_completed":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "none";
  }
}

function totalRemaining(grants: Array<{ remaining: number }>) {
  return grants.reduce((total, grant) => total + grant.remaining, 0);
}

export async function getWorkspaceBillingAccess(
  workspaceId: string
): Promise<WorkspaceBillingAccess> {
  const [subscription, latestSubscription, grants, betaEntitlement, testerEntitlement] =
    await Promise.all([
    getActiveSubscriptionByWorkspace(workspaceId),
    getLatestSubscriptionByWorkspace(workspaceId),
    getAvailableCreditGrants(workspaceId),
    getActiveBetaEntitlementByWorkspace(workspaceId).catch((error) => {
      logger.error("[billing] beta entitlement lookup failed", error);
      return null;
    }),
    getActiveTesterEntitlementByWorkspace(workspaceId).catch((error) => {
      logger.error("[billing] tester entitlement lookup failed", error);
      return null;
    }),
  ]);
  const creditBalance = totalRemaining(grants);
  const subscriptionStatus = normalizeSubscriptionStatus(latestSubscription?.status);

  if (await workspaceHasDevAdminOwner(workspaceId)) {
    return {
      kind: "paid",
      label: "Dev admin",
      creditBalance: DEV_ADMIN_CREDIT_BALANCE,
      remainingAds: creditsToRemainingAds(DEV_ADMIN_CREDIT_BALANCE),
      hasSpendAccess: true,
      subscriptionStatus: "active",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: null,
      testerEntitlement: null,
    };
  }

  if (testerEntitlement) {
    return {
      kind: "tester",
      label: "Tester",
      creditBalance: UNLIMITED_CREDIT_BALANCE,
      remainingAds: creditsToRemainingAds(UNLIMITED_CREDIT_BALANCE),
      hasSpendAccess: true,
      subscriptionStatus: "active",
      subscription: null,
      latestSubscription: null,
      betaEntitlement: null,
      testerEntitlement,
    };
  }

  if (subscription) {
    return {
      kind: "paid",
      label: "Assinatura ativa",
      creditBalance,
      remainingAds: creditsToRemainingAds(creditBalance),
      hasSpendAccess: true,
      subscriptionStatus,
      subscription,
      latestSubscription,
      betaEntitlement,
      testerEntitlement: null,
    };
  }

  if (betaEntitlement) {
    return {
      kind: "beta",
      label: "Acesso beta",
      creditBalance,
      remainingAds: creditsToRemainingAds(creditBalance),
      hasSpendAccess: true,
      subscriptionStatus,
      subscription: null,
      latestSubscription,
      betaEntitlement,
      testerEntitlement: null,
    };
  }

  if (subscriptionStatus === "past_due" && latestSubscription) {
    const hasCredits = creditBalance > 0;
    return {
      kind: hasCredits ? "paid" : "none",
      label: PAST_DUE_LABEL,
      creditBalance,
      remainingAds: hasCredits ? creditsToRemainingAds(creditBalance) : null,
      hasSpendAccess: hasCredits,
      subscriptionStatus,
      subscription: null,
      latestSubscription,
      betaEntitlement: null,
      testerEntitlement: null,
    };
  }

  return {
    kind: "none",
    label: "Sem acesso ativo",
    creditBalance,
    remainingAds: null,
    hasSpendAccess: false,
    subscriptionStatus,
    subscription: null,
    latestSubscription,
    betaEntitlement: null,
    testerEntitlement: null,
  };
}

export function getBetaAllowanceSummary(remainingAds: number) {
  return {
    totalAds: BETA_AD_ALLOWANCE,
    remainingAds,
    exhausted: remainingAds <= 0,
  };
}
