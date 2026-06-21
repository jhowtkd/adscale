import { count, eq } from "drizzle-orm";

import { getWorkspaceBillingAccess } from "../billing/access";
import { getStripePriceId, type BillingPlanKey } from "../billing/plans";
import { getWorkspaceMembers } from "../auth/team";
import { db } from "../db";
import { campaigns, subscriptions, workspaceEntitlements, workspaces } from "../db/schema";
import {
  createCreditGrant,
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  updateCreditGrantRemaining,
} from "./billing";
import { getCreditTransactionsForWorkspace } from "./credit-transactions";
import { getActiveBetaEntitlementByWorkspace } from "./entitlements";
import { recordAdminAuditLog } from "./admin-audit";

export type AdminWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  };
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    joinedAt: string;
  }>;
  campaignCount: number;
  billing: {
    planKey: string | null;
    creditBalance: number;
    remainingAds: number | null;
    kind: string;
    label: string;
    subscriptionStatus: string;
  };
  creditTransactions: Array<{
    id: string;
    amount: number;
    type: string;
    description: string | null;
    campaignName: string | null;
    createdAt: string;
  }>;
};

export type AdminWorkspaceAction = "adjust_credits" | "override_plan";

export type AdminWorkspaceActionPayload =
  | { action: "adjust_credits"; delta: number }
  | { action: "override_plan"; planKey: BillingPlanKey };

function totalRemaining(grants: Array<{ remaining: number }>) {
  return grants.reduce((total, grant) => total + grant.remaining, 0);
}

export async function getAdminWorkspaceDetail(
  workspaceId: string
): Promise<AdminWorkspaceDetail | null> {
  const [workspaceRow] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspaceRow) {
    return null;
  }

  const [members, [campaignCountRow], billingAccess, creditTransactionRows] =
    await Promise.all([
      getWorkspaceMembers(workspaceId),
      db
        .select({ value: count() })
        .from(campaigns)
        .where(eq(campaigns.workspaceId, workspaceId)),
      getWorkspaceBillingAccess(workspaceId),
      getCreditTransactionsForWorkspace(workspaceId),
    ]);

  const planKey =
    billingAccess.subscription?.planKey ??
    billingAccess.latestSubscription?.planKey ??
    null;

  return {
    workspace: {
      id: workspaceRow.id,
      name: workspaceRow.name,
      slug: workspaceRow.slug,
      createdAt: workspaceRow.createdAt.toISOString(),
      updatedAt: workspaceRow.updatedAt.toISOString(),
    },
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    })),
    campaignCount: Number(campaignCountRow?.value ?? 0),
    billing: {
      planKey,
      creditBalance: billingAccess.creditBalance,
      remainingAds: billingAccess.remainingAds,
      kind: billingAccess.kind,
      label: billingAccess.label,
      subscriptionStatus: billingAccess.subscriptionStatus,
    },
    creditTransactions: creditTransactionRows.slice(0, 20).map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      description: row.description,
      campaignName: row.campaignName,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

async function adjustWorkspaceCredits(
  workspaceId: string,
  delta: number
): Promise<{ before: number; after: number }> {
  const grantsBefore = await getAvailableCreditGrants(workspaceId);
  const before = totalRemaining(grantsBefore);

  if (delta === 0) {
    return { before, after: before };
  }

  if (delta > 0) {
    await createCreditGrant({
      workspaceId,
      source: "admin_adjustment",
      sourceId: String(Date.now()),
      amount: delta,
    });
    return { before, after: before + delta };
  }

  const amountToDebit = Math.abs(delta);
  if (before < amountToDebit) {
    throw new Error("Insufficient credits");
  }

  await db.transaction(async (tx) => {
    const grants = await getAvailableCreditGrants(workspaceId, tx, true);
    let remainingToDebit = amountToDebit;
    const debits: Array<{ id: string; remaining: number }> = [];

    for (const grant of grants) {
      if (remainingToDebit <= 0) break;
      const debit = Math.min(grant.remaining, remainingToDebit);
      debits.push({ id: grant.id, remaining: grant.remaining - debit });
      remainingToDebit -= debit;
    }

    if (remainingToDebit > 0) {
      throw new Error("Insufficient credits");
    }

    await Promise.all(
      debits.map((debit) => updateCreditGrantRemaining(debit.id, debit.remaining, tx))
    );
  });

  return { before, after: before - amountToDebit };
}

async function overrideWorkspacePlan(workspaceId: string, planKey: BillingPlanKey) {
  const subscription = await getActiveSubscriptionByWorkspace(workspaceId);

  if (subscription) {
    await db
      .update(subscriptions)
      .set({
        planKey,
        priceId: getStripePriceId(planKey),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    return {
      target: "subscription" as const,
      subscriptionId: subscription.id,
      planKey,
    };
  }

  const betaEntitlement = await getActiveBetaEntitlementByWorkspace(workspaceId);
  if (betaEntitlement) {
    const existingMetadata =
      betaEntitlement.metadata && typeof betaEntitlement.metadata === "object"
        ? (betaEntitlement.metadata as Record<string, unknown>)
        : {};

    await db
      .update(workspaceEntitlements)
      .set({
        metadata: {
          ...existingMetadata,
          adminPlanOverride: planKey,
        },
        updatedAt: new Date(),
      })
      .where(eq(workspaceEntitlements.id, betaEntitlement.id));

    return {
      target: "beta_entitlement" as const,
      entitlementId: betaEntitlement.id,
      planKey,
    };
  }

  // No active subscription or beta entitlement — plan override cannot be applied.
  throw new Error("No billable subscription or beta entitlement");
}

export async function applyAdminWorkspaceAction(
  workspaceId: string,
  action: AdminWorkspaceAction,
  payload: AdminWorkspaceActionPayload,
  actorEmail: string,
  reason: string
): Promise<void> {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!existing) {
    throw new Error("Workspace not found");
  }

  const auditAction = `workspace.${action}`;

  try {
    let auditPayload: Record<string, unknown> = {};

    switch (action) {
      case "adjust_credits": {
        if (payload.action !== "adjust_credits") {
          throw new Error("Invalid payload for adjust_credits");
        }
        const result = await adjustWorkspaceCredits(workspaceId, payload.delta);
        auditPayload = {
          delta: payload.delta,
          before: result.before,
          after: result.after,
        };
        break;
      }
      case "override_plan": {
        if (payload.action !== "override_plan") {
          throw new Error("Invalid payload for override_plan");
        }
        const result = await overrideWorkspacePlan(workspaceId, payload.planKey);
        auditPayload = result;
        break;
      }
    }

    await recordAdminAuditLog({
      actorEmail,
      action: auditAction,
      targetType: "workspace",
      targetId: workspaceId,
      payload: auditPayload,
      reason,
      status: "success",
    });
  } catch (error) {
    await recordAdminAuditLog({
      actorEmail,
      action: auditAction,
      targetType: "workspace",
      targetId: workspaceId,
      reason,
      status: "failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
