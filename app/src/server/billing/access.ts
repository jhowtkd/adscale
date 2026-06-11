import { logger } from "@/lib/logger";
import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
} from "@/server/repositories/billing";
import { getActiveBetaEntitlementByWorkspace } from "@/server/repositories/entitlements";

import {
  BETA_AD_ALLOWANCE,
  creditsToRemainingAds,
} from "./entitlements";
import {
  DEV_ADMIN_CREDIT_BALANCE,
  workspaceHasDevAdminOwner,
} from "@/server/auth/dev-admin";

export type WorkspaceAccessKind = "paid" | "beta" | "none";

export type WorkspaceBillingAccess = {
  kind: WorkspaceAccessKind;
  label: string;
  creditBalance: number;
  remainingAds: number | null;
  hasSpendAccess: boolean;
  subscription: Awaited<ReturnType<typeof getActiveSubscriptionByWorkspace>> | null;
  betaEntitlement: Awaited<ReturnType<typeof getActiveBetaEntitlementByWorkspace>> | null;
};

function totalRemaining(grants: Array<{ remaining: number }>) {
  return grants.reduce((total, grant) => total + grant.remaining, 0);
}

export async function getWorkspaceBillingAccess(
  workspaceId: string
): Promise<WorkspaceBillingAccess> {
  const [subscription, grants, betaEntitlement] = await Promise.all([
    getActiveSubscriptionByWorkspace(workspaceId),
    getAvailableCreditGrants(workspaceId),
    getActiveBetaEntitlementByWorkspace(workspaceId).catch((error) => {
      logger.error("[billing] beta entitlement lookup failed", error);
      return null;
    }),
  ]);
  const creditBalance = totalRemaining(grants);

  if (await workspaceHasDevAdminOwner(workspaceId)) {
    return {
      kind: "paid",
      label: "Dev admin",
      creditBalance: DEV_ADMIN_CREDIT_BALANCE,
      remainingAds: creditsToRemainingAds(DEV_ADMIN_CREDIT_BALANCE),
      hasSpendAccess: true,
      subscription: null,
      betaEntitlement: null,
    };
  }

  if (subscription) {
    return {
      kind: "paid",
      label: "Assinatura ativa",
      creditBalance,
      remainingAds: creditsToRemainingAds(creditBalance),
      hasSpendAccess: true,
      subscription,
      betaEntitlement,
    };
  }

  if (betaEntitlement) {
    return {
      kind: "beta",
      label: "Acesso beta",
      creditBalance,
      remainingAds: creditsToRemainingAds(creditBalance),
      hasSpendAccess: true,
      subscription: null,
      betaEntitlement,
    };
  }

  return {
    kind: "none",
    label: "Sem acesso ativo",
    creditBalance,
    remainingAds: null,
    hasSpendAccess: false,
    subscription: null,
    betaEntitlement: null,
  };
}

export function getBetaAllowanceSummary(remainingAds: number) {
  return {
    totalAds: BETA_AD_ALLOWANCE,
    remainingAds,
    exhausted: remainingAds <= 0,
  };
}
