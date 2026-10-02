import { FirecrawlSiteReader } from "./firecrawl";
import { ApifyInstagramReader, type ApifyReaderOptions } from "./apify";
export type HandoffReadingContext = { workspaceId: string; accountId: string; handoffId: string; readingId: string; taskIntentId: string };
export type ReaderImage = { url: string; key?: string; assetId?: string; width?: number; height?: number };
export type SiteReadResult = {
  title: string | null; siteName: string | null; markdown: string; links: string[];
  images: ReaderImage[]; screenshotUrl: string | null; statusCode?: number;
  /** Credits the supplier says it charged for this reading (Firecrawl: `metadata.creditsUsed`). Recorded as an event; unknown when absent. */
  creditsUsed?: number;
  branding?: { logo?: ReaderImage; colors?: string[]; fonts?: string[] };
  logoCandidates?: string[];
  groupErrors?: Partial<Record<"logo" | "colors" | "fonts" | "images", string>>;
};
export type InstagramReadResult = {
  exists: boolean; isPrivate: boolean; name?: string; avatarUrl: string | null; avatarKey?: string; avatarAssetId?: string; bio: string;
  posts: Array<{ imageUrl: string; caption: string; key?: string; assetId?: string; width?: number; height?: number }>;
  colors?: string[];
  groupErrors?: SiteReadResult["groupErrors"];
};
export interface SiteReader { read(url: string, context?: HandoffReadingContext): Promise<SiteReadResult> }
export interface InstagramReader {
  profile(handle: string, context?: HandoffReadingContext): Promise<InstagramReadResult>;
  /** Reads, and records, what the provider charged for the run this reading dispatched. Called AFTER the groups are recorded, so nothing on screen waits for it. Never throws. */
  measureCost?(context?: HandoffReadingContext): Promise<void>;
}
export type HandoffReaders = { site: SiteReader; instagram: InstagramReader };
export class FakeSiteReader implements SiteReader {
  readonly calls: string[] = [];
  constructor(private readonly result: SiteReadResult | Error = {
    title: "Marca de exemplo", siteName: "Marca de exemplo", markdown: "Marca de exemplo. Produtos e serviços.",
    links: ["https://www.instagram.com/marca_exemplo/"],
    images: [{ url: "/e2e/base.png", width: 1024, height: 1024 }], screenshotUrl: null, statusCode: 200,
    branding: { logo: { url: "/e2e/logo.svg" }, colors: ["#333333", "#FFFFFF", "#6B46C1"], fonts: ["Inter"] },
  }) {}
  async read(url: string) { this.calls.push(url); if (this.result instanceof Error) throw this.result; return structuredClone(this.result); }
}
export class FakeInstagramReader implements InstagramReader {
  readonly calls: string[] = [];
  constructor(private readonly result: InstagramReadResult | Error = {
    exists: true, isPrivate: false, name: "Marca de exemplo", avatarUrl: "/e2e/logo.svg", bio: "Produtos e serviços da marca de exemplo.",
    posts: [{ imageUrl: "/e2e/style.png", caption: "Uma publicação pública de exemplo.", width: 1024, height: 1024 }],
    colors: ["#B45309", "#FFFFFF", "#333333"],
  }) {}
  async profile(handle: string) { this.calls.push(handle); if (this.result instanceof Error) throw this.result; return structuredClone(this.result); }
}
/** Explicit provider selection; missing configuration fails inside the reading job. */
export function createHandoffReaders(options: { beforeSiteRequest?: () => Promise<boolean>; instagram?: ApifyReaderOptions } = {}): HandoffReaders {
  return {
    site: process.env.SITE_READER_PROVIDER === "fake" ? { async read(url, context) {
      const data = await new FakeSiteReader().read(url);
      if (!context) throw new Error("fake_reading_context_required");
      data.images = await Promise.all(data.images.map(async (image, index) => ({ ...image, ...await saveFakeAsset(context, "site", image.url, `site_image_${index}`) })));
      if (data.branding?.logo) data.branding.logo = { ...data.branding.logo, ...await saveFakeAsset(context, "site", data.branding.logo.url, "site_logo") };
      return data;
    } } : process.env.SITE_READER_PROVIDER === "firecrawl" ? new FirecrawlSiteReader({ beforeRequest: options.beforeSiteRequest }) : { async read() { throw new Error("reader_unavailable"); } },
    instagram: process.env.INSTAGRAM_READER_PROVIDER === "fake" ? { async profile(handle, context) {
      const data = await new FakeInstagramReader().profile(handle);
      if (!context) throw new Error("fake_reading_context_required");
      data.posts = await Promise.all(data.posts.map(async (post, index) => {
        const asset = await saveFakeAsset(context, "instagram", post.imageUrl, `instagram_post_${index}`);
        return { ...post, imageUrl: asset.url, key: asset.key, assetId: asset.assetId };
      }));
      if (data.avatarUrl) {
        const asset = await saveFakeAsset(context, "instagram", data.avatarUrl, "instagram_avatar");
        data.avatarUrl = asset.url; data.avatarKey = asset.key; data.avatarAssetId = asset.assetId;
      }
      return data;
    } } : process.env.INSTAGRAM_READER_PROVIDER === "apify" ? new ApifyInstagramReader(options.instagram) : { async profile() { throw new Error("reader_unavailable"); } },
  };
}

async function saveFakeAsset(context: HandoffReadingContext, origin: "site" | "instagram", fixture: string, name: string) {
  const [{ readFile }, { objectStorage }, { createWorkspaceAssetIfKeyAbsent, getWorkspaceAssetByKey }] = await Promise.all([
    import("node:fs/promises"), import("@/server/storage"), import("@/server/repositories/workspace-asset"),
  ]);
  // Always a PNG: a vector fixture is drawn the way a real logo is (sanitized, then rasterized: `svg-logo.ts`), so an SVG is never stored.
  const key = `workspaces/${context.workspaceId}/handoff/${context.handoffId}/${context.readingId}/${context.taskIntentId}/${name}.png`;
  let asset = await getWorkspaceAssetByKey(context.workspaceId, key);
  if (!asset) {
    const file = await readFile(`${process.cwd()}/public${fixture}`);
    const buffer = fixture.endsWith(".svg") ? (await (await import("../svg-logo")).rasterizeSvgLogo(file)).png : file;
    const type = "image/png";
    await objectStorage.put(key, buffer, type);
    asset = await createWorkspaceAssetIfKeyAbsent({ workspaceId: context.workspaceId, clientProfileId: null,
      key, name, type, size: buffer.length, source: `brand_${origin}`,
      metadata: { handoffId: context.handoffId, readingId: context.readingId, provisional: true, originUrl: fixture,
        kind: name.replace(/_\d+$/, "") },
    }) ?? await getWorkspaceAssetByKey(context.workspaceId, key);
  }
  if (!asset) throw new Error("fake_asset_not_found");
  return { key: asset.key, assetId: asset.id, url: fixture };
}
