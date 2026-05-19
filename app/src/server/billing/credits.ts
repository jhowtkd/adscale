import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  updateCreditGrantRemaining,
} from "@/server/repositories/billing";
import {
  getUsageByIdempotencyKey,
  trackUsage,
} from "@/server/repositories/usage";

export const CREDIT_COSTS = {
  creative_plan: 1,
  image_derivation: 5,
  regeneration: 5,
  restyling: 5,
  delivery_package_child: 5,
  landing_page: 10,
  creative_qa: 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export type SpendCheck =
  | { allowed: true; amount: number; balance: number }
  | {
      allowed: false;
      amount: number;
      balance: number;
      reason: "inactive_subscription" | "insufficient_credits";
    };

function creditAmount(action: CreditAction, amount?: number) {
  return amount ?? CREDIT_COSTS[action];
}

function totalRemaining(grants: Array<{ remaining: number }>) {
  return grants.reduce((total, grant) => total + grant.remaining, 0);
}

export async function canSpend(
  workspaceId: string,
  action: CreditAction,
  amount?: number
): Promise<SpendCheck> {
  const required = creditAmount(action, amount);
  const subscription = await getActiveSubscriptionByWorkspace(workspaceId);
  const grants = await getAvailableCreditGrants(workspaceId);
  const balance = totalRemaining(grants);

  if (!subscription) {
    return {
      allowed: false,
      amount: required,
      balance,
      reason: "inactive_subscription",
    };
  }

  if (balance < required) {
    return {
      allowed: false,
      amount: required,
      balance,
      reason: "insufficient_credits",
    };
  }

  return { allowed: true, amount: required, balance };
}

export async function recordUsage(input: {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}) {
  const existing = await getUsageByIdempotencyKey(
    input.workspaceId,
    input.idempotencyKey
  );
  if (existing) {
    return { status: "duplicate" as const, usage: existing };
  }

  const check = await canSpend(input.workspaceId, input.action, input.amount);
  if (!check.allowed) {
    return { status: "blocked" as const, check };
  }

  let remainingToDebit = check.amount;
  const grants = await getAvailableCreditGrants(input.workspaceId);
  for (const grant of grants) {
    if (remainingToDebit <= 0) break;
    const debit = Math.min(grant.remaining, remainingToDebit);
    await updateCreditGrantRemaining(grant.id, grant.remaining - debit);
    remainingToDebit -= debit;
  }

  const usage = await trackUsage(
    input.workspaceId,
    input.action,
    check.amount,
    {
      ...(input.metadata ?? {}),
      creditAmount: check.amount,
    },
    input.idempotencyKey
  );

  return { status: "recorded" as const, usage, check };
}
