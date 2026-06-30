import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "../db";
import {
  betaAccessRedemptions,
  workspaceEntitlements,
} from "../db/schema";

export const BETA_ENTITLEMENT_KIND = "beta_tester" as const;
export const TESTER_ENTITLEMENT_KIND = "tester" as const;
export const ENTITLEMENT_STATUS_ACTIVE = "active" as const;
export const ENTITLEMENT_STATUS_REVOKED = "revoked" as const;

export type TesterEntitlementMetadata = {
  notes?: string;
  grantedByUserId?: string;
  grantedByEmail?: string;
};

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function activeEntitlementFilter(kind: string) {
  const now = new Date();
  return and(
    eq(workspaceEntitlements.kind, kind),
    eq(workspaceEntitlements.status, ENTITLEMENT_STATUS_ACTIVE),
    or(isNull(workspaceEntitlements.expiresAt), gt(workspaceEntitlements.expiresAt, now))
  );
}

export async function getActiveBetaEntitlementByWorkspace(
  workspaceId: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .select()
    .from(workspaceEntitlements)
    .where(
      and(eq(workspaceEntitlements.workspaceId, workspaceId), activeEntitlementFilter(BETA_ENTITLEMENT_KIND))
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getActiveTesterEntitlementByWorkspace(
  workspaceId: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .select()
    .from(workspaceEntitlements)
    .where(
      and(
        eq(workspaceEntitlements.workspaceId, workspaceId),
        activeEntitlementFilter(TESTER_ENTITLEMENT_KIND)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listActiveTesterEntitlements() {
  const now = new Date();
  return db
    .select()
    .from(workspaceEntitlements)
    .where(
      and(
        eq(workspaceEntitlements.kind, TESTER_ENTITLEMENT_KIND),
        eq(workspaceEntitlements.status, ENTITLEMENT_STATUS_ACTIVE),
        or(isNull(workspaceEntitlements.expiresAt), gt(workspaceEntitlements.expiresAt, now))
      )
    )
    .orderBy(desc(workspaceEntitlements.createdAt));
}

export async function grantTesterEntitlement(
  data: {
    workspaceId: string;
    grantedByUserId: string;
    grantedByEmail?: string;
    notes?: string;
    expiresAt?: Date | null;
  },
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const metadata: TesterEntitlementMetadata = {
    notes: data.notes,
    grantedByUserId: data.grantedByUserId,
    grantedByEmail: data.grantedByEmail,
  };

  const rows = await client
    .insert(workspaceEntitlements)
    .values({
      workspaceId: data.workspaceId,
      kind: TESTER_ENTITLEMENT_KIND,
      status: ENTITLEMENT_STATUS_ACTIVE,
      metadata,
      expiresAt: data.expiresAt ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [workspaceEntitlements.workspaceId, workspaceEntitlements.kind],
      set: {
        status: ENTITLEMENT_STATUS_ACTIVE,
        metadata,
        expiresAt: data.expiresAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0];
}

export async function revokeTesterEntitlement(workspaceId: string, tx?: DbOrTx) {
  const client = tx ?? db;
  const rows = await client
    .update(workspaceEntitlements)
    .set({
      status: ENTITLEMENT_STATUS_REVOKED,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceEntitlements.workspaceId, workspaceId),
        eq(workspaceEntitlements.kind, TESTER_ENTITLEMENT_KIND),
        eq(workspaceEntitlements.status, ENTITLEMENT_STATUS_ACTIVE)
      )
    )
    .returning();

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
