import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { createInstagramEnrichment } from "./instagram-enrichment";
import type { InstagramReadResult } from "./readers";
import type { InstagramVision } from "./site-vision";
import type { SiteReadingContext } from "./site-enrichment";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";

async function jpeg(width = 200, height = 150) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 200 } } }).jpeg({ quality: 85 }).toBuffer();
}
async function truncatedJpeg(width = 400, height = 300) {
  const full = await sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 50 } } }).jpeg({ quality: 95 }).toBuffer();
  return full.subarray(0, full.length - 500);
}

type StoredAsset = { id: string; key: string; width: number | null; height: number | null };
function fakeAssetStore() {
  const rows = new Map<string, StoredAsset>();
  let counter = 0;
  const saved: CreateWorkspaceAssetInput[] = [];
  const saveAsset = vi.fn(async (data: CreateWorkspaceAssetInput) => {
    saved.push(data);
    const row: StoredAsset = { id: `asset-${++counter}`, key: data.key, width: data.width ?? null, height: data.height ?? null };
    rows.set(`${data.workspaceId}:${data.key}`, row);
    return row;
  });
  const findAsset = vi.fn(async (workspaceId: string, key: string) => rows.get(`${workspaceId}:${key}`) ?? null);
  return { saveAsset, findAsset, rows, saved };
}

type DownloadEntry = { bytes: Buffer; contentType: string } | Error;
function fakeDownloader(entries: Record<string, DownloadEntry>, delayMs = 0) {
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    inFlight--;
    const entry = entries[url];
    if (!entry) throw new Error(`no fixture for ${url}`);
    if (entry instanceof Error) throw entry;
    return entry;
  };
  return { fn, calls, maxInFlight: () => maxInFlight };
}

function fakeVisionFactory(result: string[] | Error, capture: { context?: SiteReadingContext; input?: Parameters<InstagramVision>[0] } = {}) {
  return (context: SiteReadingContext): InstagramVision => {
    capture.context = context;
    return async (input) => {
      capture.input = input;
      if (result instanceof Error) throw result;
      return result;
    };
  };
}

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const colorsOk = ["#111111", "#222222", "#333333"];

function baseData(overrides: Partial<InstagramReadResult> = {}): InstagramReadResult {
  return {
    exists: true, isPrivate: false, name: "Marca de Exemplo", avatarUrl: "https://instagram.fcdn.net/avatar.jpg", bio: "Produtos e serviços.",
    posts: [
      { imageUrl: "https://instagram.fcdn.net/p1.jpg", caption: "Uma publicação." },
      { imageUrl: "https://instagram.fcdn.net/p2.jpg", caption: "Outra publicação." },
    ],
    ...overrides,
  };
}

