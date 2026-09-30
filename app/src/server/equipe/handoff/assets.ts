import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts } from "@/server/db/equipe-schema";
export async function isFreeAssetWorkspace(workspaceId: string) {
  const [free] = await db.select({ id: equipeAccounts.id }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), eq(equipeAccounts.status, "free"))).limit(1);
  return Boolean(free);
}
