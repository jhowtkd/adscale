import { processRaster, RasterImageRejected, rethrowRasterRetry } from "./raster-image";
import { logger } from "@/lib/logger";
import { classifyModelFailure } from "../agents/model-failure";
import { createHandoffImageImporter, type HandoffImageOptions } from "./image-import";
import { abortable } from "./safe-image-download";
import type { InstagramReadResult } from "./readers";
import type { SiteReadingContext } from "./site-enrichment";
import type { InstagramVision } from "./site-vision";

export type InstagramEnrichment = {
  images(data: InstagramReadResult, context: SiteReadingContext): Promise<InstagramReadResult>;
  identity(data: InstagramReadResult, context: SiteReadingContext): Promise<Pick<InstagramReadResult, "colors" | "groupErrors">>;
};
export function createInstagramEnrichment(options: HandoffImageOptions & {
  vision: (context: SiteReadingContext, signal: AbortSignal) => InstagramVision; timeoutMs?: number;
}): InstagramEnrichment {
  const importImage = createHandoffImageImporter({ ...options, source: "brand_instagram" });
  return {
    async images(data, context) {
      const controller = new AbortController();
      const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 45_000), controller.signal]);
      const result: InstagramReadResult = { ...data, avatarUrl: null, avatarKey: undefined, avatarAssetId: undefined, posts: [], groupErrors: {} };
      // The avatar is the logo of a brand that has no site: the plate it asks for is measured like a site logo's (a profile photo is a JPEG and needs none).
      let avatarRejected = false;
      const avatar = data.avatarUrl ? importImage(data.avatarUrl, "instagram_avatar", context, signal, false, {}, { measureSurface: true }).catch(error => { try { rethrowRasterRetry(error, signal); } catch (retry) { controller.abort(retry); throw retry; } avatarRejected = error instanceof RasterImageRejected; return null; }) : Promise.resolve(null);
      avatar.catch(() => undefined);
      const candidates = data.posts.slice(0, 12); let next = 0, rejected = 0, broken = 0;
      const posts: Array<InstagramReadResult["posts"][number] | undefined> = [];
      const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (next < candidates.length && !signal.aborted) {
          const index = next++; const post = candidates[index]!;
          try { const image = await importImage(post.imageUrl, "instagram_post", context, signal, false, { caption: post.caption });
            posts[index] = { ...post, key: image.key, assetId: image.assetId, width: image.width, height: image.height };
          } catch (error) { try { rethrowRasterRetry(error, signal); } catch (retry) { controller.abort(retry); throw retry; } if (error instanceof RasterImageRejected) rejected++; else broken++; /* Failed posts never retain a remote-only URL in selectable captures. */ }
        }
      });
      const outcomes = await Promise.allSettled([...workers, avatar]);
      if (controller.signal.aborted) throw controller.signal.reason;
      const failure = outcomes.find(outcome => outcome.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      rethrowRasterRetry(undefined, signal);
      const logo = await avatar;
      if (logo) { result.avatarUrl = logo.url; result.avatarKey = logo.key; result.avatarAssetId = logo.assetId; if (logo.surface) result.avatarSurface = logo.surface; }
      else if (data.avatarUrl) result.groupErrors!.logo = avatarRejected ? "logo_unsupported_format" : "logo_download_failed";
      result.posts = posts.filter((post): post is InstagramReadResult["posts"][number] => !!post);
      if (candidates.length && !result.posts.length) result.groupErrors!.images = rejected > 0 && broken === 0 ? "images_not_found" : "image_download_failed";
      return result;
    },
    async identity(data, context) {
      const signal = AbortSignal.timeout(options.timeoutMs ?? 45_000);
      let visionStarted = false;
      try {
        const keys: string[] = [];
        const images = [...(data.avatarKey ? [{ key: data.avatarKey, url: data.avatarUrl! }] : []), ...data.posts.slice(0, 3).filter(p => p.key).map(p => ({ key: p.key!, url: p.imageUrl }))];
        for (const image of images) {
          signal.throwIfAborted();
          const key = `${image.key}-vision.jpg`;
          if (!(await abortable(options.findAsset(context.workspaceId, key), signal))) {
            const bytes = await abortable(options.storage.get(image.key, signal), signal);
            const normalized = await processRaster(bytes, "normalize", { signal, accountKey: `${context.workspaceId}:${context.accountId}`, background: "#ffffff" });
            signal.throwIfAborted();
            await abortable(options.storage.put(key, normalized.data, "image/jpeg"), signal);
            signal.throwIfAborted();
            await abortable(options.saveAsset({ workspaceId: context.workspaceId, name: "instagram_vision", key, type: "image/jpeg", size: normalized.data.length,
              width: normalized.info.width, height: normalized.info.height, source: "brand_instagram",
              metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, originUrl: image.url, kind: "instagram_vision" } }), signal);
          }
          signal.throwIfAborted(); keys.push(key);
        }
        if (!keys.length) throw new Error("instagram_images_unavailable");
        visionStarted = true;
        const colors = await abortable(options.vision(context, signal)({ imageKeys: keys, signal }), signal);
        return { colors };
      } catch (error) {
        rethrowRasterRetry(error, visionStarted ? undefined : signal);
        logger.warn("[equipe-handoff] palette vision failed", { source: "instagram", readingId: context.readingId, ...classifyModelFailure(error) });
        return { colors: [], groupErrors: { colors: "instagram_vision_failed" } };
      }
    },
  };
}
