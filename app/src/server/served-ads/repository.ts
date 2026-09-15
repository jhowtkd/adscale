import "server-only";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { metaAdAccounts, metaConnections, servedAdMetrics, servedAds } from "@/server/db/schema";
import type { MetaAdRow, ServedAdFormat } from "./aggregate";

export async function hasMetaConnection(workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: metaConnections.id })
    .from(metaConnections)
    .where(and(
      eq(metaConnections.workspaceId, workspaceId),
      eq(metaConnections.status, "ativa")
    ))
    .limit(1);
  return rows.length > 0;
}

export interface ServedAdDbRow extends MetaAdRow {
  currency: string;
  imageKey: string | null;
  thumbKey: string | null;
}

/**
 * Linhas live: uma por Anúncio veiculado (a ingestão já agrega por
 * creative_id). A rota ainda passa por aggregate+sort para unificar
 * o caminho do relatório com o fixture.
 */
export async function listServedAdRows(
  workspaceId: string,
  brandId: string,
  windowDays: number,
  format?: ServedAdFormat
): Promise<ServedAdDbRow[]> {
  const conditions = [
    eq(metaAdAccounts.brandId, brandId),
    eq(metaConnections.workspaceId, workspaceId),
    eq(metaConnections.status, "ativa"),
    eq(servedAdMetrics.windowDays, windowDays),
  ];
  if (format) {
    conditions.push(eq(servedAds.format, format));
  }
  const rows = await db
    .select({
      adAccountId: servedAds.adAccountId,
      creativeId: servedAds.creativeId,
      format: servedAds.format,
      text: servedAds.textExcerpt,
      impressions: servedAdMetrics.impressions,
      clicks: servedAdMetrics.clicks,
      spend: servedAdMetrics.spend,
      conversions: servedAdMetrics.conversions,
      currency: metaAdAccounts.currency,
      imageKey: servedAds.mediaImageKey,
      thumbKey: servedAds.mediaThumbKey,
    })
    .from(servedAds)
    .innerJoin(metaAdAccounts, eq(servedAds.accountId, metaAdAccounts.id))
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .innerJoin(servedAdMetrics, eq(servedAdMetrics.anuncioId, servedAds.id))
    .where(and(...conditions));
  return rows.map((row) => ({
    ad_account_id: row.adAccountId,
    ad_id: `${row.adAccountId}:${row.creativeId}`,
    creative_id: row.creativeId,
    format: row.format,
    text: row.text,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: Number(row.spend),
    conversions: row.conversions,
    currency: row.currency,
    imageKey: row.imageKey,
    thumbKey: row.thumbKey,
  }));
}

export async function listLinkedAccountIds(workspaceId: string, brandId: string): Promise<string[]> {
  const rows = await db
    .select({ adAccountId: metaAdAccounts.adAccountId })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(and(
      eq(metaAdAccounts.brandId, brandId),
      eq(metaConnections.workspaceId, workspaceId)
    ));
  return rows.map((row) => row.adAccountId);
}

export type MetaConnectionStatus = "ativa" | "expirada" | "revogada" | "com_erro";

export interface MetaConnectionRow {
  id: string;
  workspaceId: string;
  status: MetaConnectionStatus;
  tokenCiphertext: string | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
}

/** Conexão do workspace (uma por workspace na v1). */
export async function getConnectionByWorkspace(workspaceId: string): Promise<MetaConnectionRow | null> {
  const rows = await db
    .select({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      status: metaConnections.status,
      tokenCiphertext: metaConnections.tokenCiphertext,
      lastSyncAt: metaConnections.lastSyncAt,
      lastSyncError: metaConnections.lastSyncError,
    })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, workspaceId))
    .limit(1);
  return (rows[0] as MetaConnectionRow | undefined) ?? null;
}

export async function getConnectionById(connectionId: string): Promise<MetaConnectionRow | null> {
  const rows = await db
    .select({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      status: metaConnections.status,
      tokenCiphertext: metaConnections.tokenCiphertext,
      lastSyncAt: metaConnections.lastSyncAt,
      lastSyncError: metaConnections.lastSyncError,
    })
    .from(metaConnections)
    .where(eq(metaConnections.id, connectionId))
    .limit(1);
  return (rows[0] as MetaConnectionRow | undefined) ?? null;
}

