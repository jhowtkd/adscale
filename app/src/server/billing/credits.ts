import {
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  updateCreditGrantRemaining,
} from "@/server/repositories/billing";
import {
  getUsageByIdempotencyKey,
  trackUsage,
} from "@/server/repositories/usage";
import {
  getWorkspaceNotificationRecipients,
  sendLowCreditsEmail,
} from "@/server/services/notifications";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { createCreditTransaction } from "@/server/repositories/credit-transactions";

export const CREDIT_COSTS = {
  creative_plan: 1,
  image_derivation: 5,
  regeneration: 5,
  restyling: 5,
  delivery_package_child: 5,
  landing_page: 10,
  creative_qa: 1,
  copy_generation: 2,
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
  const [subscription, grants] = await Promise.all([
    getActiveSubscriptionByWorkspace(workspaceId),
    getAvailableCreditGrants(workspaceId),
  ]);
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
  userId?: string;
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
  try {
    await db.transaction(async (tx) => {
      const grants = await getAvailableCreditGrants(input.workspaceId, tx, true);
      const balance = totalRemaining(grants);
      if (balance < check.amount) {
        throw new Error("insufficient_credits");
      }

      const debits: Array<{ id: string; remaining: number }> = [];
      for (const grant of grants) {
        if (remainingToDebit <= 0) break;
        const debit = Math.min(grant.remaining, remainingToDebit);
        debits.push({ id: grant.id, remaining: grant.remaining - debit });
        remainingToDebit -= debit;
      }

      if (remainingToDebit > 0) {
        throw new Error("insufficient_credits");
      }

      await Promise.all(
        debits.map((debit) => updateCreditGrantRemaining(debit.id, debit.remaining, tx))
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "insufficient_credits") {
      return {
        status: "blocked" as const,
        check: { ...check, allowed: false, reason: "insufficient_credits" as const },
      };
    }
    throw err;
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

  if (input.userId) {
    try {
      const meta = input.metadata ?? {};
      await createCreditTransaction({
        userId: input.userId,
        workspaceId: input.workspaceId,
        campaignId: typeof meta.campaignId === "string" ? meta.campaignId : null,
        derivationId: typeof meta.sourceDerivationId === "string"
          ? meta.sourceDerivationId
          : typeof meta.derivationId === "string"
            ? meta.derivationId
            : null,
        amount: -check.amount,
        type: "usage",
        description: input.action,
      });
    } catch (txErr) {
      logger.warn("[recordUsage] failed to create credit transaction", txErr);
    }
  }

  const newBalance = check.balance - check.amount;
  if (newBalance < 10) {
    try {
      const recipients = await getWorkspaceNotificationRecipients(input.workspaceId);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await Promise.all(
        recipients.map(async (recipient) => {
          if (!recipient.lowCreditsNotifiedAt || recipient.lowCreditsNotifiedAt < oneDayAgo) {
          await sendLowCreditsEmail({
            to: recipient.email,
            creditBalance: newBalance,
            locale: recipient.locale,
          });
          await db
            .update(user)
            .set({ lowCreditsNotifiedAt: new Date() })
            .where(eq(user.id, recipient.userId));
          }
        })
      );
    } catch (notifyErr) {
      logger.warn("[recordUsage] failed to send low credits email", notifyErr);
    }
  }

  return { status: "recorded" as const, usage, check };
}
