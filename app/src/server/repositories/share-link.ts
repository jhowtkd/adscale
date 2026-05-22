import { eq } from "drizzle-orm";
import { db } from "../db";
import { shareLinks } from "../db/schema";

export async function createShareLink(data: {
  token: string;
  campaignId: string;
  workspaceId: string;
  derivationIds: string[];
  expiresAt: Date;
}) {
  const result = await db
    .insert(shareLinks)
    .values({
      token: data.token,
      campaignId: data.campaignId,
      workspaceId: data.workspaceId,
      derivationIds: data.derivationIds,
      expiresAt: data.expiresAt,
    })
    .returning();
  return result[0];
}

export async function getShareLinkByToken(token: string) {
  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  return result[0] ?? null;
}
