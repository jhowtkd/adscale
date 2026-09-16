import "server-only";
import { logger } from "@/lib/logger";
import { R2ObjectStorage } from "@/server/storage/r2-object-storage";
import { aggregateAdRows, buildAnuncioId, type MetaAdRow, type ServedAdFormat } from "./aggregate";
import { decryptMetaToken } from "./crypto";
import {
  MetaGraphError,
  getGraphClient,
  type MetaAd,
  type MetaCreative,
  type MetaGraphClient,
} from "./graph";
import {
  deleteConnection,
  deleteServedAd,
  getConnectionById,
  listActiveConnections,
  listExpiredServedAds,
  listMediaKeysForConnection,
  updateConnectionSync,
  updateServedAdMedia,
  upsertAdAccounts,
  upsertAdMetrics,
  upsertServedAd,
} from "./repository";

/**
 * Ingestão Anúncios veiculados (#347): Graph → rollup por creative_id →
 * served_ads + métricas por janela → mídia no R2. Sem crédito, fora do
 * Generation Settlement. Sem Meta App (#348), o client mock alimenta tudo.
 */

export const SYNC_WINDOWS = [7, 30, 90] as const;
export const MEDIA_RETENTION_DAYS = 90;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export interface MediaStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  signedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export type MediaDownloader = (url: string) => Promise<{ data: Buffer; contentType: string }>;

let defaultStorage: R2ObjectStorage | null = null;
function getDefaultStorage(): R2ObjectStorage {
  if (!defaultStorage) defaultStorage = new R2ObjectStorage();
  return defaultStorage;
}

export const defaultDownloadMedia: MediaDownloader = async (url) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`mídia HTTP ${res.status}`);
  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    throw new Error(`mídia content-type recusado: ${contentType}`);
  }
  const announced = Number(res.headers.get("content-length") ?? 0);
  if (announced > MAX_MEDIA_BYTES) throw new Error("mídia acima de 25MB");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error("mídia acima de 25MB");
  return { data: buffer, contentType };
};

export function mediaKey(workspaceId: string, adAccountId: string, creativeId: string, kind: string): string {
  return `served-ads/${workspaceId}/${adAccountId}/${creativeId}/${kind}`;
}

function formatOf(creative: MetaCreative): ServedAdFormat {
  if (creative.isCarousel) return "carrossel";
  if (creative.videoId) return "video";
  return "imagem";
}

function textOf(creative: MetaCreative): string | null {
  return creative.body ?? creative.title ?? null;
}

export interface SyncDeps {
  client?: MetaGraphClient;
  storage?: MediaStore;
  download?: MediaDownloader;
  now?: Date;
}

export interface SyncResult {
  connectionId: string;
  accounts: number;
  anuncios: number;
  purged: number;
}

async function deleteKeysBestEffort(
  storage: MediaStore,
  keys: Array<string | null>,
  context: string
): Promise<void> {
  const settled = await Promise.allSettled(
    keys.filter((key): key is string => !!key).map((key) => storage.delete(key))
  );
  for (const item of settled) {
    if (item.status === "rejected") {
      logger.warn(`[served-ads] falha ao apagar mídia (${context})`, { error: String(item.reason) });
    }
  }
}

export async function syncConnection(connectionId: string, deps: SyncDeps = {}): Promise<SyncResult> {
  const now = deps.now ?? new Date();
  const storage = deps.storage ?? getDefaultStorage();
  const download = deps.download ?? defaultDownloadMedia;

  const connection = await getConnectionById(connectionId);
  if (!connection) throw new Error("connectionNotFound");
  if (connection.status !== "ativa") throw new Error("connectionNotActive");
  if (!connection.tokenCiphertext) throw new Error("connectionTokenMissing");

  const client = deps.client ?? getGraphClient(decryptMetaToken(connection.tokenCiphertext));

  try {
    const accounts = await client.listAdAccounts();
    const stored = await upsertAdAccounts(
      connectionId,
      accounts.map((account) => ({ adAccountId: account.id, name: account.name, currency: account.currency }))
    );
    const accountRowByRemoteId = new Map(stored.map((row) => [row.adAccountId, row.id]));

    let anuncios = 0;
    for (const account of accounts) {
      const accountRowId = accountRowByRemoteId.get(account.id);
      if (!accountRowId) continue;
      const ads = await client.listAds(account.id);
      const adsById = new Map(ads.map((ad) => [ad.id, ad]));

      for (const windowDays of SYNC_WINDOWS) {
        const insights = await client.getInsights(account.id, windowDays);
        const rows: MetaAdRow[] = [];
        for (const insight of insights) {
          const ad = adsById.get(insight.adId);
          if (!ad || !ad.creative.id) continue;
          rows.push({
            ad_account_id: account.id,
            ad_id: insight.adId,
            creative_id: ad.creative.id,
            format: formatOf(ad.creative),
            text: textOf(ad.creative),
            impressions: insight.impressions,
            clicks: insight.clicks,
            spend: insight.spend,
            conversions: insight.conversions,
          });
        }
        for (const grouped of aggregateAdRows(rows)) {
          if (windowDays === 30) {
            anuncios += 1;
            await upsertServedAd({
              id: grouped.anuncio_id,
              accountId: accountRowId,
              adAccountId: grouped.ad_account_id,
              creativeId: grouped.creative_id,
              format: grouped.format,
              text: grouped.text,
              lastDeliveredAt: grouped.impressions > 0 ? now : null,
            });
            await copyCreativeMedia(storage, download, connection.workspaceId, client, account.id, ads, grouped.creative_id);
          }
          await upsertAdMetrics({
            anuncioId: grouped.anuncio_id,
            windowDays,
            impressions: grouped.impressions,
            clicks: grouped.clicks,
            spend: grouped.spend,
            conversions: grouped.conversions,
          });
        }
      }
    }

    const purged = await purgeExpiredServedAds({ storage, now });
    await updateConnectionSync(connectionId, { lastSyncAt: now, lastSyncError: null });
    return { connectionId, accounts: accounts.length, anuncios, purged };
  } catch (error) {
    const authFailure = error instanceof MetaGraphError && (error.status === 400 || error.status === 401);
    await updateConnectionSync(connectionId, {
      lastSyncError: String(error instanceof Error ? error.message : error).slice(0, 500),
      ...(authFailure ? { status: "expirada" as const } : {}),
    });
    throw error;
  }
}

