import { createHash } from "node:crypto";
import sharp from "sharp";
import type { ObjectStorage } from "@/server/storage/object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { abortable, downloadSafeImage } from "./safe-image-download";
import type { ReaderImage, SiteReadResult } from "./readers";
import type { SiteVision } from "./site-vision";

export type SiteReadingContext = { workspaceId: string; accountId: string; handoffId: string; readingId: string; taskIntentId: string };
type StoredAsset = { id: string; key: string; width: number | null; height: number | null };
export type SiteEnrichment = {
  identity(data: SiteReadResult, context: SiteReadingContext): Promise<Pick<SiteReadResult, "branding" | "groupErrors">>;
  images(data: SiteReadResult, context: SiteReadingContext): Promise<Pick<SiteReadResult, "images" | "groupErrors">>;
};
export function createSiteEnrichment(options: {
  storage: ObjectStorage; saveAsset: (data: CreateWorkspaceAssetInput) => Promise<StoredAsset | null | undefined>;
  findAsset: (workspaceId: string, key: string) => Promise<StoredAsset | null>;
  vision: (context: SiteReadingContext) => SiteVision;
  download?: typeof downloadSafeImage; timeoutMs?: number;
}): SiteEnrichment {
  const importImage = async (url: string, kind: string, c: SiteReadingContext, signal: AbortSignal, normalized = false): Promise<ReaderImage> => {
    const hash = createHash("sha256").update(url).digest("hex");
    const key = `workspaces/${c.workspaceId}/handoff/${c.handoffId}/${c.readingId}/${hash}${normalized ? "-vision.jpg" : ""}`;
    const existing = await options.findAsset(c.workspaceId, key);
    if (existing) return { url, key, assetId: existing.id, width: existing.width ?? undefined, height: existing.height ?? undefined };
    const { bytes, contentType } = await (options.download ?? downloadSafeImage)(url, { signal });
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const m = await image.metadata();
    const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", heif: "image/avif" };
    if (!m.format || formats[m.format] !== contentType || (m.format === "heif" && m.compression !== "av1") || !m.width || !m.height) throw new Error("image_bytes_invalid");
    if (!normalized) await image.clone().resize(1, 1).raw().toBuffer(); // Decode before preserving the original, including truncated raster payloads.
    const output = normalized ? await image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }) : { data: bytes, info: { width: m.width, height: m.height } };
    signal.throwIfAborted();
    await abortable(options.storage.put(key, output.data, normalized ? "image/jpeg" : contentType), signal);
    const asset = await options.saveAsset({ workspaceId: c.workspaceId, name: kind, key, type: normalized ? "image/jpeg" : contentType,
      size: output.data.length, width: output.info.width, height: output.info.height, source: "brand_site",
      metadata: { handoffId: c.handoffId, readingId: c.readingId, provisional: true, originUrl: url, kind } });
    const row = asset ?? await options.findAsset(c.workspaceId, key);
    if (!row) throw new Error("site_asset_not_saved");
    return { url, key, assetId: row.id, width: output.info.width, height: output.info.height };
  };
  return {
    async identity(data, context) {
      const signal = AbortSignal.timeout(options.timeoutMs ?? 45_000);
      const logoSignal = AbortSignal.timeout(Math.min(options.timeoutMs ?? 15_000, 15_000));
      const branding = { ...data.branding }; const groupErrors: SiteReadResult["groupErrors"] = {};
      let logo: ReaderImage | undefined;
      // The screenshot has its own deadline; failed/slow logo candidates cannot consume it.
      const screenshotPromise = data.screenshotUrl ? importImage(data.screenshotUrl, "site_screenshot", context, signal, true).catch(() => null) : Promise.resolve(null);
      const candidates = [...new Set([data.branding?.logo?.url, ...(data.logoCandidates ?? [])].filter((v): v is string => !!v))]
        .filter(url => !/\.(?:svg|ico)$/i.test(new URL(url).pathname)).slice(0, 3);
      // Three logo attempts + screenshot + 26 image attempts = at most 30 remote images.
      for (const candidate of candidates) {
        try { logo = await importImage(candidate, "site_logo", context, logoSignal); break; } catch { /* Try the site's next raster candidate. */ }
      }
      branding.logo = logo;
      if ((data.branding?.logo || data.logoCandidates?.length) && !logo) groupErrors.logo = "logo_download_failed";
      try {
        const screenshot = await screenshotPromise;
        if (!screenshot) throw new Error("screenshot_unavailable");
        let logoKey: string | undefined;
        if (logo?.key) {
          // Normalize from our stored bytes, never fetch the logo URL again for vision.
          const own = await options.storage.get(logo.key);
          const normalized = await sharp(own, { limitInputPixels: 40_000_000 }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
          logoKey = `${logo.key}-vision.jpg`;
          await abortable(options.storage.put(logoKey, normalized.data, "image/jpeg"), signal);
          await options.saveAsset({ workspaceId: context.workspaceId, name: "site_vision", key: logoKey, type: "image/jpeg", size: normalized.data.length,
            width: normalized.info.width, height: normalized.info.height, source: "brand_site",
            metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, originUrl: logo.url, kind: "site_vision" } });
        }
        const result = await abortable(options.vision(context)({ screenshotKey: screenshot.key!, ...(logoKey ? { logoKey } : {}), fonts: branding.fonts ?? [], colors: branding.colors ?? [] }), signal);
        branding.colors = result.colors;
        // Fonts remain candidates from the supplier; visual resemblance cannot prove an exact family.
        if (result.fonts.length) branding.fonts = result.fonts;
        if (result.logoConfirmed === false) branding.logo = undefined;
      } catch { branding.colors = []; groupErrors.colors = "site_vision_failed"; }
      return { branding, groupErrors };
    },
    async images(data, context) {
      const signal = AbortSignal.timeout(options.timeoutMs ?? 45_000);
      const candidates = data.images.slice(0, 26); const images: ReaderImage[] = []; let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (next < candidates.length && !signal.aborted) {
          const candidate = candidates[next++]!;
          try { images.push(await importImage(candidate.url, "site_image", context, signal)); } catch { /* One image never aborts its siblings. */ }
        }
      }));
      return { images, ...(candidates.length && !images.length ? { groupErrors: { images: "image_download_failed" } } : {}) };
    },
  };
}