describe("createInstagramEnrichment.images", () => {
  it("downloads the avatar and every post (up to 12), storing each and setting keys/assetIds", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/p1.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/p2.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData(), context);
    expect(result.avatarUrl).toBe("https://instagram.fcdn.net/avatar.jpg");
    expect(result.avatarKey).toBeDefined();
    expect(result.avatarAssetId).toBeDefined();
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]).toMatchObject({ imageUrl: "https://instagram.fcdn.net/p1.jpg", caption: "Uma publicação." });
    expect(result.posts[0]!.key).toBeDefined();
    expect(result.posts[0]!.assetId).toBeDefined();
    expect(result.groupErrors).toEqual({});
    // Preserves the rest of the profile (name, bio, exists, isPrivate) unchanged.
    expect(result.name).toBe("Marca de Exemplo");
    expect(result.bio).toBe("Produtos e serviços.");
  });

  it("caps at 12 posts even when more are offered", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const posts = Array.from({ length: 15 }, (_, i) => ({ imageUrl: `https://instagram.fcdn.net/p${i}.jpg`, caption: `c${i}` }));
    const entries: Record<string, DownloadEntry> = { "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" } };
    for (const p of posts) entries[p.imageUrl] = { bytes: await jpeg(), contentType: "image/jpeg" };
    const { fn: download, calls } = fakeDownloader(entries);
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts }), context);
    expect(result.posts).toHaveLength(12);
    expect(new Set(calls.filter((u) => u.includes("/p")))).toEqual(new Set(posts.slice(0, 12).map((p) => p.imageUrl)));
  });

  it("downloads at most 3 images in parallel", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const posts = Array.from({ length: 8 }, (_, i) => ({ imageUrl: `https://instagram.fcdn.net/p${i}.jpg`, caption: `c${i}` }));
    const entries: Record<string, DownloadEntry> = { "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" } };
    for (const p of posts) entries[p.imageUrl] = { bytes: await jpeg(), contentType: "image/jpeg" };
    const { fn: download, maxInFlight } = fakeDownloader(entries, 10);
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    await enrichment.images(baseData({ posts }), context);
    expect(maxInFlight()).toBeLessThanOrEqual(4); // 3 posts in flight + 1 independent avatar download
  });

  it("marks logo_download_failed and clears the avatar when the avatar download fails, without touching posts", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": new Error("404"),
      "https://instagram.fcdn.net/p1.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/p2.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData(), context);
    expect(result.avatarUrl).toBeNull();
    expect(result.avatarKey).toBeUndefined();
    expect(result.avatarAssetId).toBeUndefined();
    expect(result.groupErrors?.logo).toBe("logo_download_failed");
    expect(result.posts).toHaveLength(2);
  });

  it("does not report logo_download_failed when there was no avatarUrl to begin with", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({});
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ avatarUrl: null, posts: [] }), context);
    expect(result.avatarUrl).toBeNull();
    expect(result.groupErrors?.logo).toBeUndefined();
  });

  it("isolates a single failing post: the rest still land, and no groupError when at least one succeeds", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const posts = [
      { imageUrl: "https://instagram.fcdn.net/ok-1.jpg", caption: "ok1" },
      { imageUrl: "https://instagram.fcdn.net/bad.jpg", caption: "bad" },
      { imageUrl: "https://instagram.fcdn.net/ok-2.jpg", caption: "ok2" },
    ];
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/ok-1.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/bad.jpg": new Error("image_http_error"),
      "https://instagram.fcdn.net/ok-2.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts }), context);
    expect(result.posts.map((p) => p.imageUrl).sort()).toEqual(["https://instagram.fcdn.net/ok-1.jpg", "https://instagram.fcdn.net/ok-2.jpg"]);
    expect(result.groupErrors?.images).toBeUndefined();
  });

  it("rejects a truncated post file whose header decodes but whose body does not survive a full decode", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const posts = [{ imageUrl: "https://instagram.fcdn.net/ok.jpg", caption: "ok" }, { imageUrl: "https://instagram.fcdn.net/truncated.jpg", caption: "bad" }];
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/ok.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/truncated.jpg": { bytes: await truncatedJpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts }), context);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.imageUrl).toBe("https://instagram.fcdn.net/ok.jpg");
  });

  it("reports image_download_failed only when every post failed", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const posts = [{ imageUrl: "https://instagram.fcdn.net/a.jpg", caption: "a" }, { imageUrl: "https://instagram.fcdn.net/b.jpg", caption: "b" }];
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/a.jpg": new Error("x"),
      "https://instagram.fcdn.net/b.jpg": new Error("y"),
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts }), context);
    expect(result.posts).toEqual([]);
    expect(result.groupErrors?.images).toBe("image_download_failed");
  });

  it("returns no posts and no groupError when there were no post candidates", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({ "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts: [] }), context);
    expect(result.posts).toEqual([]);
    expect(result.groupErrors?.images).toBeUndefined();
  });

  it("carries the post caption through into the stored asset metadata", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/p1.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://instagram.fcdn.net/p2.jpg": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    await enrichment.images(baseData(), context);
    const postAsset = store.saved.find((s) => s.name === "instagram_post" && s.metadata?.originUrl === "https://instagram.fcdn.net/p1.jpg");
    expect(postAsset?.metadata?.caption).toBe("Uma publicação.");
  });

  it("scopes the stored key under the reading's taskIntentId (an Instagram profile can be re-read across multiple runs)", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({ "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    const result = await enrichment.images(baseData({ posts: [] }), context);
    expect(result.avatarKey).toContain(context.taskIntentId);
  });

  it("reuses a previously stored asset for the same URL+context instead of downloading again", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download, calls } = fakeDownloader({ "https://instagram.fcdn.net/avatar.jpg": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk), download });
    await enrichment.images(baseData({ posts: [] }), context);
    expect(calls).toHaveLength(1);
    await enrichment.images(baseData({ posts: [] }), context);
    expect(calls).toHaveLength(1);
  });
});

