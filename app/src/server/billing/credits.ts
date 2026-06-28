import { getWorkspaceBillingAccess } from "@/server/billing/access";
import {
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
import { captureException } from "@/lib/sentry";
import { resolveCreditOperationKey } from "./credit-operation-key";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { createCreditTransaction } from "@/server/repositories/credit-transactions";
import { z } from "zod";
import {
  DEV_ADMIN_CREDIT_BALANCE,
  workspaceHasDevAdminOwner,
} from "@/server/auth/dev-admin";

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

const betaSessionIdSchema = z.string().uuid();

function betaSessionIdFromMetadata(
  metadata: Record<string, unknown>
): string | undefined {
  const value = metadata.betaSessionId;
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = betaSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function derivationIdFromMetadata(metadata: Record<string, unknown>) {
  if (typeof metadata.sourceDerivationId === "string") {
    return metadata.sourceDerivationId;
  }
  if (typeof metadata.derivationId === "string") {
    return metadata.derivationId;
  }
  return undefined;
}

function emitCreditBlockedAnalytics(
  input: {
    workspaceId: string;
    action: CreditAction;
    userId: string;
    metadata?: Record<string, unknown>;
  },
  check: Extract<SpendCheck, { allowed: false }>
) {
  const meta = input.metadata ?? {};
  const operationKey = resolveCreditOperationKey(input.action, meta);
  void recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: "credit_blocked",
    source: "server",
    campaignId: typeof meta.campaignId === "string" ? meta.campaignId : undefined,
    derivationId: derivationIdFromMetadata(meta),
    sessionId: betaSessionIdFromMetadata(meta),
    properties: {
      operation: input.action,
      operation_key: operationKey,
      reasonCode: check.reason,
      estimateCredits: check.amount,
    },
  }).catch((err) => {
    logger.warn("[recordUsage] credit_blocked analytics failed", err);
  });
}

function emitCreditSpendAnalytics(
  input: {
    workspaceId: string;
    action: CreditAction;
    userId: string;
    metadata?: Record<string, unknown>;
  },
  check: Extract<SpendCheck, { allowed: true }>
) {
  const meta = input.metadata ?? {};
  const operationKey = resolveCreditOperationKey(input.action, meta);
  const estimateCredits =
    typeof meta.estimateCredits === "number"
      ? meta.estimateCredits
      : check.amount;
  const actualCredits = check.amount;
  const creditDelta =
    estimateCredits !== actualCredits ? actualCredits - estimateCredits : undefined;

  void recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: "credit_spend",
    source: "server",
    campaignId: typeof meta.campaignId === "string" ? meta.campaignId : undefined,
    derivationId: derivationIdFromMetadata(meta),
    sessionId: betaSessionIdFromMetadata(meta),
    properties: {
      operation: input.action,
      operation_key: operationKey,
      actualCredits,
      estimateCredits,
      ...(creditDelta !== undefined ? { creditDelta } : {}),
    },
  }).catch((err) => {
    logger.warn("[recordUsage] credit_spend analytics failed", err);
  });
}

export async function canSpend(
  workspaceId: string,
  action: CreditAction,
  amount?: number
): Promise<SpendCheck> {
  const required = creditAmount(action, amount);

  if (await workspaceHasDevAdminOwner(workspaceId)) {
    return {
      allowed: true,
      amount: required,
      balance: DEV_ADMIN_CREDIT_BALANCE,
    };
  }

  const [access, grants] = await Promise.all([
    getWorkspaceBillingAccess(workspaceId),
    getAvailableCreditGrants(workspaceId),
  ]);
  const balance = totalRemaining(grants);

  if (!access.hasSpendAccess) {
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
    if (input.userId) {
      emitCreditBlockedAnalytics({ ...input, userId: input.userId }, check);
    }
    return { status: "blocked" as const, check };
  }

  const devAdminWorkspace = await workspaceHasDevAdminOwner(input.workspaceId);

  if (!devAdminWorkspace) {
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
        const blockedCheck = {
          ...check,
          allowed: false as const,
          reason: "insufficient_credits" as const,
        };
        if (input.userId) {
          emitCreditBlockedAnalytics({ ...input, userId: input.userId }, blockedCheck);
        }
        return {
          status: "blocked" as const,
          check: blockedCheck,
        };
      }
      throw err;
    }
  }

  const usage = await trackUsage(
    input.workspaceId,
    input.action,
    devAdminWorkspace ? 0 : check.amount,
    {
      ...(input.metadata ?? {}),
      creditAmount: check.amount,
      devAdminBypass: devAdminWorkspace || undefined,
    },
    input.idempotencyKey
  );

  if (input.userId && !devAdminWorkspace) {
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
      logger.error("[recordUsage] failed to create credit transaction", { error: txErr, workspaceId: input.workspaceId, amount: -check.amount });
      captureException(txErr, {
        tags: { component: "billing-ledger", workspaceId: input.workspaceId, action: input.action },
      });
    }
  }

  const newBalance = devAdminWorkspace
    ? DEV_ADMIN_CREDIT_BALANCE
    : check.balance - check.amount;
  if (!devAdminWorkspace && newBalance < 10) {
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

  if (input.userId) {
    emitCreditSpendAnalytics({ ...input, userId: input.userId }, check);
  }

  return { status: "recorded" as const, usage, check };
}