export async function createConnection(input: {
  workspaceId: string;
  userId: string;
  tokenCiphertext: string;
}): Promise<MetaConnectionRow> {
  const rows = await db
    .insert(metaConnections)
    .values({
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      status: "ativa",
      tokenCiphertext: input.tokenCiphertext,
      tokenUpdatedAt: new Date(),
    })
    .returning({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      status: metaConnections.status,
      tokenCiphertext: metaConnections.tokenCiphertext,
      lastSyncAt: metaConnections.lastSyncAt,
      lastSyncError: metaConnections.lastSyncError,
    });
  return rows[0] as MetaConnectionRow;
}

/** Reconectar troca o token sem apagar histórico. */
export async function updateConnectionToken(connectionId: string, tokenCiphertext: string): Promise<void> {
  await db
    .update(metaConnections)
    .set({ tokenCiphertext, tokenUpdatedAt: new Date(), status: "ativa", lastSyncError: null, updatedAt: new Date() })
    .where(eq(metaConnections.id, connectionId));
}

export async function updateConnectionSync(
  connectionId: string,
  patch: { lastSyncAt?: Date | null; lastSyncError?: string | null; status?: MetaConnectionStatus }
): Promise<void> {
  await db
    .update(metaConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(metaConnections.id, connectionId));
}

/** Desconectar apaga a linha; contas/ads/métricas caem por cascade. Mídia do R2 sai antes, no sync. */
export async function deleteConnection(connectionId: string): Promise<void> {
  await db.delete(metaConnections).where(eq(metaConnections.id, connectionId));
}

export async function listActiveConnections(): Promise<MetaConnectionRow[]> {
  return (await db
    .select({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      status: metaConnections.status,
      tokenCiphertext: metaConnections.tokenCiphertext,
      lastSyncAt: metaConnections.lastSyncAt,
      lastSyncError: metaConnections.lastSyncError,
    })
    .from(metaConnections)
    .where(eq(metaConnections.status, "ativa"))) as MetaConnectionRow[];
}

export interface UpsertAdAccount {
  adAccountId: string;
  name: string | null;
  currency: string;
}

/** Upsert preservando brandId (vínculo é ato do owner, nunca do sync). */
export async function upsertAdAccounts(
  connectionId: string,
  accounts: UpsertAdAccount[]
): Promise<Array<{ id: string; adAccountId: string }>> {
  const out: Array<{ id: string; adAccountId: string }> = [];
  for (const account of accounts) {
    const rows = await db
      .insert(metaAdAccounts)
      .values({
        connectionId,
        adAccountId: account.adAccountId,
        name: account.name,
        currency: account.currency,
      })
      .onConflictDoUpdate({
        target: [metaAdAccounts.connectionId, metaAdAccounts.adAccountId],
        set: { name: account.name, currency: account.currency, updatedAt: new Date() },
      })
      .returning({ id: metaAdAccounts.id, adAccountId: metaAdAccounts.adAccountId });
    out.push(rows[0] as { id: string; adAccountId: string });
  }
  return out;
}

export interface UpsertServedAd {
  id: string;
  accountId: string;
  adAccountId: string;
  creativeId: string;
  format: ServedAdFormat;
  text: string | null;
  lastDeliveredAt: Date | null;
}

export async function upsertServedAd(ad: UpsertServedAd): Promise<void> {
  await db
    .insert(servedAds)
    .values({
      id: ad.id,
      accountId: ad.accountId,
      adAccountId: ad.adAccountId,
      creativeId: ad.creativeId,
      format: ad.format,
      textExcerpt: ad.text,
      lastDeliveredAt: ad.lastDeliveredAt,
    })
    .onConflictDoUpdate({
      target: servedAds.id,
      set: {
        accountId: ad.accountId,
        format: ad.format,
        textExcerpt: ad.text,
        // Sync sem entrega na janela não apaga a última entrega conhecida.
        ...(ad.lastDeliveredAt ? { lastDeliveredAt: ad.lastDeliveredAt } : {}),
        updatedAt: new Date(),
      },
    });
}

