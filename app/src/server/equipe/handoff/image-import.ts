import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { abortable, downloadSafeImage } from "./safe-image-download";
import { rasterizeSvgLogo } from "./svg-logo";
import type { ReaderImage } from "./readers";
import type { SiteReadingContext } from "./site-enrichment";

/**
 * What a site image must measure to be offered (ticket 13, D-8). The real test found the "logo" of two sites to be a 32×32 favicon and 22 of the 26 images of a
 * third below 500 px (thumbnails, icons): nothing a brand can post. Measured on the SHORTER side, after the file is decoded and BEFORE it is stored.
 */
export const MIN_LOGO_SHORT_SIDE_PX = 100;
export const MIN_SITE_IMAGE_SHORT_SIDE_PX = 500;
/** Thrown (and never stored) when an image is smaller than the limit it was asked for. */
export const IMAGE_TOO_SMALL = "image_too_small";

type StoredAsset = { id: string; key: string; width: number | null; height: number | null };
export type HandoffImageOptions = {
  storage: ObjectStorage; saveAsset: (data: CreateWorkspaceAssetInput) => Promise<StoredAsset | null | undefined>;
  findAsset: (workspaceId: string, key: string) => Promise<StoredAsset | null>;
  download?: typeof downloadSafeImage;
};
/**
 * What an import may ask for. `acceptSvg` is for a logo only: an SVG is sanitized and drawn as a PNG (`svg-logo.ts`), and the PNG is what is stored, so the SVG never
 * reaches storage or a browser. Without it an SVG is refused like any other type this reader does not take. `minShortSide` does not apply to a drawn SVG (a vector has
 * no pixel size of its own: it is drawn at 1024 px).
 */
export type ImageLimits = { minShortSide?: number; acceptSvg?: boolean };
export function createHandoffImageImporter(options: HandoffImageOptions & { source: "brand_site" | "brand_instagram" }) {
  return async (url: string, kind: string, c: SiteReadingContext, signal: AbortSignal, normalized = false, metadata: Record<string, unknown> = {}, limits: ImageLimits = {}): Promise<ReaderImage> => {
    signal.throwIfAborted();
    const tooSmall = (width?: number | null, height?: number | null) => limits.minShortSide !== undefined && !!width && !!height && Math.min(width, height) < limits.minShortSide;
    const hash = createHash("sha256").update(url).digest("hex");
    const key = `workspaces/${c.workspaceId}/handoff/${c.handoffId}/${c.readingId}/${options.source === "brand_instagram" ? `${c.taskIntentId}/${kind}/` : ""}${hash}${normalized ? "-vision.jpg" : ""}`;
    const existing = await abortable(options.findAsset(c.workspaceId, key), signal);
    if (existing) {
      if (tooSmall(existing.width, existing.height)) throw new Error(IMAGE_TOO_SMALL);
      return { url, key, assetId: existing.id, width: existing.width ?? undefined, height: existing.height ?? undefined };
    }
    signal.throwIfAborted();
    const downloaded = await abortable((options.download ?? downloadSafeImage)(url, { signal, ...(limits.acceptSvg ? { allowSvg: true } : {}) }), signal);
    let bytes: Buffer = downloaded.bytes;
    let contentType = downloaded.contentType;
    const vector = contentType === "image/svg+xml";
    if (vector) {
      if (!limits.acceptSvg) throw new Error("image_type_unsupported");
      ({ png: bytes } = await rasterizeSvgLogo(bytes, { signal }));
      contentType = "image/png";
    }
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const m = await abortable(image.metadata(), signal);
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", heif: "image/avif" };
    if (!m.format || formats[m.format] !== contentType || (m.format === "heif" && m.compression !== "av1") || !m.width || !m.height) throw new Error("image_bytes_invalid");
    if (!vector && tooSmall(m.width, m.height)) throw new Error(IMAGE_TOO_SMALL);
    if (!normalized) await abortable(image.clone().resize(1, 1).raw().toBuffer(), signal); // Decode before preserving the original, including truncated raster payloads.
    const output = normalized ? await abortable(image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }), signal) : { data: bytes, info: { width: m.width, height: m.height } };
    signal.throwIfAborted();
    await abortable(options.storage.put(key, output.data, normalized ? "image/jpeg" : contentType), signal);
    signal.throwIfAborted();
    const asset = await abortable(options.saveAsset({ workspaceId: c.workspaceId, name: kind, key, type: normalized ? "image/jpeg" : contentType,
      size: output.data.length, width: output.info.width, height: output.info.height, source: options.source,
      metadata: { ...metadata, handoffId: c.handoffId, readingId: c.readingId, provisional: true, originUrl: url, kind, ...(vector ? { convertedFrom: "svg" } : {}) } }), signal);
    signal.throwIfAborted();
    const row = asset ?? await abortable(options.findAsset(c.workspaceId, key), signal);
    if (!row) throw new Error("handoff_asset_not_saved");
    return { url, key, assetId: row.id, width: output.info.width, height: output.info.height };
  };
}
