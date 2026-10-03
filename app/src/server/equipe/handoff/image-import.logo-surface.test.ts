// A logo and an image of the page can be the same address, and so the same asset (its key comes from the address alone): the logo's import measures what is stored, keeps the
// answer with the asset, and the item and the asset never disagree, whatever the order the two imports ran in (ticket 16, review of PR 618).
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import * as measurer from "./logo-surface";
import { BLACK, WHITE, block } from "./logo-surface.fixtures";
import { createInstagramEnrichment } from "./instagram-enrichment";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import type { InstagramReadResult, SiteReadResult } from "./readers";
import type { SiteVision } from "./site-vision";

vi.mock("./logo-surface", async importOriginal => {
  const actual = await importOriginal<typeof import("./logo-surface")>();
  return { ...actual, measureLogoSurface: vi.fn(actual.measureLogoSurface) };
});
const actualMeasure = (await vi.importActual<typeof import("./logo-surface")>("./logo-surface")).measureLogoSurface;
const measureSpy = vi.mocked(measurer.measureLogoSurface);
afterEach(() => { vi.restoreAllMocks(); measureSpy.mockReset(); measureSpy.mockImplementation(actualMeasure); });

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const SAME = "https://example.com/brand.png"; // the logo AND an image of the page
const SHOT = "https://example.com/print.png";
const keyOf = (url: string) => `workspaces/ws-1/handoff/handoff-1/reading-1/${createHash("sha256").update(url).digest("hex")}`;
const igKeyOf = (url: string, kind: string) => `workspaces/ws-1/handoff/handoff-1/reading-1/intent-1/${kind}/${createHash("sha256").update(url).digest("hex")}`;

type Row = { id: string; key: string; width: number | null; height: number | null; metadata?: unknown };
type Entry = { bytes: Buffer; contentType: string };
const deferred = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

