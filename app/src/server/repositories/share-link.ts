import { and, desc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, derivations, shareLinks, type ShareLink } from "../db/schema";

export type CampaignShareLinkError = "campaign_not_found" | "invalid_selection";

export async function createCampaignShareLink(data: {
  token: string;
  campaignId: string;
  workspaceId: string;
  derivationIds: string[];
  expiresAt: Date;
}): Promise<{ ok: true } | { ok: false; error: CampaignShareLinkError }> {
  const ids = [...new Set(data.derivationIds.map((id) => id.toLowerCase()))];
  if (ids.length === 0) return { ok: false, error: "invalid_selection" };
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '2s'`);
    await tx.execute(sql`set local statement_timeout = '5s'`);
    const [campaign] = await tx.select({ id: campaigns.id }).from(campaigns)
      .where(and(eq(campaigns.id, data.campaignId), eq(campaigns.workspaceId, data.workspaceId)))
      .limit(1).for("share");
    if (!campaign) return { ok: false, error: "campaign_not_found" } as const;

    const items = await tx.select({ id: derivations.id, outputKey: derivations.outputKey }).from(derivations)
      .where(and(
        eq(derivations.campaignId, data.campaignId),
        eq(derivations.workspaceId, data.workspaceId),
        inArray(derivations.id, ids),
      )).for("share");
    if (items.length !== ids.length || items.some((item) => !item.outputKey)) {
      return { ok: false, error: "invalid_selection" } as const;
    }

    await tx.insert(shareLinks).values({ ...data, derivationIds: ids });
    return { ok: true } as const;
  }).catch((error: unknown) => {
    let cause = error;
    for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth += 1) {
      const pg = cause as { code?: unknown; cause?: unknown };
      if (pg.code === "55P03" || pg.code === "57014") {
        return { ok: false, error: "invalid_selection" } as const;
      }
      cause = pg.cause;
    }
    throw error;
  });
}

export async function getCampaignShareAsset(
  campaignId: string,
  workspaceId: string,
  derivationIds: string[],
  derivationId: string,
) {
  const ids = [...new Set(derivationIds.map((id) => id.toLowerCase()))];
  const id = derivationId.toLowerCase();
  if (!ids.includes(id)) return null;
  const [item] = await db.select({ id: derivations.id, outputKey: derivations.outputKey })
    .from(derivations)
    .innerJoin(campaigns, and(eq(campaigns.id, derivations.campaignId), eq(campaigns.workspaceId, workspaceId)))
    .where(and(
      eq(derivations.id, id),
      eq(derivations.workspaceId, workspaceId),
      eq(derivations.campaignId, campaignId),
      notExists(db.select({ id: derivations.id }).from(derivations).where(and(
        inArray(derivations.id, ids),
        or(ne(derivations.workspaceId, workspaceId), ne(derivations.campaignId, campaignId)),
      ))),
    )).limit(1);
  return item ?? null;
}

export async function getCampaignSharePackage(
  campaignId: string,
  workspaceId: string,
  derivationIds: string[],
) {
  const ids = [...new Set(derivationIds.map((id) => id.toLowerCase()))];
  const scope = and(
    eq(derivations.workspaceId, workspaceId),
    eq(derivations.campaignId, campaignId),
  );
  const [[campaign], items, foreignItems] = await Promise.all([
    db.select({ name: campaigns.name, client: campaigns.client, notes: campaigns.notes })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
      .limit(1),
    ids.length
      ? db.select({
          id: derivations.id,
          outputKey: derivations.outputKey,
          format: derivations.format,
          generationMode: derivations.generationMode,
          variantIndex: derivations.variantIndex,
          ctaText: derivations.ctaText,
        }).from(derivations).where(and(scope, inArray(derivations.id, ids)))
      : Promise.resolve([]),
    // Reject foreign members as a set, while preserving packages with deleted assets.
    ids.length
      ? db.select({ id: derivations.id }).from(derivations)
          .where(and(inArray(derivations.id, ids), or(
            ne(derivations.workspaceId, workspaceId),
            ne(derivations.campaignId, campaignId),
          ))).limit(1)
      : Promise.resolve([]),
  ]);
  return campaign && foreignItems.length === 0 ? { campaign, items } : null;
}

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