export async function updateServedAdMedia(
  anuncioId: string,
  media: { imageKey?: string | null; videoKey?: string | null; thumbKey?: string | null }
): Promise<void> {
  await db
    .update(servedAds)
    .set({
      ...(media.imageKey !== undefined ? { mediaImageKey: media.imageKey } : {}),
      ...(media.videoKey !== undefined ? { mediaVideoKey: media.videoKey } : {}),
      ...(media.thumbKey !== undefined ? { mediaThumbKey: media.thumbKey } : {}),
      updatedAt: new Date(),
    })
    .where(eq(servedAds.id, anuncioId));
}

export async function upsertAdMetrics(input: {
  anuncioId: string;
  windowDays: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}): Promise<void> {
  await db
    .insert(servedAdMetrics)
    .values({
      anuncioId: input.anuncioId,
      windowDays: input.windowDays,
      impressions: input.impressions,
      clicks: input.clicks,
      spend: String(Math.round(input.spend * 100) / 100),
      conversions: input.conversions,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [servedAdMetrics.anuncioId, servedAdMetrics.windowDays],
      set: {
        impressions: input.impressions,
        clicks: input.clicks,
        spend: String(Math.round(input.spend * 100) / 100),
        conversions: input.conversions,
        syncedAt: new Date(),
      },
    });
}

export interface ServedAdMediaKeys {
  anuncioId: string;
  imageKey: string | null;
  videoKey: string | null;
  thumbKey: string | null;
}

/** Chaves de mídia dos ads de uma conexão (purge do R2 antes do cascade). */
export async function listMediaKeysForConnection(connectionId: string): Promise<ServedAdMediaKeys[]> {
  return db
    .select({
      anuncioId: servedAds.id,
      imageKey: servedAds.mediaImageKey,
      videoKey: servedAds.mediaVideoKey,
      thumbKey: servedAds.mediaThumbKey,
    })
    .from(servedAds)
    .innerJoin(metaAdAccounts, eq(servedAds.accountId, metaAdAccounts.id))
    .where(eq(metaAdAccounts.connectionId, connectionId));
}

/** Ads sem entrega há mais de `olderThan` (TTL 90 dias, #347). */
export async function listExpiredServedAds(olderThan: Date): Promise<ServedAdMediaKeys[]> {
  return db
    .select({
      anuncioId: servedAds.id,
      imageKey: servedAds.mediaImageKey,
      videoKey: servedAds.mediaVideoKey,
      thumbKey: servedAds.mediaThumbKey,
    })
    .from(servedAds)
    .where(and(isNotNull(servedAds.lastDeliveredAt), lt(servedAds.lastDeliveredAt, olderThan)));
}

export async function deleteServedAd(anuncioId: string): Promise<void> {
  await db.delete(servedAds).where(eq(servedAds.id, anuncioId));
}

export interface ConnectionAccount {
  id: string;
  adAccountId: string;
  name: string | null;
  currency: string;
  brandId: string | null;
}

export async function listConnectionAccounts(connectionId: string): Promise<ConnectionAccount[]> {
  return db
    .select({
      id: metaAdAccounts.id,
      adAccountId: metaAdAccounts.adAccountId,
      name: metaAdAccounts.name,
      currency: metaAdAccounts.currency,
      brandId: metaAdAccounts.brandId,
    })
    .from(metaAdAccounts)
    .where(eq(metaAdAccounts.connectionId, connectionId));
}

/** Vincular/desvincular conta ↔ marca (brandId null = desvincula). Escopo: conexão do workspace. */
export async function linkAccountBrand(
  connectionId: string,
  accountId: string,
  brandId: string | null
): Promise<boolean> {
  const rows = await db
    .update(metaAdAccounts)
    .set({ brandId, updatedAt: new Date() })
    .where(and(eq(metaAdAccounts.id, accountId), eq(metaAdAccounts.connectionId, connectionId)))
    .returning({ id: metaAdAccounts.id });
  return rows.length > 0;
}

/** Contas vinculadas à marca (para o PR de rotas vincular/desvincular). */
export async function listBrandAccounts(workspaceId: string, brandId: string) {
  return db
    .select({
      id: metaAdAccounts.id,
      adAccountId: metaAdAccounts.adAccountId,
      name: metaAdAccounts.name,
      currency: metaAdAccounts.currency,
    })
    .from(metaAdAccounts)
    .innerJoin(metaConnections, eq(metaAdAccounts.connectionId, metaConnections.id))
    .where(and(
      eq(metaAdAccounts.brandId, brandId),
      eq(metaConnections.workspaceId, workspaceId)
    ));
}
