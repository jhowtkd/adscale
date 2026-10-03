import { createHash } from "node:crypto";
import { admitRaster, processRaster, rethrowRasterRetry } from "./raster-image";
import { logger } from "@/lib/logger";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { parseLogoSurface, type LogoSurface } from "../domain/logo-surface";
import { abortable, downloadSafeImage } from "./safe-image-download";
import { LogoSurfaceSkipped, measureLogoSurface } from "./logo-surface";
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

type StoredAsset = { id: string; key: string; width: number | null; height: number | null; metadata?: unknown };
export type HandoffImageOptions = {
  storage: ObjectStorage; saveAsset: (data: CreateWorkspaceAssetInput) => Promise<StoredAsset | null | undefined>;
  findAsset: (workspaceId: string, key: string) => Promise<StoredAsset | null>;
  download?: typeof downloadSafeImage;
  /**
   * Adds keys to the `metadata` of an asset (merged, never replaced). A logo whose asset already exists, because the same address is also an image of the page, keeps its plate
   * here (ticket 16): the key of an asset comes from the address alone, so the asset is shared and only the logo's import measures. Without it such a logo is measured, but the
   * answer is not kept with the asset.
   */
  updateAssetMetadata?: (assetId: string, workspaceId: string, metadata: Record<string, unknown>) => Promise<unknown>;
};
/**
 * What an import may ask for. `acceptSvg` is for a logo only: an SVG is sanitized and drawn as a PNG (`svg-logo.ts`), and the PNG is what is stored, so the SVG never
 * reaches storage or a browser. Without it an SVG is refused like any other type this reader does not take. `minShortSide` does not apply to a drawn SVG (a vector has
 * no pixel size of its own: it is drawn at 1024 px). `measureSurface` is for a logo too (ticket 16): the plate it asks for is judged from its pixels once, before it is stored,
 * and kept in the asset's `metadata.surface` (a logo that needs no plate of ours, one without transparency, gets none). The asset and the item that is returned always agree:
 * whichever import stored the asset first (a logo and an image of the page can be the same address), the logo's import measures what is stored when the asset has no plate,
 * and keeps the answer with it.
 */