/** A repository as the real one behaves: `saveAsset` inserts only if the key is absent (and gives `null` when it is not), `updateAssetMetadata` merges. */
function setup(entries: Record<string, Entry>, options: { updateAssetMetadata?: "merge" | "reject" | "none"; gates?: Record<string, ReturnType<typeof deferred>> } = {}) {
  const rows = new Map<string, Row>();
  const saved: CreateWorkspaceAssetInput[] = [];
  const updates: Array<{ assetId: string; metadata: Record<string, unknown> }> = [];
  const blocked: string[] = [];
  const storage = new InMemoryObjectStorage();
  const seen: Array<Parameters<SiteVision>[0]> = [];
  const mode = options.updateAssetMetadata ?? "merge";
  const common = {
    storage, download: (async (url: string) => { const entry = entries[url]; if (!entry) throw new Error("404"); return entry; }) as never,
    saveAsset: async (data: CreateWorkspaceAssetInput) => {
      const gate = options.gates?.[data.name];
      if (gate) { blocked.push(data.name); await gate.promise; }
      const id = `${data.workspaceId}:${data.key}`;
      if (rows.has(id)) return null;
      saved.push(data);
      const row = { id: `asset-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata };
      rows.set(id, row);
      return row;
    },
    findAsset: async (workspaceId: string, key: string) => rows.get(`${workspaceId}:${key}`) ?? null,
    ...(mode === "none" ? {} : { updateAssetMetadata: async (assetId: string, _workspaceId: string, metadata: Record<string, unknown>) => {
      if (mode === "reject") throw new Error("db_down");
      updates.push({ assetId, metadata });
      for (const row of rows.values()) if (row.id === assetId) row.metadata = { ...(row.metadata as object | null), ...metadata };
    } }),
  };
  const site = createSiteEnrichment({ ...common, vision: () => async input => { seen.push(input); return { logoConfirmed: true, colors: ["#111111"], fonts: [] }; } });
  const instagram = createInstagramEnrichment({ ...common, vision: () => async () => ["#111111"] });
  const asset = (key: string) => rows.get(`ws-1:${key}`);
  return { site, instagram, rows, saved, updates, blocked, storage, seen, asset };
}
const siteData = (): SiteReadResult => ({ title: "T", siteName: "Marca", markdown: "m", links: [], images: [{ url: SAME }] as SiteReadResult["images"], screenshotUrl: SHOT, statusCode: 200, branding: { logo: { url: SAME }, colors: [], fonts: [] } });
const png = async (pipeline: sharp.Sharp): Promise<Entry> => ({ bytes: await pipeline.png().toBuffer(), contentType: "image/png" });
const whiteLogo = () => png(block(800, 800, WHITE));
const print = async (): Promise<Entry> => ({ bytes: await sharp({ create: { width: 200, height: 150, channels: 3, background: "#ffffff" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
const corner = async (bytes: Uint8Array) => { const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true }); return [data[0]!, data[1]!, data[2]!]; };
const entries = async () => ({ [SAME]: await whiteLogo(), [SHOT]: await print() });
/** The item that goes to the handoff and the asset the Library will hold say the same. */
const agree = (t: ReturnType<typeof setup>, surface: unknown) => expect((t.asset(keyOf(SAME))!.metadata as Record<string, unknown> | null)?.surface).toBe(surface);

describe("the same address as a logo and as an image of the page", () => {
  it("the images first: the logo measures what is stored, keeps the answer with the asset, and the vision copy is on the graphite", async () => {
    const t = setup(await entries());
    const images = await t.site.images(siteData(), context);
    expect("surface" in images.images![0]!).toBe(false);
    expect(measureSpy).not.toHaveBeenCalled();
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo).toMatchObject({ assetId: images.images![0]!.assetId, surface: "dark" });
    agree(t, "dark");
    expect(t.updates).toEqual([{ assetId: images.images![0]!.assetId, metadata: { surface: "dark" } }]);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    near(await corner(await t.storage.get(`${identity.branding!.logo!.key}-vision.jpg`)), [0x17, 0x19, 0x1d]);
    expect(t.seen[0]).toMatchObject({ logoBackdrop: "#17191d" });
  });
  it("the identity first: the logo is measured when stored, and the image import finds it, never measures and never updates", async () => {
    const t = setup(await entries());
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.surface).toBe("dark");
    agree(t, "dark");
    expect(measureSpy).toHaveBeenCalledTimes(1);
    const images = await t.site.images(siteData(), context);
    expect("surface" in images.images![0]!).toBe(false);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(t.updates).toEqual([]);
    agree(t, "dark");
  });
  it.each([["the image's save finishes first", "site_image", "site_logo"], ["the logo's save finishes first", "site_logo", "site_image"]] as const)("both at once, %s: the one that loses the race still ends with an agreeing item and asset", async (_name, first, second) => {
    const gates = { site_image: deferred(), site_logo: deferred() };
    const t = setup(await entries(), { gates });
    const identity = t.site.identity(siteData(), context);
    const images = t.site.images(siteData(), context);
    await vi.waitFor(() => expect([...t.blocked].sort()).toEqual(["site_image", "site_logo"]));
    gates[first].release();
    await vi.waitFor(() => expect(t.saved.some(a => a.name === first)).toBe(true));
    gates[second].release();
    const [identityResult, imagesResult] = await Promise.all([identity, images]);
    // The logo's item has the answer, the asset has it, and the image never carries one.
    expect(identityResult.branding!.logo!.surface).toBe("dark");
    expect("surface" in imagesResult.images![0]!).toBe(false);
    agree(t, "dark");
    expect(t.saved.filter(a => a.name === "site_image" || a.name === "site_logo")).toHaveLength(1);
    // The logo that lost the race kept its answer by an update; the logo that won needed none.
    expect(t.updates).toHaveLength(first === "site_image" ? 1 : 0);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(t.seen[0]).toMatchObject({ logoBackdrop: "#17191d" });
  });
  it("a logo with dark ink is the same story in light: measured from what is stored, kept with the asset", async () => {
    const t = setup({ [SAME]: await png(block(800, 800, BLACK)), [SHOT]: await print() });
    await t.site.images(siteData(), context);
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.surface).toBe("light");
    agree(t, "light");
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });
});

describe("the answer cannot be kept with its asset", () => {
  it("the update fails (the images first): the logo has NO surface in the item and none in the asset, the import goes on, and the cause is a warning", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const t = setup(await entries(), { updateAssetMetadata: "reject" });
    await t.site.images(siteData(), context);
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo).toBeTruthy();
    expect("surface" in identity.branding!.logo!).toBe(false);
    agree(t, undefined);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not kept with its asset", { readingId: "reading-1", reason: "db_down" });
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
    near(await corner(await t.storage.get(`${identity.branding!.logo!.key}-vision.jpg`)), [255, 255, 255]);
  });
  it("the update fails after a race lost: the same", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const gates = { site_image: deferred(), site_logo: deferred() };
    const t = setup(await entries(), { updateAssetMetadata: "reject", gates });
    const identity = t.site.identity(siteData(), context);
    const images = t.site.images(siteData(), context);
    await vi.waitFor(() => expect(t.blocked).toHaveLength(2));
    gates.site_image.release();
    await vi.waitFor(() => expect(t.saved.some(a => a.name === "site_image")).toBe(true));
    gates.site_logo.release();
    const [result] = await Promise.all([identity, images]);
    expect("surface" in result.branding!.logo!).toBe(false);
    agree(t, undefined);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not kept with its asset", expect.objectContaining({ reason: "db_down" }));
  });
  it("a worker with no way to update (no updateAssetMetadata): the item still has its answer and nothing breaks", async () => {
    const t = setup(await entries(), { updateAssetMetadata: "none" });
    await t.site.images(siteData(), context);
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.surface).toBe("dark");
    expect(t.updates).toEqual([]);
    agree(t, undefined);
  });
});

describe("a logo already stored", () => {
  it("with a valid surface: neither measured nor updated", async () => {
    const t = setup(await entries());
    t.rows.set(`ws-1:${keyOf(SAME)}`, { id: "cached", key: keyOf(SAME), width: 800, height: 800, metadata: { surface: "dark" } });
    await t.storage.put(keyOf(SAME), (await whiteLogo()).bytes, "image/png");
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo).toMatchObject({ assetId: "cached", surface: "dark" });
    expect(measureSpy).not.toHaveBeenCalled();
    expect(t.updates).toEqual([]);
  });
  it("opaque (it brings its own background): measured, nothing to keep, no update, no surface", async () => {
    const t = setup(await entries());
    t.rows.set(`ws-1:${keyOf(SAME)}`, { id: "cached", key: keyOf(SAME), width: 800, height: 800, metadata: {} });
    await t.storage.put(keyOf(SAME), await sharp({ create: { width: 800, height: 800, channels: 3, background: "#ffffff" } }).png().toBuffer(), "image/png");
    const identity = await t.site.identity(siteData(), context);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect("surface" in identity.branding!.logo!).toBe(false);
    expect(t.updates).toEqual([]);
  });
  it("stored bytes that cannot be read: a warning, the import goes on without the datum", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const t = setup(await entries());
    t.rows.set(`ws-1:${keyOf(SAME)}`, { id: "cached", key: keyOf(SAME), width: 800, height: 800, metadata: {} });
    await t.storage.put(keyOf(SAME), (await whiteLogo()).bytes, "image/png");
    vi.spyOn(t.storage, "get").mockRejectedValueOnce(new Error("r2_down"));
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo).toMatchObject({ assetId: "cached" });
    expect("surface" in identity.branding!.logo!).toBe(false);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { readingId: "reading-1", reason: "r2_down" });
    expect(t.updates).toEqual([]);
  });
});

describe("a logo too big to decode here", () => {
  it("is stored all the same, without surface; the skip is an info line with its reason, and not a warning", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    // 4096 x 2049 RGBA: one row over the ceiling (32 MiB decoded), a few KB as a file.
    const big = await png(sharp({ create: { width: 4096, height: 2049, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: { create: { width: 2000, height: 800, channels: 4, background: "#ffffff" } }, left: 100, top: 100 }]));
    const t = setup({ [SAME]: big, [SHOT]: await print() });
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.key).toBeTruthy();
    expect("surface" in identity.branding!.logo!).toBe(false);
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).not.toHaveProperty("surface");
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { readingId: "reading-1", reason: "too_large" });
    expect(warn.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });
  it("an AVIF logo is stored all the same: its decoder is not asked, an info line says unsupported, no warning, no surface", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const avif: Entry = { bytes: await block(200, 100, WHITE).avif({ lossless: true }).toBuffer(), contentType: "image/avif" };
    const t = setup({ [SAME]: avif, [SHOT]: await print() });
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.key).toBeTruthy();
    expect("surface" in identity.branding!.logo!).toBe(false);
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).not.toHaveProperty("surface");
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { readingId: "reading-1", reason: "unsupported" });
    expect(warn.mock.calls.some(call => String(call[0]).includes("logo surface"))).toBe(false);
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });
  it("a measure that is busy is skipped the same way (reason busy)", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    measureSpy.mockRejectedValue(new measurer.LogoSurfaceSkipped("busy"));
    const t = setup(await entries());
    const identity = await t.site.identity(siteData(), context);
    expect(identity.branding!.logo!.key).toBeTruthy();
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { readingId: "reading-1", reason: "busy" });
  });
});

describe("the importer's deadline", () => {
  it("is handed to the measure, so a logo that timed out takes no turn in the queue", async () => {
    const t = setup(await entries());
    await t.site.identity(siteData(), context);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(measureSpy).toHaveBeenCalledWith(expect.any(Uint8Array), { signal: expect.any(AbortSignal) });
  });
});

describe("the Instagram avatar", () => {
  const AVATAR = "https://ig.example/avatar.png";
  const profile = (): InstagramReadResult => ({ exists: true, isPrivate: false, name: "Marca", avatarUrl: AVATAR, bio: "", posts: [] });

  it("found stored without a surface: it is measured from what is stored and the answer is kept with the asset", async () => {
    const t = setup({ [AVATAR]: await whiteLogo() });
    t.rows.set(`ws-1:${igKeyOf(AVATAR, "instagram_avatar")}`, { id: "cached-avatar", key: igKeyOf(AVATAR, "instagram_avatar"), width: 800, height: 800, metadata: { provisional: true } });
    await t.storage.put(igKeyOf(AVATAR, "instagram_avatar"), (await whiteLogo()).bytes, "image/png");
    const result = await t.instagram.images(profile(), context);
    expect(result).toMatchObject({ avatarAssetId: "cached-avatar", avatarSurface: "dark" });
    expect(t.updates).toEqual([{ assetId: "cached-avatar", metadata: { surface: "dark" } }]);
    expect((t.rows.get(`ws-1:${igKeyOf(AVATAR, "instagram_avatar")}`)!.metadata as Record<string, unknown>).surface).toBe("dark");
  });
  it("whose update fails: no avatarSurface, no surface in the asset", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const t = setup({ [AVATAR]: await whiteLogo() }, { updateAssetMetadata: "reject" });
    t.rows.set(`ws-1:${igKeyOf(AVATAR, "instagram_avatar")}`, { id: "cached-avatar", key: igKeyOf(AVATAR, "instagram_avatar"), width: 800, height: 800, metadata: {} });
    await t.storage.put(igKeyOf(AVATAR, "instagram_avatar"), (await whiteLogo()).bytes, "image/png");
    const result = await t.instagram.images(profile(), context);
    expect("avatarSurface" in result).toBe(false);
    expect((t.rows.get(`ws-1:${igKeyOf(AVATAR, "instagram_avatar")}`)!.metadata as Record<string, unknown>)).not.toHaveProperty("surface");
  });
  it("too big: stored all the same, an info line, no warning", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    measureSpy.mockRejectedValue(new measurer.LogoSurfaceSkipped("too_large"));
    const t = setup({ [AVATAR]: await whiteLogo() });
    const result = await t.instagram.images(profile(), context);
    expect(result.avatarKey).toBeTruthy();
    expect("avatarSurface" in result).toBe(false);
    expect(info).toHaveBeenCalledWith("[equipe-handoff] logo surface skipped", { readingId: "reading-1", reason: "too_large" });
  });
});

function near(actual: number[], expected: number[]) { actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(6)); }
