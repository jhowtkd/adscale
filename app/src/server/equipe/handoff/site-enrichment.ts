import sharp from "sharp";
import { abortable } from "./safe-image-download";
import type { ReaderImage, SiteReadResult } from "./readers";
import type { SiteVision } from "./site-vision";
import { createHandoffImageImporter, type HandoffImageOptions } from "./image-import";

export type SiteReadingContext = { workspaceId: string; accountId: string; handoffId: string; readingId: string; taskIntentId: string };
export type SiteEnrichment = {
  identity(data: SiteReadResult, context: SiteReadingContext): Promise<Pick<SiteReadResult, "branding" | "groupErrors">>;
  images(data: SiteReadResult, context: SiteReadingContext): Promise<Pick<SiteReadResult, "images" | "groupErrors">>;
};
export function createSiteEnrichment(options: HandoffImageOptions & {
  vision: (context: SiteReadingContext, signal: AbortSignal) => SiteVision;
  timeoutMs?: number;
}): SiteEnrichment {
  const importImage = createHandoffImageImporter({ ...options, source: "brand_site" });
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
          signal.throwIfAborted();
          const own = await abortable(options.storage.get(logo.key, signal), signal);
          const normalized = await abortable(sharp(own, { limitInputPixels: 40_000_000 }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }), signal);
          logoKey = `${logo.key}-vision.jpg`;
          signal.throwIfAborted();
          await abortable(options.storage.put(logoKey, normalized.data, "image/jpeg"), signal);
          signal.throwIfAborted();
          await abortable(options.saveAsset({ workspaceId: context.workspaceId, name: "site_vision", key: logoKey, type: "image/jpeg", size: normalized.data.length,
            width: normalized.info.width, height: normalized.info.height, source: "brand_site",
            metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, originUrl: logo.url, kind: "site_vision" } }), signal);
        }
        signal.throwIfAborted();
        const result = await abortable(options.vision(context, signal)({ screenshotKey: screenshot.key!, ...(logoKey ? { logoKey } : {}), fonts: branding.fonts ?? [], colors: branding.colors ?? [], signal }), signal);
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
