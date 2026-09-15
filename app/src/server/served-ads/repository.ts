import "server-only";
import { and, eq } from "drizzle-orm";
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
