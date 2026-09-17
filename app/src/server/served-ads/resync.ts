import "server-only";
import { aggregateAdRows, type MetaAdRow } from "./aggregate";
import { CONVERSION_DEFINITION_VERSION, type MeasurementOrigin } from "./conversion";
import { decryptMetaToken } from "./crypto";
import { getGraphClient, isMockMode, type MetaGraphClient } from "./graph";
import {
  getConnectionById,
  getConnectionByWorkspace,
  insertSnapshot,
  upsertAdAccounts,
  upsertAdMetrics,
  upsertServedAd,
  type MetaConnectionRow,
} from "./repository";
import { formatOfCreative, normalizeInsightActions, textOfCreative } from "./sync";
import type { ResyncPlan, ResyncWindow } from "./resync-plan";

/**
 * Ressincronização de janelas autorizadas (ICE-01B, spec #383 §ICE-01).
 * Escopo explícito (workspace + janelas, conexão opcional), dry-run padrão
 * no CLI. Cada execução cria um NOVO snapshot identificado por conta+janela
 * e aponta as métricas para ele — o histórico nunca é reescrito, e sem o
 * detalhe original não se reconstrói evento algum da soma antiga.
 */

export { AUTHORIZED_RESYNC_WINDOWS, parseResyncArgs } from "./resync-plan";
export type { ResyncArgsParse, ResyncPlan, ResyncWindow } from "./resync-plan";

export type ResyncConnection = Pick<
  MetaConnectionRow,
  "id" | "workspaceId" | "status" | "tokenCiphertext"
>;

export interface ResyncDeps {
  now?: Date;
  client?: MetaGraphClient;
  origin?: MeasurementOrigin;
}

export interface ResyncWindowResult {
  accountId: string;
  adAccountId: string;
  windowDays: ResyncWindow;
  snapshotId: string;
  periodStart: string;
  periodEnd: string;
  anuncios: number;
  insights: number;
  complete: boolean;
}

export async function executeResync(
  plan: ResyncPlan,
  deps: ResyncDeps = {}
): Promise<ResyncWindowResult[]> {
  const now = deps.now ?? new Date();

  const connection = plan.connectionId
    ? await getConnectionById(plan.connectionId)
    : await getConnectionByWorkspace(plan.workspaceId);
  if (!connection) throw new Error("connectionNotFound");
  if (connection.workspaceId !== plan.workspaceId) throw new Error("connectionWorkspaceMismatch");
  if (connection.status !== "ativa") throw new Error("connectionNotActive");
  if (!connection.tokenCiphertext) throw new Error("connectionTokenMissing");

  const client = deps.client ?? getGraphClient(decryptMetaToken(connection.tokenCiphertext));
  const accounts = await client.listAdAccounts();
  const stored = await upsertAdAccounts(
    connection.id,
    accounts.map((account) => ({ adAccountId: account.id, name: account.name, currency: account.currency }))
  );
  const accountRowByRemoteId = new Map(stored.map((row) => [row.adAccountId, row.id]));

  const results: ResyncWindowResult[] = [];
  for (const account of accounts) {
    const accountRowId = accountRowByRemoteId.get(account.id);
    if (!accountRowId) continue;
    const ads = await client.listAds(account.id);
    const adsById = new Map(ads.map((ad) => [ad.id, ad]));
    for (const windowDays of plan.windows) {
      const insights = await client.getInsights(account.id, windowDays);
      const periodStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
      // Novo snapshot identificado; snapshots antigos seguem intactos.
      const snapshot = await insertSnapshot({
        accountId: accountRowId,
        windowDays,
        periodStart,
        periodEnd: now,
        currency: account.currency,
        attribution: { status: "unknown", condition: "meta_attribution_not_requested" },
        completeness: insights.every((insight) => insight.complete) ? "complete" : "partial",
        origin: deps.origin ?? (isMockMode() ? "mock" : "real"),
        collectedAt: now,
      });
      const rows: MetaAdRow[] = [];
      for (const insight of insights) {
        const ad = adsById.get(insight.adId);
        if (!ad || !ad.creative.id) continue;
        const normalized = normalizeInsightActions(insight.actions);
        rows.push({
          ad_account_id: account.id,
          ad_id: insight.adId,
          creative_id: ad.creative.id,
          format: formatOfCreative(ad.creative),
          text: textOfCreative(ad.creative),
          impressions: insight.impressions,
          clicks: insight.clicks,
          spend: insight.spend,
          conversions: insight.actions.reduce((sum, action) => sum + action.value, 0),
          actionCounts: normalized.counts,
          ambiguousActionTypes: normalized.ambiguous,
          complete: insight.complete,
        });
      }
      let anuncios = 0;
      for (const grouped of aggregateAdRows(rows)) {
        anuncios += 1;
        // Identidade para integridade (métricas referenciam o anúncio);
        // mídia de anúncios novos chega no próximo sync completo.
        await upsertServedAd({
          id: grouped.anuncio_id,
          accountId: accountRowId,
          adAccountId: grouped.ad_account_id,
          creativeId: grouped.creative_id,
          format: grouped.format,
          text: grouped.text,
          lastDeliveredAt: grouped.impressions > 0 ? now : null,
        });
        await upsertAdMetrics({
          anuncioId: grouped.anuncio_id,
          windowDays,
          impressions: grouped.impressions,
          clicks: grouped.clicks,
          spend: grouped.spend,
          conversions: grouped.legacyConversions,
          actionCounts: grouped.actionCounts ?? {},
          ambiguousActionTypes: grouped.ambiguousActionTypes,
          definitionVersion: CONVERSION_DEFINITION_VERSION,
          snapshotId: snapshot.id,
        });
      }
      results.push({
        accountId: accountRowId,
        adAccountId: account.id,
        windowDays,
        snapshotId: snapshot.id,
        periodStart: periodStart.toISOString(),
        periodEnd: now.toISOString(),
        anuncios,
        insights: insights.length,
        complete: insights.every((insight) => insight.complete),
      });
    }
  }
  return results;
}