export type ImageLimits = { minShortSide?: number; acceptSvg?: boolean; measureSurface?: boolean; /** Limits only remote downloading; decoding and persistence keep the step signal. */ downloadSignal?: AbortSignal };
export function createHandoffImageImporter(options: HandoffImageOptions & { source: "brand_site" | "brand_instagram" }) {
  return async (url: string, kind: string, c: SiteReadingContext, signal: AbortSignal, normalized = false, metadata: Record<string, unknown> = {}, limits: ImageLimits = {}): Promise<ReaderImage> => {
    signal.throwIfAborted();
    const tooSmall = (width?: number | null, height?: number | null) => limits.minShortSide !== undefined && !!width && !!height && Math.min(width, height) < limits.minShortSide;
    const hash = createHash("sha256").update(url).digest("hex");
    const key = `workspaces/${c.workspaceId}/handoff/${c.handoffId}/${c.readingId}/${options.source === "brand_instagram" ? `${c.taskIntentId}/${kind}/` : ""}${hash}${normalized ? "-vision.jpg" : ""}`;
    // The plate a logo asks for (ticket 16), judged from bytes that are stored or about to be (the PNG, for an SVG). It is never a failure: a logo that is too big to decode here, one that waits behind
    // too many, or one that cannot be decoded is stored all the same, without the datum, as it always was (an `info` line for the first two, a `warn` for the last: no content, only the reason).
    // Raster capacity/infrastructure failures escape to retry the step; they never mean a missing logo.
    const measure = async (bytes: () => Promise<Uint8Array> | Uint8Array): Promise<LogoSurface | undefined> => {
      try { return (await abortable(measureLogoSurface(await bytes(), { signal, accountKey: `${c.workspaceId}:${c.accountId}` }), signal)) ?? undefined; }
      catch (error) {
        rethrowRasterRetry(error, signal);
        if (error instanceof LogoSurfaceSkipped) logger.info("[equipe-handoff] logo surface skipped", { readingId: c.readingId, reason: error.code });
        else logger.warn("[equipe-handoff] logo surface not measured", { readingId: c.readingId, reason: error instanceof Error ? error.message : "unknown" });
        return undefined;
      }
    };
    // Keeps the plate with the asset, so the item (what the handoff's mesa and the vision copy read) and the asset (what the Library's mesa reads) never disagree. `metadata` is merged by the
    // repository, never replaced. When it cannot be written the logo has no plate at all, in both places, rather than one that only one of them knows.
    const keep = async (asset: StoredAsset, surface: LogoSurface | undefined): Promise<LogoSurface | undefined> => {
      if (!surface || asset.metadata === undefined || !options.updateAssetMetadata) return surface; // `undefined` metadata: a store that does not say what the asset holds
      const held = typeof asset.metadata === "object" && asset.metadata !== null ? parseLogoSurface((asset.metadata as Record<string, unknown>).surface) : undefined;
      if (held === surface) return surface;
      try { await abortable(options.updateAssetMetadata(asset.id, c.workspaceId, { surface }), signal); return surface; }
      catch (error) {
        signal.throwIfAborted();
        logger.warn("[equipe-handoff] logo surface not kept with its asset", { readingId: c.readingId, reason: error instanceof Error ? error.message : "unknown" });
        return undefined;
      }
    };
    const existing = await abortable(options.findAsset(c.workspaceId, key), signal);
    if (existing) {
      // An asset drawn from an SVG is told by what the first import stored (`convertedFrom`). It is a logo's and nobody else's (an image import refuses an SVG, and so refuses its drawing),
      // and it has no pixel size of its own: a wide wordmark is not "too small" the second time because it was not the first.
      const drawn = typeof existing.metadata === "object" && existing.metadata !== null && (existing.metadata as Record<string, unknown>).convertedFrom === "svg";
      if (drawn && !limits.acceptSvg) throw new Error("image_type_unsupported");
      if (!drawn && tooSmall(existing.width, existing.height)) throw new Error(IMAGE_TOO_SMALL);
      let surface = limits.measureSurface ? parseLogoSurface((existing.metadata as Record<string, unknown> | null | undefined)?.surface) : undefined;
      // Stored as an image of the page first (the key comes from the address alone), or by a reading from before the measure: the logo measures what is stored, and keeps the answer with the asset.
      if (limits.measureSurface && !surface) surface = await keep(existing, await measure(() => options.storage.get(key, signal)));
      return { url, key, assetId: existing.id, width: existing.width ?? undefined, height: existing.height ?? undefined, ...(surface ? { surface } : {}) };
    }
    signal.throwIfAborted();
    const downloadSignal = limits.downloadSignal ? AbortSignal.any([signal, limits.downloadSignal]) : signal;
    downloadSignal.throwIfAborted();
    const downloaded = await abortable((options.download ?? downloadSafeImage)(url, { signal: downloadSignal, ...(limits.acceptSvg ? { allowSvg: true } : {}) }), downloadSignal);
    let bytes: Buffer = downloaded.bytes;
    let contentType = downloaded.contentType;
    const vector = contentType === "image/svg+xml";
    if (vector) {
      if (!limits.acceptSvg) throw new Error("image_type_unsupported");
      ({ png: bytes } = await rasterizeSvgLogo(bytes, { signal }));
      contentType = "image/png";
    }
    const header = admitRaster(bytes);
    if (!vector && typeof header !== "string" && tooSmall(header.width, header.height)) throw new Error(IMAGE_TOO_SMALL);
    const decoded = await processRaster(bytes, normalized ? "normalize" : "validate", { signal, contentType, accountKey: `${c.workspaceId}:${c.accountId}` });
    if (!vector && tooSmall(decoded.info.width, decoded.info.height)) throw new Error(IMAGE_TOO_SMALL);
    const output = normalized ? decoded : { data: bytes, info: decoded.info };
    let surface = limits.measureSurface && !normalized ? await measure(() => bytes) : undefined;
    signal.throwIfAborted();
    await abortable(options.storage.put(key, output.data, normalized ? "image/jpeg" : contentType), signal);
    signal.throwIfAborted();
    const asset = await abortable(options.saveAsset({ workspaceId: c.workspaceId, name: kind, key, type: normalized ? "image/jpeg" : contentType,
      size: output.data.length, width: output.info.width, height: output.info.height, source: options.source,
      metadata: { ...metadata, handoffId: c.handoffId, readingId: c.readingId, provisional: true, originUrl: url, kind, ...(vector ? { convertedFrom: "svg" } : {}), ...(surface ? { surface } : {}) } }), signal);
    signal.throwIfAborted();
    const row = asset ?? await abortable(options.findAsset(c.workspaceId, key), signal);
    if (!row) throw new Error("handoff_asset_not_saved");
    // Another import may have stored the asset first (the same address is also an image of the page) and so without the plate: it is kept with that asset.
    surface = await keep(row, surface);
    return { url, key, assetId: row.id, width: output.info.width, height: output.info.height, ...(surface ? { surface } : {}) };
  };
}
