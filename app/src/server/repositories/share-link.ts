import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { shareLinks, type ShareLink } from "../db/schema";

export async function createShareLink(data: {
  token: string;
  campaignId?: string | null;
  workspaceId: string;
  derivationIds: string[];
  creativeWorkId?: string | null;
  outputId?: string | null;
  outputVersion?: number | null;
  expiresAt: Date;
}) {
  const result = await db
    .insert(shareLinks)
    .values({
      token: data.token,
      campaignId: data.campaignId ?? null,
      workspaceId: data.workspaceId,
      derivationIds: data.derivationIds,
      creativeWorkId: data.creativeWorkId ?? null,
      outputId: data.outputId ?? null,
      outputVersion: data.outputVersion ?? null,
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

/**
 * Revoke a share link so its token can no longer be validated, even before
 * its expiry. Scoped to the owning workspace so a user can only revoke
 * their own links.
 */
export async function revokeShareLinkForCampaign(
  campaignId: string,
  workspaceId: string
): Promise<number> {
  const result = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.campaignId, campaignId),
        eq(shareLinks.workspaceId, workspaceId),
        sql`${shareLinks.revokedAt} IS NULL`
      )
    )
    .returning();
  return result.length;
}

export async function revokeShareLinkForOutput(
  workspaceId: string,
  outputId: string,
): Promise<number> {
  const result = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.workspaceId, workspaceId),
        eq(shareLinks.outputId, outputId),
        sql`${shareLinks.revokedAt} IS NULL`
      )
    )
    .returning();
  return result.length;
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

export async function getLatestShareLinkForOutput(
  workspaceId: string,
  outputId: string,
): Promise<ShareLink | null> {
  const result = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.workspaceId, workspaceId),
        eq(shareLinks.outputId, outputId),
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
        revokedAt: null,
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

export async function upsertShareLinkForOutput(data: {
  workspaceId: string;
  creativeWorkId: string;
  outputId: string;
  outputVersion: number;
  expiresAt: Date;
}): Promise<ShareLink> {
  const existing = await getLatestShareLinkForOutput(data.workspaceId, data.outputId);
  if (existing) {
    const [updated] = await db
      .update(shareLinks)
      .set({
        creativeWorkId: data.creativeWorkId,
        outputVersion: data.outputVersion,
        expiresAt: data.expiresAt,
        revokedAt: null,
        derivationIds: [],
        campaignId: null,
      })
      .where(eq(shareLinks.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(shareLinks)
    .values({
      token: crypto.randomUUID(),
      campaignId: null,
      workspaceId: data.workspaceId,
      derivationIds: [],
      creativeWorkId: data.creativeWorkId,
      outputId: data.outputId,
      outputVersion: data.outputVersion,
      expiresAt: data.expiresAt,
    })
    .returning();
  return created!;
}
