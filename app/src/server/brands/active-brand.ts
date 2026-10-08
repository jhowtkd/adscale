import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts } from "@/server/db/equipe-schema";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
import { ACTIVE_BRAND_COOKIE, pickActiveBrand, type ActiveBrand } from "@/lib/brands/active-brand";

/** The brand of the free plan's account; a closed one counts too, since the workspace gets that account back, whatever the brand. */
async function freePlanBrandId(workspaceId: string): Promise<string | null> {
  const plan = await findFreePlanAccount(workspaceId);
  const accountId = plan?.accountId ?? plan?.closedAccountId;
  if (!accountId) return null;
  const [row] = await db
    .select({ clientProfileId: equipeAccounts.clientProfileId })
    .from(equipeAccounts)
    .where(eq(equipeAccounts.id, accountId))
    .limit(1);
  return row?.clientProfileId ?? null;
}

/** The brand of the workspace's oldest live account (any status but closed): where its current conversation is. */
async function oldestLiveAccountBrandId(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ clientProfileId: equipeAccounts.clientProfileId })
    .from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), ne(equipeAccounts.status, "closed")))
    .orderBy(asc(equipeAccounts.createdAt), asc(equipeAccounts.id))
    .limit(1);
  return row?.clientProfileId ?? null;
}

async function readActiveBrandCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  } catch {
    return undefined; // no request cookie store (a script or a unit caller)
  }
}

/** The active brand (spec 2026-10-07 §3), once per request: the layout and the page ask the same question. */
export const resolveActiveBrand = cache(async (workspaceId: string): Promise<ActiveBrand | null> => {
  const [profiles, cookieValue, lockedBrand, liveAccountBrand] = await Promise.all([
    getClientProfiles(workspaceId),
    readActiveBrandCookie(),
    freePlanBrandId(workspaceId),
    oldestLiveAccountBrandId(workspaceId),
  ]);
  return pickActiveBrand(profiles.map(({ id, name, createdAt }) => ({ id, name, createdAt })), cookieValue, lockedBrand, liveAccountBrand);
});
