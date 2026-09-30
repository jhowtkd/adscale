import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { abortable, downloadSafeImage } from "./safe-image-download";
import type { ReaderImage } from "./readers";
import type { SiteReadingContext } from "./site-enrichment";

type StoredAsset = { id: string; key: string; width: number | null; height: number | null };
export type HandoffImageOptions = {
  storage: ObjectStorage; saveAsset: (data: CreateWorkspaceAssetInput) => Promise<StoredAsset | null | undefined>;
  findAsset: (workspaceId: string, key: string) => Promise<StoredAsset | null>;
  download?: typeof downloadSafeImage;
};
export function createHandoffImageImporter(options: HandoffImageOptions & { source: "brand_site" | "brand_instagram" }) {
  return async (url: string, kind: string, c: SiteReadingContext, signal: AbortSignal, normalized = false, metadata: Record<string, unknown> = {}): Promise<ReaderImage> => {
    signal.throwIfAborted();
    const hash = createHash("sha256").update(url).digest("hex");
    const key = `workspaces/${c.workspaceId}/handoff/${c.handoffId}/${c.readingId}/${options.source === "brand_instagram" ? `${c.taskIntentId}/${kind}/` : ""}${hash}${normalized ? "-vision.jpg" : ""}`;
    const existing = await abortable(options.findAsset(c.workspaceId, key), signal);
    if (existing) return { url, key, assetId: existing.id, width: existing.width ?? undefined, height: existing.height ?? undefined };
    signal.throwIfAborted();
    const { bytes, contentType } = await abortable((options.download ?? downloadSafeImage)(url, { signal }), signal);
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const m = await abortable(image.metadata(), signal);
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", heif: "image/avif" };
    if (!m.format || formats[m.format] !== contentType || (m.format === "heif" && m.compression !== "av1") || !m.width || !m.height) throw new Error("image_bytes_invalid");
    if (!normalized) await abortable(image.clone().resize(1, 1).raw().toBuffer(), signal); // Decode before preserving the original, including truncated raster payloads.
    const output = normalized ? await abortable(image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }), signal) : { data: bytes, info: { width: m.width, height: m.height } };
    signal.throwIfAborted();
    await abortable(options.storage.put(key, output.data, normalized ? "image/jpeg" : contentType), signal);
    signal.throwIfAborted();
    const asset = await abortable(options.saveAsset({ workspaceId: c.workspaceId, name: kind, key, type: normalized ? "image/jpeg" : contentType,
      size: output.data.length, width: output.info.width, height: output.info.height, source: options.source,
      metadata: { ...metadata, handoffId: c.handoffId, readingId: c.readingId, provisional: true, originUrl: url, kind } }), signal);
    signal.throwIfAborted();
    const row = asset ?? await abortable(options.findAsset(c.workspaceId, key), signal);
    if (!row) throw new Error("handoff_asset_not_saved");
    return { url, key, assetId: row.id, width: output.info.width, height: output.info.height };
  };
}
