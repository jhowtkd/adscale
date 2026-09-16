import "server-only";
import { logger } from "@/lib/logger";
import { R2ObjectStorage } from "@/server/storage/r2-object-storage";
import type { MediaStore } from "./sync";

/**
 * Preview do relatório: chave do R2 → URL assinada curta.
 * Vídeo usa o thumbnail (a tag é <img>); sem mídia, null = placeholder.
 */

export interface PreviewKeys {
  imageKey?: string | null;
  thumbKey?: string | null;
}

let defaultStorage: R2ObjectStorage | null = null;

export async function resolvePreviewUrl(
  keys: PreviewKeys,
  storage?: MediaStore
): Promise<string | null> {
  const key = keys.imageKey ?? keys.thumbKey ?? null;
  if (!key) return null;
  try {
    const store = storage ?? (defaultStorage ??= new R2ObjectStorage());
    return await store.signedDownloadUrl(key);
  } catch (error) {
    logger.warn("[served-ads] falha ao assinar preview", { error: String(error) });
    return null;
  }
}