describe("createInstagramEnrichment.identity", () => {
  it("builds the vision call from the avatar key plus the first 3 posts that have a stored key", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    await storage.put("p1.jpg", await jpeg(), "image/jpeg");
    await storage.put("p2.jpg", await jpeg(), "image/jpeg");
    const capture: { context?: SiteReadingContext; input?: Parameters<InstagramVision>[0] } = {};
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk, capture) });
    const data = baseData({
      avatarKey: "avatar.jpg",
      posts: [
        { imageUrl: "https://instagram.fcdn.net/p1.jpg", caption: "c1", key: "p1.jpg" },
        { imageUrl: "https://instagram.fcdn.net/p2.jpg", caption: "c2", key: "p2.jpg" },
      ],
    });
    const result = await enrichment.identity(data, context);
    expect(result.colors).toEqual(colorsOk);
    expect(capture.input?.imageKeys).toEqual(["avatar.jpg-vision.jpg", "p1.jpg-vision.jpg", "p2.jpg-vision.jpg"]);
  });

  it("only considers the FIRST 3 posts for identity images, and only those that have a key (never backfills from later posts)", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    await storage.put("p1.jpg", await jpeg(), "image/jpeg");
    await storage.put("p3.jpg", await jpeg(), "image/jpeg");
    const capture: { input?: Parameters<InstagramVision>[0] } = {};
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk, capture) });
    const data = baseData({
      avatarKey: "avatar.jpg",
      posts: [
        { imageUrl: "u1", caption: "c1", key: "p1.jpg" },
        { imageUrl: "u2", caption: "c2" }, // no key: failed download upstream
        { imageUrl: "u3", caption: "c3", key: "p3.jpg" },
        { imageUrl: "u4", caption: "c4", key: "p4-never-used.jpg" }, // 4th post: outside the first-3 window
      ],
    });
    await enrichment.identity(data, context);
    expect(capture.input?.imageKeys).toEqual(["avatar.jpg-vision.jpg", "p1.jpg-vision.jpg", "p3.jpg-vision.jpg"]);
  });

  it("falls back to only the posts when there is no avatarKey", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("p1.jpg", await jpeg(), "image/jpeg");
    const capture: { input?: Parameters<InstagramVision>[0] } = {};
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk, capture) });
    const data = baseData({ avatarKey: undefined, avatarUrl: null, posts: [{ imageUrl: "u1", caption: "c1", key: "p1.jpg" }] });
    await enrichment.identity(data, context);
    expect(capture.input?.imageKeys).toEqual(["p1.jpg-vision.jpg"]);
  });

  it("falls back to instagram_vision_failed (colors empty) when there is no avatarKey and no post has a key", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const capture: { input?: Parameters<InstagramVision>[0] } = {};
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk, capture) });
    const data = baseData({ avatarKey: undefined, avatarUrl: null, posts: [{ imageUrl: "u1", caption: "c1" }] });
    const result = await enrichment.identity(data, context);
    expect(result).toEqual({ colors: [], groupErrors: { colors: "instagram_vision_failed" } });
    expect(capture.input).toBeUndefined();
  });

  it("normalizes and stores a -vision.jpg copy for each image, saved with source brand_instagram", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(300, 300), "image/jpeg");
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk) });
    const data = baseData({ avatarKey: "avatar.jpg", posts: [] });
    await enrichment.identity(data, context);
    const visionAsset = store.saved.find((s) => s.name === "instagram_vision");
    expect(visionAsset?.key).toBe("avatar.jpg-vision.jpg");
    expect(visionAsset?.source).toBe("brand_instagram");
    expect(await storage.get("avatar.jpg-vision.jpg")).toBeDefined();
  });

  it("reuses an already-normalized vision copy instead of re-normalizing/re-storing it", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk) });
    const data = baseData({ avatarKey: "avatar.jpg", posts: [] });
    await enrichment.identity(data, context);
    expect(store.saved.filter((s) => s.name === "instagram_vision")).toHaveLength(1);
    await enrichment.identity(data, context);
    expect(store.saved.filter((s) => s.name === "instagram_vision")).toHaveLength(1);
  });

  it("fails the WHOLE call (no per-image isolation, unlike images()) when a single stored image fails to normalize", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    await storage.put("p1.jpg", Buffer.from("not-an-image"), "image/jpeg");
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk) });
    const data = baseData({ avatarKey: "avatar.jpg", posts: [{ imageUrl: "u1", caption: "c1", key: "p1.jpg" }] });
    const result = await enrichment.identity(data, context);
    expect(result).toEqual({ colors: [], groupErrors: { colors: "instagram_vision_failed" } });
  });

  describe("the cause of a failed palette is logged, not swallowed (ticket 13, D-2)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("names the provider's answer and the reading, and nothing of the images or of what the provider wrote", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const store = fakeAssetStore();
      const storage = new InMemoryObjectStorage();
      await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
      const refusal = Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "could not fetch https://r2.example/a.jpg?X-Amz-Signature=abc" } },
        undefined, new Headers({ "request-id": "req_1" }));
      const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(refusal) });
      const result = await enrichment.identity(baseData({ avatarKey: "avatar.jpg", posts: [] }), context);
      expect(result).toEqual({ colors: [], groupErrors: { colors: "instagram_vision_failed" } });
      // A 400 that does not open with a request parameter path is not proof that nothing ran, and its words are never logged.
      expect(warn).toHaveBeenCalledWith("[equipe-handoff] palette vision failed", {
        source: "instagram", readingId: "reading-1", kind: "other", status: 400, type: "invalid_request_error", requestId: "req_1",
      });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/r2\.example|Signature|fetch/);
    });

    it("says why when there was nothing to look at, and stays quiet when the vision worked", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const store = fakeAssetStore();
      const storage = new InMemoryObjectStorage();
      await createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk) }).identity(baseData({ posts: [] }), context);
      expect(warn).toHaveBeenCalledWith("[equipe-handoff] palette vision failed", expect.objectContaining({ source: "instagram", kind: "other", message: "Error: instagram_images_unavailable" }));
      warn.mockClear();
      await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
      await createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk) }).identity(baseData({ avatarKey: "avatar.jpg", posts: [] }), context);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("falls back to instagram_vision_failed when the vision model call itself rejects", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(new Error("free_call_unbounded")) });
    const data = baseData({ avatarKey: "avatar.jpg", posts: [] });
    const result = await enrichment.identity(data, context);
    expect(result).toEqual({ colors: [], groupErrors: { colors: "instagram_vision_failed" } });
  });

  it("passes the reading context through to the vision factory", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    await storage.put("avatar.jpg", await jpeg(), "image/jpeg");
    const capture: { context?: SiteReadingContext } = {};
    const enrichment = createInstagramEnrichment({ storage, ...store, vision: fakeVisionFactory(colorsOk, capture) });
    await enrichment.identity(baseData({ avatarKey: "avatar.jpg", posts: [] }), context);
    expect(capture.context).toEqual(context);
  });
});
