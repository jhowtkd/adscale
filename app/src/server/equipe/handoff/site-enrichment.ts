import { processRaster, RasterImageRejected, rethrowRasterRetry } from "./raster-image";
import { logger } from "@/lib/logger";
import { classifyModelFailure } from "../agents/model-failure";
import { LOGO_VISION_BACKDROP } from "../domain/logo-surface";
import { abortable } from "./safe-image-download";
import { SvgLogoError } from "./svg-logo";
import type { ReaderImage, SiteReadResult } from "./readers";
import type { SiteVision } from "./site-vision";
import { IMAGE_TOO_SMALL, MIN_LOGO_SHORT_SIDE_PX, MIN_SITE_IMAGE_SHORT_SIDE_PX, createHandoffImageImporter, type HandoffImageOptions } from "./image-import";

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
      const controller = new AbortController();
      const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 45_000), controller.signal]);
      const logoSignal = signal;
      const branding = { ...data.branding }; const groupErrors: SiteReadResult["groupErrors"] = {};
      let logo: ReaderImage | undefined;
      // Start the screenshot alongside logo candidates; both may wait within the step deadline.
      const screenshotPromise = data.screenshotUrl ? importImage(data.screenshotUrl, "site_screenshot", context, signal, true).catch(error => { try { rethrowRasterRetry(error, signal); } catch (retry) { controller.abort(retry); throw retry; } return null; }) : Promise.resolve(null);
      screenshotPromise.catch(() => undefined);
      const found = [...new Set([data.branding?.logo?.url, ...(data.logoCandidates ?? [])].filter((v): v is string => !!v))];
      // An icon file (.ico) is never taken as the logo here, three candidates are tried at most. An SVG is: it is drawn as a PNG (`importImage` with `acceptSvg`), by its
      // address or by what the server sends (its type, or its first bytes when it says nothing).
      const candidates = found.filter(url => !/\.ico$/i.test(new URL(url).pathname)).slice(0, 3);
      // Three logo attempts + screenshot + 26 image attempts = at most 30 remote images.
      // An icon is never the logo: a raster candidate that measures under MIN_LOGO_SHORT_SIDE_PX is dropped before it is stored, and the next one is tried.
      let tooSmall = 0, broken = 0, vector = 0;
      for (const candidate of candidates) {
        try { logo = await importImage(candidate, "site_logo", context, logoSignal, false, {}, { minShortSide: MIN_LOGO_SHORT_SIDE_PX, acceptSvg: true, measureSurface: true }); break; }
        catch (error) {
          try { rethrowRasterRetry(error, signal); } catch (retry) { controller.abort(retry); await screenshotPromise.catch(() => undefined); throw retry; }
          // An SVG that could not be turned into a logo (not well formed, too big or too complex, nothing to draw) is a logo that is not found, like an icon file: the person is
          // asked for the file. Trying again would not read it any better, so it is not a failed reading either.
          if (error instanceof Error && error.message === IMAGE_TOO_SMALL) tooSmall++; else if (error instanceof SvgLogoError || error instanceof RasterImageRejected) vector++; else broken++;
          if (error instanceof SvgLogoError) logger.info("[equipe-handoff] svg logo not used", { readingId: context.readingId, reason: error.code });
        }
      }
      branding.logo = logo;
      // Nothing decent: only icon files (.ico), SVGs that could not be drawn, or only small icons were found -> no logo found, and the card asks for
      // the file; a candidate that could not be fetched -> the reading failed.
      if ((data.branding?.logo || data.logoCandidates?.length) && !logo) {
        groupErrors.logo = candidates.length === 0 && found.length > 0 ? "logo_unsupported_format"
          : broken > 0 ? "logo_download_failed" : vector > 0 ? "logo_unsupported_format" : tooSmall > 0 ? "logo_too_small" : "logo_download_failed";
      }
      let visionStarted = false;
      try {
        const screenshot = await screenshotPromise;
        if (!screenshot) throw new Error("screenshot_unavailable");
        let logoKey: string | undefined;
        // The color a transparent logo is flattened on: white, as it always was, unless the logo was measured to have light ink that white would hide (ticket 16): then the
        // graphite of the dark plate, and the model is told that this backdrop is ours (`logoBackdrop`), so it never counts as a color of the brand.
        const logoBackdrop = logo?.surface === "dark" ? LOGO_VISION_BACKDROP.dark : undefined;
        if (logo?.key) {
          // Normalize from our stored bytes, never fetch the logo URL again for vision.
          signal.throwIfAborted();
          const own = await abortable(options.storage.get(logo.key, signal), signal);
          const normalized = await processRaster(own, "normalize", { signal, accountKey: `${context.workspaceId}:${context.accountId}`, background: logoBackdrop ?? LOGO_VISION_BACKDROP.light });
          logoKey = `${logo.key}-vision.jpg`;
          signal.throwIfAborted();
          await abortable(options.storage.put(logoKey, normalized.data, "image/jpeg"), signal);
          signal.throwIfAborted();
          await abortable(options.saveAsset({ workspaceId: context.workspaceId, name: "site_vision", key: logoKey, type: "image/jpeg", size: normalized.data.length,
            width: normalized.info.width, height: normalized.info.height, source: "brand_site",
            metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, originUrl: logo.url, kind: "site_vision" } }), signal);
        }
        signal.throwIfAborted();
        visionStarted = true;
        const result = await abortable(options.vision(context, signal)({ screenshotKey: screenshot.key!, ...(logoKey ? { logoKey } : {}), ...(logoKey && logoBackdrop ? { logoBackdrop } : {}), fonts: branding.fonts ?? [], colors: branding.colors ?? [], signal }), signal);
        branding.colors = result.colors;
        // Fonts remain candidates from the supplier; visual resemblance cannot prove an exact family.
        if (result.fonts.length) branding.fonts = result.fonts;
        if (result.logoConfirmed === false) branding.logo = undefined;
      } catch (error) {
        rethrowRasterRetry(error, visionStarted ? undefined : signal);
        branding.colors = []; groupErrors.colors = "site_vision_failed";
        // The cause was swallowed here for a whole test cycle (every call was refused and nothing said so): log it, without content.
        logger.warn("[equipe-handoff] palette vision failed", { source: "site", readingId: context.readingId, ...classifyModelFailure(error) });
      }
      return { branding, groupErrors };
    },
    async images(data, context) {
      const controller = new AbortController();
      const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 45_000), controller.signal]);
      const candidates = data.images.slice(0, 26); const images: ReaderImage[] = []; let next = 0, broken = 0, tooSmall = 0, rejected = 0;
      const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (next < candidates.length && !signal.aborted) {
          const candidate = candidates[next++]!;
          // Under MIN_SITE_IMAGE_SHORT_SIDE_PX (thumbnails, icons, partners' logos) is not offered, and never stored.
          try { images.push(await importImage(candidate.url, "site_image", context, signal, false, {}, { minShortSide: MIN_SITE_IMAGE_SHORT_SIDE_PX })); }
          catch (error) { try { rethrowRasterRetry(error, signal); } catch (retry) { controller.abort(retry); throw retry; } if (error instanceof Error && error.message === IMAGE_TOO_SMALL) tooSmall++; else if (error instanceof RasterImageRejected) rejected++; else broken++; /* One image never aborts its siblings. */ }
        }
      }));
      if (controller.signal.aborted) throw controller.signal.reason;
      const failure = outcomes.find(outcome => outcome.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      rethrowRasterRetry(undefined, signal);
      // Nothing usable because everything found was small: the images are not found (the person uploads); only a fetch that failed is a failed reading.
      return { images, ...(candidates.length && !images.length ? { groupErrors: { images: rejected > 0 && broken === 0 ? "images_not_found" : tooSmall > 0 && broken === 0 ? "images_too_small" : "image_download_failed" } } : {}) };
    },
  };
}
