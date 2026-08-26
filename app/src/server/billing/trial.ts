import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  creditGrants,
  workspaceEntitlements,
  workspaceMembers,
} from "@/server/db/schema";
import {
  createCreditGrant,
  getCreditGrantBySourceId,
} from "@/server/repositories/billing";
import {
  ENTITLEMENT_STATUS_ACTIVE,
  ENTITLEMENT_STATUS_PENDING_VERIFICATION,
  TRIAL_ENTITLEMENT_KIND,
  createPendingTrialEntitlement,
  getTrialEntitlementByWorkspaceForUpdate,
  updateEntitlementStatus,
} from "@/server/repositories/entitlements";
import { TRIAL_CREDIT_GRANT } from "@/lib/billing/credit-units";

export type WorkspaceEntitlement = typeof workspaceEntitlements.$inferSelect;
export type CreditGrant = typeof creditGrants.$inferSelect;

export {
  TRIAL_ENTITLEMENT_KIND,
  ENTITLEMENT_STATUS_PENDING_VERIFICATION,
  createPendingTrialEntitlement,
};

export const TRIAL_CREDIT_GRANT_SOURCE = "signup_trial" as const;

export type ActivateSignupTrialResult =
  | {
      status: "activated" | "already_active";
      entitlement: WorkspaceEntitlement;
      grant: CreditGrant;
    }
  | {
      status: "not_eligible";
      entitlement: null;
      grant: null;
    };

export async function activateSignupTrial(input: {
  workspaceId: string;
  userId: string;
}): Promise<ActivateSignupTrialResult> {
  return db.transaction(async (tx) => {
    const memberRows = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.userId)
        )
      )
      .limit(1);

    const member = memberRows[0];
    if (!member || member.role !== "owner") {
      return { status: "not_eligible", entitlement: null, grant: null };
    }

    const entitlement = await getTrialEntitlementByWorkspaceForUpdate(
      input.workspaceId,
      tx
    );

    if (!entitlement) {
      return { status: "not_eligible", entitlement: null, grant: null };
    }

    if (entitlement.status === ENTITLEMENT_STATUS_ACTIVE) {
      const existingGrant = await getCreditGrantBySourceId(
        TRIAL_CREDIT_GRANT_SOURCE,
        entitlement.id,
        tx
      );

      if (existingGrant) {
        return {
          status: "already_active",
          entitlement,
          grant: existingGrant,
        };
      }

      const grant = await createCreditGrant(
        {
          workspaceId: input.workspaceId,
          source: TRIAL_CREDIT_GRANT_SOURCE,
          sourceId: entitlement.id,
          amount: TRIAL_CREDIT_GRANT,
          expiresAt: null,
        },
        tx
      );

      return {
        status: "already_active",
        entitlement,
        grant,
      };
    }

    if (entitlement.status !== ENTITLEMENT_STATUS_PENDING_VERIFICATION) {
      return { status: "not_eligible", entitlement: null, grant: null };
    }

    const grant = await createCreditGrant(
      {
        workspaceId: input.workspaceId,
        source: TRIAL_CREDIT_GRANT_SOURCE,
        sourceId: entitlement.id,
        amount: TRIAL_CREDIT_GRANT,
        expiresAt: null,
      },
      tx
    );

    const updatedEntitlement = await updateEntitlementStatus(
      entitlement.id,
      ENTITLEMENT_STATUS_ACTIVE,
      tx
    );

    return {
      status: "activated",
      entitlement: updatedEntitlement ?? {
        ...entitlement,
        status: ENTITLEMENT_STATUS_ACTIVE,
      },
      grant,
    };
  });
}

export async function activateSignupTrialForOwner(
  userId: string
): Promise<ActivateSignupTrialResult> {
  const member = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.role, "owner")
      )
    )
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1);

  if (!member[0]) {
    return { status: "not_eligible", entitlement: null, grant: null };
  }

  return activateSignupTrial({
    workspaceId: member[0].workspaceId,
    userId,
  });
}

