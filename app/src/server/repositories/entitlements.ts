import { and, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "../db";
import {
  betaAccessRedemptions,
  workspaceEntitlements,
} from "../db/schema";

export const BETA_ENTITLEMENT_KIND = "beta_tester" as const;
export const ENTITLEMENT_STATUS_ACTIVE = "active" as const;

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getActiveBetaEntitlementByWorkspace(
  workspaceId: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const now = new Date();
  const rows = await client
    .select()
    .from(workspaceEntitlements)
    .where(
      and(
        eq(workspaceEntitlements.workspaceId, workspaceId),
        eq(workspaceEntitlements.kind, BETA_ENTITLEMENT_KIND),
        eq(workspaceEntitlements.status, ENTITLEMENT_STATUS_ACTIVE),
        or(
          isNull(workspaceEntitlements.expiresAt),
          gt(workspaceEntitlements.expiresAt, now)
        )
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getBetaRedemptionByWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(betaAccessRedemptions)
    .where(eq(betaAccessRedemptions.workspaceId, workspaceId))
    .limit(1);

  return rows[0] ?? null;
}

export async function createBetaEntitlement(
  data: {
    workspaceId: string;
    sourceCode: string;
    redeemedByUserId: string;
  },
  tx: DbOrTx
) {
  const rows = await tx
    .insert(workspaceEntitlements)
    .values({
      workspaceId: data.workspaceId,
      kind: BETA_ENTITLEMENT_KIND,
      status: ENTITLEMENT_STATUS_ACTIVE,
      sourceCode: data.sourceCode,
      redeemedByUserId: data.redeemedByUserId,
      updatedAt: new Date(),
    })
    .returning();

  return rows[0];
}

export async function recordBetaRedemption(
  data: {
    workspaceId: string;
    userId: string;
    code: string;
    entitlementId: string;
  },
  tx: DbOrTx
) {
  const rows = await tx
    .insert(betaAccessRedemptions)
    .values({
      workspaceId: data.workspaceId,
      userId: data.userId,
      code: data.code,
      entitlementId: data.entitlementId,
    })
    .returning();

  return rows[0];
}
