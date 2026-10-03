// What a failure of the SYSTEM (ticket 17, fixup 01) does to a whole reading of a site or of Instagram: it is a retry of the durable step (a `RasterRetryError`, never a group error and never "not found"),
// it spends nothing of the person's three readings (nothing here records a group), and a deadline that falls AFTER the paid call to the model has started is not turned into a retry (the call is not made twice).
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { createInstagramEnrichment } from "./instagram-enrichment";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import { RASTER_LIMITS, RasterImageRejected, RasterRetryError, isRasterRetry, processRaster } from "./raster-image";
import { forgedPng, greyTrnsPng } from "./logo-surface.fixtures";
import type { InstagramReadResult, SiteReadResult } from "./readers";
import * as transport from "./svg-draw-child";

vi.mock("./svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("./svg-draw-child")>();
  return { ...actual, runImageChild: vi.fn(actual.runImageChild) };
});
const child = vi.mocked(transport.runImageChild);
const actualChild = (await vi.importActual<typeof import("./svg-draw-child")>("./svg-draw-child")).runImageChild;
afterEach(() => { vi.restoreAllMocks(); child.mockReset(); child.mockImplementation(actualChild); });

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const LOGO = "https://example.com/brand.png", SHOT = "https://example.com/print.png", AVATAR = "https://ig.example/avatar.jpg";
type Entry = { bytes: Buffer; contentType: string };
const jpeg = async (width: number, height: number): Promise<Entry> => ({ bytes: await sharp({ create: { width, height, channels: 3, background: "#336699" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
const pageImages = (count: number) => Array.from({ length: count }, (_, i) => `https://example.com/p${i}.jpg`);
const posts = (count: number) => Array.from({ length: count }, (_, i) => ({ imageUrl: `https://ig.example/p${i}.jpg`, caption: "c" })) as InstagramReadResult["posts"];

async function setup(extra: Record<string, Entry> = {}, options: { timeoutMs?: number } = {}) {
  const entries: Record<string, Entry> = { [LOGO]: await jpeg(800, 800), [SHOT]: await jpeg(900, 600), [AVATAR]: await jpeg(600, 600), ...extra };
  for (const url of [...pageImages(26), ...posts(12).map(post => post.imageUrl)]) entries[url] ??= await jpeg(900, 700);
  const storage = new InMemoryObjectStorage();
  const saved: CreateWorkspaceAssetInput[] = [];
  const rows = new Map<string, { id: string; key: string; width: number | null; height: number | null; metadata?: unknown }>();
  const vision = { site: 0, instagram: 0 };
  let downloads = 0;
  const common = {
    storage, timeoutMs: options.timeoutMs,
    download: (async (url: string) => { downloads++; const entry = entries[url]; if (!entry) throw new Error("404"); return entry; }) as never,
    saveAsset: async (data: CreateWorkspaceAssetInput) => { saved.push(data); const row = { id: `a-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata }; rows.set(`${data.workspaceId}:${data.key}`, row); return row; },
    findAsset: async (workspaceId: string, key: string) => rows.get(`${workspaceId}:${key}`) ?? null,
  };
  const hang = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); // a model call that is still running when the deadline falls
  const site = (visionMode: "ok" | "hang" = "ok") => createSiteEnrichment({ ...common, vision: (_c, signal) => async () => { vision.site++; return visionMode === "hang" ? hang(signal) : { logoConfirmed: null, colors: ["#111111"], fonts: [] }; } });
  const instagram = (visionMode: "ok" | "hang" = "ok") => createInstagramEnrichment({ ...common, vision: (_c, signal) => async () => { vision.instagram++; return visionMode === "hang" ? hang(signal) : ["#111111"]; } });
  const siteData = (images = 6): SiteReadResult => ({ title: "T", siteName: "Marca", markdown: "m", links: [], statusCode: 200, screenshotUrl: SHOT, images: pageImages(images).map(url => ({ url })) as SiteReadResult["images"], branding: { logo: { url: LOGO }, colors: [], fonts: [] } });
  const instagramData = (count = 6): InstagramReadResult => ({ exists: true, isPrivate: false, name: "Marca", avatarUrl: AVATAR, bio: "", posts: posts(count) });
  return { site, instagram, siteData, instagramData, saved, vision, storage, downloads: () => downloads };
}
const failure = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error; } return undefined; };
const unavailable = () => child.mockImplementation((() => Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed"))) as never);
/** A decoder that never answers until the caller gives up, as the line does when it is crowded. */
const stuck = () => child.mockImplementation(((_input: unknown, options: { signal?: AbortSignal }) => new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true }))) as never);

describe("the system fails: the step is retried, the reading is not 'not found' and keeps nothing", () => {
  it("site: no decoder (it cannot start, or has no `sharp`) is a retry for the identity and for the images, not a logo, a palette or images 'not found'", async () => {
    const t = await setup();
    unavailable();
    for (const call of [() => t.site().identity(t.siteData(), context), () => t.site().images(t.siteData(), context)]) {
      const error = await failure(call());
      expect(isRasterRetry(error), String(error)).toBe(true);
      expect(error).toMatchObject({ reason: "unavailable" });
    }
    expect(t.vision.site).toBe(0); // the paid call is not even attempted
  });
  it("instagram: the same, for the images (avatar and posts) and for the identity", async () => {
    const t = await setup();
    unavailable();
    expect(isRasterRetry(await failure(t.instagram().images(t.instagramData(), context)))).toBe(true);
    const withKeys = { ...t.instagramData(), avatarKey: "workspaces/ws-1/avatar", avatarUrl: AVATAR, posts: [] };
    await t.storage.put("workspaces/ws-1/avatar", (await jpeg(600, 600)).bytes, "image/jpeg");
    expect(isRasterRetry(await failure(t.instagram().identity(withKeys, context)))).toBe(true);
    expect(t.vision.instagram).toBe(0);
  });
  it("one image of many hitting a failure of the system retries the WHOLE group (it is never a partial reading with the rest 'not found')", async () => {
    const t = await setup();
    let call = 0;
    child.mockImplementation(((...args: Parameters<typeof actualChild>) => (++call === 4 ? Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed")) : actualChild(...args))) as never);
    const error = await failure(t.site().images(t.siteData(8), context));
    expect(isRasterRetry(error)).toBe(true);
    call = 0;
    const ig = await failure(t.instagram().images(t.instagramData(8), context));
    expect(isRasterRetry(ig)).toBe(true);
  });
  it("an account whose room in the line is full (capacity) gets a retry of the step, whichever picture meets it, and a reading of another account is not touched", async () => {
    const t = await setup();
    stuck();
    const holding = new AbortController();
    const head = (await jpeg(64, 64)).bytes, big = Buffer.concat([head, Buffer.alloc(RASTER_LIMITS.maxBytes - head.length)]);
    const held = Array.from({ length: 1 + Math.floor(RASTER_LIMITS.maxAccountQueuedBytes / big.length) }, () => processRaster(big, "validate", { accountKey: "ws-1:acc-1", signal: holding.signal }).catch(() => undefined)); // one runs, the rest wait: all the room of the account
    const error = await failure(t.site().images(t.siteData(), context));
    expect(isRasterRetry(error), String(error)).toBe(true);
    expect(error).toMatchObject({ reason: "capacity" });
    holding.abort(new Error("done"));
    await Promise.all(held);
  });
  it("the picture that is bad is still 'not found' (the person is asked to upload it), and nothing is retried: more than 40 MP, for the site and for Instagram", async () => {
    const huge: Entry = { bytes: await forgedPng({ width: 8000, height: 5001 }), contentType: "image/png" };
    const t = await setup(Object.fromEntries([...pageImages(8), ...posts(8).map(post => post.imageUrl), LOGO, AVATAR].map(url => [url, huge])));
    const images = await t.site().images(t.siteData(), context);
    expect(images.groupErrors).toMatchObject({ images: "images_not_found" });
    const identity = await t.site().identity(t.siteData(), context);
    expect(identity.groupErrors).toMatchObject({ logo: "logo_unsupported_format" });
    const ig = await t.instagram().images(t.instagramData(), context);
    expect(ig.groupErrors).toMatchObject({ images: "images_not_found", logo: "logo_unsupported_format" });
    expect(t.saved.filter(asset => asset.name !== "site_screenshot")).toEqual([]);
    expect(new RasterImageRejected("too_large")).not.toBeInstanceOf(RasterRetryError);
  });
});

describe("the deadline of the step", () => {
  it("falling while the decoder is still busy (before the model is asked) is a retry (wait_timeout): site identity, site images, instagram images, and the model is not called", async () => {
    const t = await setup({}, { timeoutMs: 300 });
    stuck();
    for (const call of [() => t.site().identity(t.siteData(), context), () => t.site().images(t.siteData(), context), () => t.instagram().images(t.instagramData(), context)]) {
      const error = await failure(call());
      expect(isRasterRetry(error), String(error)).toBe(true);
      expect(error).toMatchObject({ reason: "wait_timeout" });
    }
    expect(t.vision.site + t.vision.instagram).toBe(0);
  });
  it("falling AFTER the call to the model has started is NOT a retry (the paid call is not made twice): the palette is 'vision failed' and the reading goes on, the model was called exactly once", async () => {
    const t = await setup({}, { timeoutMs: 3_000 });
    const identity = await t.site("hang").identity(t.siteData(), context);
    expect(t.vision.site).toBe(1);
    expect(identity.groupErrors).toMatchObject({ colors: "site_vision_failed" });
    expect(identity.branding!.colors).toEqual([]);
  }, 20_000);
  it("the same for Instagram: the deadline that falls while the model works is 'instagram_vision_failed', not a retry", async () => {
    const t = await setup({}, { timeoutMs: 3_000 });
    const images = await t.instagram().images(t.instagramData(3), context);
    const identity = await t.instagram("hang").identity({ ...images }, context);
    expect(t.vision.instagram).toBe(1);
    expect(identity).toMatchObject({ colors: [], groupErrors: { colors: "instagram_vision_failed" } });
  }, 20_000);
  it("a real retry error of the decoder is still a retry in the vision phase of the identity (the normalization of the logo and of the posts happens before the model, and is the system's)", async () => {
    const t = await setup({}, { timeoutMs: 20_000 });
    const identity = await t.site().identity(t.siteData(), context); // the logo is stored; now its normalization for the vision fails
    expect(identity.groupErrors).toEqual({});
    t.vision.site = 0;
    const logoKey = identity.branding!.logo!.key!;
    child.mockImplementation((() => Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed"))) as never);
    const bare = { ...t.siteData(), branding: { logo: { url: LOGO, ...identity.branding!.logo }, colors: [], fonts: [] } } as SiteReadResult;
    const error = await failure(t.site().identity(bare, context));
    expect(logoKey).toBeTruthy();
    expect(isRasterRetry(error), String(error)).toBe(true);
    expect(t.vision.site).toBe(0);
  }, 30_000);
});

describe("the first failure of the system stops the siblings", () => {
  const quiet = () => new Promise(resolve => setTimeout(resolve, 400));
  const firstFails = () => { let n = 0; child.mockImplementation(((...args: Parameters<typeof actualChild>) => (++n === 1 ? Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed")) : actualChild(...args))) as never); return () => n; };
  it("site images: the first failure of the decoder aborts the other workers: the 26 candidates are not walked, and nothing is downloaded, decoded, stored or saved after the rejection", async () => {
    const t = await setup();
    const decoded = firstFails();
    const error = await failure(t.site().images(t.siteData(26), context));
    expect(isRasterRetry(error)).toBe(true);
    const downloads = t.downloads(), calls = decoded(), saved = t.saved.length;
    expect(downloads).toBeLessThan(10); // three workers were at work; not twenty-six pictures
    await quiet();
    expect(t.downloads()).toBe(downloads);
    expect(decoded()).toBe(calls);
    expect(t.saved.length).toBe(saved);
  });
  it("instagram: the same for the avatar and the twelve posts", async () => {
    const t = await setup();
    const decoded = firstFails();
    const error = await failure(t.instagram().images(t.instagramData(12), context));
    expect(isRasterRetry(error)).toBe(true);
    const downloads = t.downloads(), calls = decoded(), saved = t.saved.length;
    expect(downloads).toBeLessThan(10);
    await quiet();
    expect(t.downloads()).toBe(downloads);
    expect(decoded()).toBe(calls);
    expect(t.saved.length).toBe(saved);
  });
  it("site identity: the logo and the screenshot are stopped together, and nothing is written after the rejection", async () => {
    const t = await setup();
    const decoded = firstFails();
    const error = await failure(t.site().identity(t.siteData(), context));
    expect(isRasterRetry(error)).toBe(true);
    const downloads = t.downloads(), calls = decoded(), saved = t.saved.length;
    await quiet();
    expect(t.downloads()).toBe(downloads);
    expect(decoded()).toBe(calls);
    expect(t.saved.length).toBe(saved);
    expect(t.vision.site).toBe(0);
  });
  it("the reason that comes back is the FIRST one, whatever the siblings meet when they are stopped", async () => {
    const t = await setup();
    let n = 0;
    child.mockImplementation(((...args: Parameters<typeof actualChild>) => (++n === 1 ? Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed")) : n === 2 ? Promise.reject(new RasterRetryError("capacity")) : actualChild(...args))) as never);
    const error = await failure(t.site().images(t.siteData(26), context));
    expect(error).toMatchObject({ reason: "unavailable" });
  });
});

describe("an Instagram reading whose avatar and twelve posts are all a PNG of 1 x 10,000,000 (the repro of the review of PR 619) next to a legitimate reading of another account", () => {
  it("the hostile bytes are refused by the header before any child is started (not one decode of them), the reading is 'not found', and the legitimate reading of the other account completes with everything", async () => {
    const hostile: Entry = { bytes: greyTrnsPng(10_000_000), contentType: "image/png" }; // a real, valid PNG of 39 KB: ~3 s of decoding when it was admitted
    const t = await setup(Object.fromEntries([AVATAR, ...posts(12).map(post => post.imageUrl)].map(url => [url, hostile])));
    const other: SiteReadingContext = { workspaceId: "ws-2", accountId: "acc-2", handoffId: "handoff-2", readingId: "reading-2", taskIntentId: "intent-2" };
    const started = Date.now();
    let hostileMs = 0;
    const [ig, site, identity] = await Promise.all([
      t.instagram().images(t.instagramData(12), context).then(value => { hostileMs = Date.now() - started; return value; }),
      t.site().images(t.siteData(12), other),
      t.site().identity(t.siteData(), other),
    ]);
    expect(ig.posts).toEqual([]);
    expect(ig.avatarKey).toBeUndefined();
    expect(ig.groupErrors).toMatchObject({ images: "images_not_found", logo: "logo_unsupported_format" });
    expect(hostileMs).toBeGreaterThanOrEqual(0); // only recorded (it was ~3 s for each picture when they were decoded): the criterion is zero decodes of the hostile bytes and the complete legitimate reading
    expect(child.mock.calls.some(call => Buffer.compare(Buffer.from(call[0] as Uint8Array), hostile.bytes) === 0)).toBe(false);
    expect(site.groupErrors ?? {}).toEqual({});
    expect(site.images).toHaveLength(12);
    expect(identity.groupErrors ?? {}).toEqual({});
    expect(identity.branding!.logo).toBeTruthy();
    expect(t.saved.filter(asset => asset.workspaceId === "ws-1")).toEqual([]); // nothing of the hostile reading was stored or saved
    expect(t.saved.filter(asset => asset.workspaceId === "ws-2" && asset.name === "site_image")).toHaveLength(12);
  }, 60_000);
});