async function copyCreativeMedia(
  storage: MediaStore,
  download: MediaDownloader,
  workspaceId: string,
  client: MetaGraphClient,
  accountId: string,
  ads: MetaAd[],
  creativeId: string
): Promise<void> {
  const creative = ads.find((ad) => ad.creative.id === creativeId)?.creative;
  if (!creative) return;
  let media;
  try {
    media = await client.getCreativeMedia(accountId, creative);
  } catch (error) {
    logger.warn("[served-ads] falha ao resolver mídia", { creativeId, error: String(error) });
    return;
  }
  const anuncioId = buildAnuncioId(accountId, creativeId);
  const saved: { imageKey?: string | null; videoKey?: string | null; thumbKey?: string | null } = {};
  const jobs: Array<{ url: string | null; kind: string; assign: (key: string) => void }> = [
    { url: media.imageUrl, kind: "image", assign: (key) => { saved.imageKey = key; } },
    { url: media.videoUrl, kind: "video", assign: (key) => { saved.videoKey = key; } },
    { url: media.thumbUrl, kind: "thumb", assign: (key) => { saved.thumbKey = key; } },
  ];
  for (const job of jobs) {
    if (!job.url) continue;
    try {
      const file = await download(job.url);
      const key = mediaKey(workspaceId, accountId, creativeId, job.kind);
      await storage.put(key, file.data, file.contentType);
      job.assign(key);
    } catch (error) {
      logger.warn("[served-ads] falha ao copiar mídia", { anuncioId, kind: job.kind, error: String(error) });
    }
  }
  if (saved.imageKey || saved.videoKey || saved.thumbKey) {
    await updateServedAdMedia(anuncioId, saved);
  }
}

/** TTL 90 dias após a última entrega: apaga mídia do R2 + linhas (métricas por cascade). */
export async function purgeExpiredServedAds(deps: { storage?: MediaStore; now?: Date } = {}): Promise<number> {
  const now = deps.now ?? new Date();
  const storage = deps.storage ?? getDefaultStorage();
  const cutoff = new Date(now.getTime() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await listExpiredServedAds(cutoff);
  for (const row of expired) {
    await deleteKeysBestEffort(storage, [row.imageKey, row.videoKey, row.thumbKey], `ttl:${row.anuncioId}`);
    await deleteServedAd(row.anuncioId);
  }
  return expired.length;
}

/** Desconectar: apaga token + mídia + métricas imediatamente, sem parcelar. */
export async function disconnectConnection(
  connectionId: string,
  deps: { storage?: MediaStore } = {}
): Promise<void> {
  const storage = deps.storage ?? getDefaultStorage();
  const rows = await listMediaKeysForConnection(connectionId);
  for (const row of rows) {
    await deleteKeysBestEffort(storage, [row.imageKey, row.videoKey, row.thumbKey], `disconnect:${row.anuncioId}`);
  }
  await deleteConnection(connectionId);
}

/** Job 6h: sync de todas as ativas + TTL. Uma falha não cancela as demais. */
export async function syncAllConnections(deps: SyncDeps = {}): Promise<{ synced: number; failed: number; purged: number }> {
  const connections = await listActiveConnections();
  let synced = 0;
  let failed = 0;
  for (const connection of connections) {
    try {
      await syncConnection(connection.id, deps);
      synced += 1;
    } catch (error) {
      failed += 1;
      logger.error("[served-ads] sync falhou", { connectionId: connection.id, error: String(error) });
    }
  }
  const purged = await purgeExpiredServedAds({ storage: deps.storage, now: deps.now });
  return { synced, failed, purged };
}
