import { getWorkspaceBillingAccess } from "@/server/billing/access";
import {
  getAvailableCreditGrants,
  getRefundableCreditGrants,
  pickRefundTargetGrant,
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
  UNLIMITED_CREDIT_BALANCE,
  workspaceHasUnlimitedBillingAccess,
} from "@/server/billing/unlimited-access";
import {
  CREDIT_COSTS,
  CREDIT_UNIT_VERSION,
  LOW_CREDIT_THRESHOLD,
  type CreditAction,
} from "@/lib/billing/credit-units";

export { CREDIT_COSTS, type CreditAction };

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
      creditUnitVersion: CREDIT_UNIT_VERSION,
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
      creditUnitVersion: CREDIT_UNIT_VERSION,
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

  if (await workspaceHasUnlimitedBillingAccess(workspaceId)) {
    return {
      allowed: true,
      amount: required,
      balance: UNLIMITED_CREDIT_BALANCE,
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

  const unlimitedBillingBypass = await workspaceHasUnlimitedBillingAccess(input.workspaceId);

  let usage: Awaited<ReturnType<typeof trackUsage>>;
  try {
    usage = await db.transaction(async (tx) => {
      const duplicate = await getUsageByIdempotencyKey(
        input.workspaceId,
        input.idempotencyKey,
        tx
      );
      if (duplicate) {
        throw new Error("duplicate_usage");
      }

      if (!unlimitedBillingBypass) {
        let remainingToDebit = check.amount;
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
      }

      return trackUsage(
        input.workspaceId,
        input.action,
        unlimitedBillingBypass ? 0 : check.amount,
        {
          ...(input.metadata ?? {}),
          creditAmount: check.amount,
          unlimitedBillingBypass: unlimitedBillingBypass || undefined,
        },
        input.idempotencyKey,
        tx
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "duplicate_usage") {
      const duplicate = await getUsageByIdempotencyKey(
        input.workspaceId,
        input.idempotencyKey
      );
      if (duplicate) {
        return { status: "duplicate" as const, usage: duplicate };
      }
    }
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

  if (input.userId && !unlimitedBillingBypass) {
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

  const newBalance = unlimitedBillingBypass
    ? UNLIMITED_CREDIT_BALANCE
    : check.balance - check.amount;
  if (!unlimitedBillingBypass && newBalance < LOW_CREDIT_THRESHOLD) {
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

  return {
    status: "recorded" as const,
    usage,
    check,
    settlement: unlimitedBillingBypass
      ? {
          kind: "unlimited_billing_bypass" as const,
          billedCredits: 0,
          listedCredits: check.amount,
          internalDebit: false,
          refund: "not_applicable" as const,
          reason: "settled_without_internal_debit",
        }
      : {
          kind: "internal_ledger_debit" as const,
          billedCredits: check.amount,
          listedCredits: check.amount,
          internalDebit: true,
          refund: "unproven" as const,
          reason: "internal_debit_is_not_raw_provider_settlement",
        },
  };
}

/**
 * Typed sentinel thrown inside the refund transaction when a concurrent
 * refund already committed the same idempotency key. A typed class (not a
 * message match) keeps rewrapped errors from being misclassified.
 */
export class DuplicateRefundError extends Error {
  readonly code = "duplicate_refund" as const;

  constructor() {
    super("duplicate_refund");
    this.name = "DuplicateRefundError";
  }
}

export async function refundCredits(input: {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<{ status: "refunded" | "duplicate" }> {
  const existing = await getUsageByIdempotencyKey(
    input.workspaceId,
    input.idempotencyKey
  );
  if (existing) {
    return { status: "duplicate" as const };
  }

  const refundAmount = creditAmount(input.action, input.amount);
  const meta = input.metadata ?? {};

  const unlimitedBillingBypass = await workspaceHasUnlimitedBillingAccess(input.workspaceId);

  // R-006: the grant credit and the idempotency-key reservation commit in the
  // SAME transaction. The previous check-then-act split let two concurrent
  // refunds with the same key both credit the grant before the second
  // trackUsage hit the unique index — a double credit followed by an error.
  // The duplicate is re-checked AFTER the FOR UPDATE grant lock so a
  // concurrent refund that committed first becomes visible and loses cleanly.
  try {
    await db.transaction(async (tx) => {
      const checkDuplicate = async () => {
        const duplicate = await getUsageByIdempotencyKey(
          input.workspaceId,
          input.idempotencyKey,
          tx
        );
        if (duplicate) {
          throw new DuplicateRefundError();
        }
      };
      await checkDuplicate();

      if (!unlimitedBillingBypass) {
        const grants = await getRefundableCreditGrants(
          input.workspaceId,
          tx,
          true
        );
        const target = pickRefundTargetGrant(grants);
        if (!target) {
          throw new Error("no_refundable_grant");
        }
        await checkDuplicate();
        await updateCreditGrantRemaining(
          target.id,
          target.remaining + refundAmount,
          tx
        );
      }

      // Reserve the idempotency key in the same transaction as the grant credit
      // so concurrent refunds cannot double-increment the balance.
      await trackUsage(
        input.workspaceId,
        input.action,
        unlimitedBillingBypass ? 0 : -refundAmount,
        {
          ...meta,
          refund: true,
          creditAmount: refundAmount,
          unlimitedBillingBypass: unlimitedBillingBypass || undefined,
        },
        input.idempotencyKey,
        tx
      );
    });
  } catch (err) {
    if (err instanceof DuplicateRefundError) {
      return { status: "duplicate" as const };
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      // Concurrent refund won the idempotency-key race inside the
      // transaction — the credit landed exactly once.
      return { status: "duplicate" as const };
    }
    logger.error("[refundCredits] failed to credit grant atomically", {
      error: err,
      workspaceId: input.workspaceId,
      amount: refundAmount,
    });
    throw err;
  }

  if (input.userId) {
    try {
      await createCreditTransaction({
        userId: input.userId,
        workspaceId: input.workspaceId,
        campaignId: typeof meta.campaignId === "string" ? meta.campaignId : null,
        derivationId:
          typeof meta.sourceDerivationId === "string"
            ? meta.sourceDerivationId
            : typeof meta.derivationId === "string"
              ? meta.derivationId
              : null,
        amount: refundAmount,
        type: "refund",
        description: `${input.action}_refund`,
      });
    } catch (txErr) {
      logger.error("[refundCredits] failed to create refund transaction", {
        error: txErr,
        workspaceId: input.workspaceId,
        amount: refundAmount,
      });
      captureException(txErr, {
        tags: {
          component: "billing-ledger",
          workspaceId: input.workspaceId,
          action: input.action,
        },
      });
    }
  }

  return { status: "refunded" as const };
}
