import { and, desc, eq } from "drizzle-orm";
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

export async function getLatestShareLinkForCampaign(
  campaignId: string,
  workspaceId: string
) {
  const result = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.campaignId, campaignId),
        eq(shareLinks.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(shareLinks.createdAt))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertShareLinkForCampaign(data: {
  campaignId: string;
  workspaceId: string;
  derivationIds: string[];
  expiresAt: Date;
}) {
  const existing = await getLatestShareLinkForCampaign(
    data.campaignId,
    data.workspaceId
  );

  if (existing) {
    const result = await db
      .update(shareLinks)
      .set({
        derivationIds: data.derivationIds,
        expiresAt: data.expiresAt,
      })
      .where(eq(shareLinks.id, existing.id))
      .returning();
    return result[0]!;
  }

  const token = crypto.randomUUID();
  const result = await db
    .insert(shareLinks)
    .values({
      token,
      campaignId: data.campaignId,
      workspaceId: data.workspaceId,
      derivationIds: data.derivationIds,
      expiresAt: data.expiresAt,
    })
    .returning();
  return result[0]!;
}
