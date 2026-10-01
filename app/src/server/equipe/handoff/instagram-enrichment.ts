import sharp from "sharp";
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
      const signal = AbortSignal.timeout(options.timeoutMs ?? 45_000);
      const result: InstagramReadResult = { ...data, avatarUrl: null, avatarKey: undefined, avatarAssetId: undefined, posts: [], groupErrors: {} };
      const avatar = data.avatarUrl ? importImage(data.avatarUrl, "instagram_avatar", context, signal).catch(() => null) : Promise.resolve(null);
      const candidates = data.posts.slice(0, 12); let next = 0;
      const posts: Array<InstagramReadResult["posts"][number] | undefined> = [];
      await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (next < candidates.length && !signal.aborted) {
          const index = next++; const post = candidates[index]!;
          try { const image = await importImage(post.imageUrl, "instagram_post", context, signal, false, { caption: post.caption });
            posts[index] = { ...post, key: image.key, assetId: image.assetId, width: image.width, height: image.height };
          } catch { /* Failed posts never retain a remote-only URL in selectable captures. */ }
        }
      }));
      const logo = await avatar;
      if (logo) { result.avatarUrl = logo.url; result.avatarKey = logo.key; result.avatarAssetId = logo.assetId; }
      else if (data.avatarUrl) result.groupErrors!.logo = "logo_download_failed";
      result.posts = posts.filter((post): post is InstagramReadResult["posts"][number] => !!post);
      if (candidates.length && !result.posts.length) result.groupErrors!.images = "image_download_failed";
      return result;
    },
    async identity(data, context) {
      const signal = AbortSignal.timeout(options.timeoutMs ?? 45_000);
      try {
        const keys: string[] = [];
        const images = [...(data.avatarKey ? [{ key: data.avatarKey, url: data.avatarUrl! }] : []), ...data.posts.slice(0, 3).filter(p => p.key).map(p => ({ key: p.key!, url: p.imageUrl }))];
        for (const image of images) {
          signal.throwIfAborted();
          const key = `${image.key}-vision.jpg`;
          if (!(await abortable(options.findAsset(context.workspaceId, key), signal))) {
            const bytes = await abortable(options.storage.get(image.key, signal), signal);
            const normalized = await abortable(sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }), signal);
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
        const colors = await abortable(options.vision(context, signal)({ imageKeys: keys, signal }), signal);
        return { colors };
      } catch { return { colors: [], groupErrors: { colors: "instagram_vision_failed" } }; }
    },
  };
}
