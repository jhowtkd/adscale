// The plate of a site's logo (ticket 16): measured once when it is stored, kept with the asset and the reading, and used for the copy the vision reads.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import * as measurer from "./logo-surface";
import { BLACK, WHITE, block, fromRgba, solid } from "./logo-surface.fixtures";
import { siteVisionSchema, type SiteVision } from "./site-vision";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import type { SiteReadResult } from "./readers";

vi.mock("./logo-surface", async importOriginal => {
  const actual = await importOriginal<typeof import("./logo-surface")>();
  return { ...actual, measureLogoSurface: vi.fn(actual.measureLogoSurface) };
});
const actualMeasure = (await vi.importActual<typeof import("./logo-surface")>("./logo-surface")).measureLogoSurface;
const measureSpy = vi.mocked(measurer.measureLogoSurface);

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const visionOk = { logoConfirmed: true as boolean | null, colors: ["#111111", "#222222"], fonts: ["Inter"] };
const LOGO_URL = "https://example.com/logo.png";
const keyOf = (url: string) => `workspaces/${context.workspaceId}/handoff/${context.handoffId}/${context.readingId}/${createHash("sha256").update(url).digest("hex")}`;

type Row = { id: string; key: string; width: number | null; height: number | null; metadata?: unknown };
type Entry = { bytes: Buffer; contentType: string };

function setup(entries: Record<string, Entry>, options: { timeoutMs?: number } = {}) {
  const rows = new Map<string, Row>();
  const saved: CreateWorkspaceAssetInput[] = [];
  const storage = new InMemoryObjectStorage();
  const download = vi.fn(async (url: string) => { const entry = entries[url]; if (!entry) throw new Error(`no fixture for ${url}`); return entry; });
  const seen: Array<Parameters<SiteVision>[0]> = [];
  const visionCalls = vi.fn();
  const updates: Array<{ assetId: string; metadata: Record<string, unknown> }> = [];
  const enrichment = createSiteEnrichment({
    storage, download: download as never, ...options,
    updateAssetMetadata: async (assetId, workspaceId, metadata) => {
      updates.push({ assetId, metadata });
      for (const row of rows.values()) if (row.id === assetId && row.metadata !== undefined) row.metadata = { ...(row.metadata as object | null), ...metadata };
    },
    saveAsset: async data => { saved.push(data); const row = { id: `asset-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata }; rows.set(`${data.workspaceId}:${data.key}`, row); return row; },
    findAsset: async (workspaceId, key) => rows.get(`${workspaceId}:${key}`) ?? null,
    vision: () => async input => { visionCalls(); seen.push(input); return visionOk; },
  });
  return { enrichment, storage, saved, rows, download, seen, visionCalls, updates };
}
const site = (overrides: Partial<SiteReadResult> = {}): SiteReadResult => ({
  title: "T", siteName: "Marca", markdown: "md", links: [], statusCode: 200, images: [], screenshotUrl: "https://example.com/print.png",
  branding: { logo: { url: LOGO_URL }, colors: ["#0000EE"], fonts: ["Inter"] }, ...overrides,
});
const pngEntry = async (pipeline: sharp.Sharp): Promise<Entry> => ({ bytes: await pipeline.png().toBuffer(), contentType: "image/png" });
const print = async (): Promise<Entry> => ({ bytes: await sharp({ create: { width: 200, height: 150, channels: 3, background: "#ffffff" } }).jpeg().toBuffer(), contentType: "image/jpeg" });
const corner = async (bytes: Uint8Array) => { const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true }); return [data[0]!, data[1]!, data[2]!]; };
const near = (actual: number[], expected: number[], tolerance: number) => actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThanOrEqual(tolerance));

afterEach(() => { vi.restoreAllMocks(); measureSpy.mockReset(); measureSpy.mockImplementation(actualMeasure); });

describe("identity(): a transparent logo with light ink", () => {
  it("is stored with metadata.surface dark, reported as branding.logo.surface dark, and read on the graphite", async () => {
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, WHITE)), "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site(), context);
    const logo = result.branding!.logo!;
    expect(logo.surface).toBe("dark");
    const asset = t.saved.find(a => a.name === "site_logo")!;
    expect(asset.metadata).toMatchObject({ surface: "dark", provisional: true, kind: "site_logo", handoffId: "handoff-1", readingId: "reading-1" });
    // The copy the vision reads: the transparent corner is the graphite #17191d (JPEG: a few levels of tolerance).
    const copy = await t.storage.get(`${logo.key}-vision.jpg`);
    near(await corner(copy), [0x17, 0x19, 0x1d], 6);
    expect(t.seen).toHaveLength(1);
    expect(t.seen[0]).toMatchObject({ logoKey: `${logo.key}-vision.jpg`, logoBackdrop: "#17191d" });
    expect(result.groupErrors?.colors).toBeUndefined();
  });

  it("a stored SVG with white ink is drawn as a PNG (convertedFrom svg) AND asks for the dark plate", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect x="20" y="20" width="200" height="40" fill="#ffffff"/></svg>`;
    const t = setup({ "https://example.com/logo.svg": { bytes: Buffer.from(svg), contentType: "image/svg+xml" }, "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site({ branding: { logo: { url: "https://example.com/logo.svg" }, colors: [], fonts: [] } }), context);
    expect(result.branding?.logo?.surface).toBe("dark");
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).toMatchObject({ convertedFrom: "svg", surface: "dark" });
    expect(t.seen[0]).toMatchObject({ logoBackdrop: "#17191d" });
    // The bytes judged are the PNG that is stored (the SVG never reaches the measure).
    const stored = t.saved.find(a => a.name === "site_logo")!;
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect((await sharp(measureSpy.mock.calls[0]![0]).metadata()).format).toBe("png");
    expect(measureSpy.mock.calls[0]![0].length).toBe(stored.size);
  });
});

describe("identity(): a logo that keeps the light plate or has none", () => {
  it("dark ink: surface light, the copy is white and the vision input has no logoBackdrop key at all", async () => {
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, BLACK)), "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site(), context);
    const logo = result.branding!.logo!;
    expect(logo.surface).toBe("light");
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).toMatchObject({ surface: "light" });
    near(await corner(await t.storage.get(`${logo.key}-vision.jpg`)), [255, 255, 255], 3);
    expect(t.seen[0]).toMatchObject({ logoKey: `${logo.key}-vision.jpg` });
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });

  it.each([
    ["a JPEG", async () => ({ bytes: await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer(), contentType: "image/jpeg" })],
    ["a PNG without alpha", async () => ({ bytes: await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ffffff" } }).png().toBuffer(), contentType: "image/png" })],
    ["a PNG with alpha but opaque", async () => pngEntry(fromRgba(300, 200, () => WHITE))],
  ])("%s: no surface anywhere, white copy, no logoBackdrop", async (_name, make) => {
    const t = setup({ [LOGO_URL]: await make(), "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site(), context);
    const logo = result.branding!.logo!;
    expect("surface" in logo).toBe(false);
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).not.toHaveProperty("surface");
    near(await corner(await t.storage.get(`${logo.key}-vision.jpg`)), [255, 255, 255], 3);
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });
});

describe("identity(): a logo that cannot be measured", () => {
  it("is stored all the same, without surface, and the warning carries a reason and never the content", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    measureSpy.mockRejectedValue(new Error("Input buffer has corrupt header"));
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, WHITE)), "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo?.key).toBeTruthy();
    expect("surface" in result.branding!.logo!).toBe(false);
    expect(t.saved.find(a => a.name === "site_logo")!.metadata).not.toHaveProperty("surface");
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { readingId: "reading-1", reason: "Input buffer has corrupt header" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(LOGO_URL);
    // Without the data the copy is white, as it always was.
    near(await corner(await t.storage.get(`${result.branding!.logo!.key}-vision.jpg`)), [255, 255, 255], 3);
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });

  it("a non-Error rejection is reported as unknown", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    measureSpy.mockRejectedValue("boom");
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, WHITE)), "https://example.com/print.png": await print() });
    await t.enrichment.identity(site(), context);
    expect(warn).toHaveBeenCalledWith("[equipe-handoff] logo surface not measured", { readingId: "reading-1", reason: "unknown" });
  });

  it("a measure aborted by the signal propagates the abort: no warning, nothing stored for the logo", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    measureSpy.mockImplementation(() => new Promise<never>(() => undefined)); // never settles
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, WHITE)), "https://example.com/print.png": await print() }, { timeoutMs: 30 });
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo).toBeUndefined();
    expect(t.saved.some(a => a.name === "site_logo")).toBe(false);
    expect(warn.mock.calls.some(call => call[0] === "[equipe-handoff] logo surface not measured")).toBe(false);
  });
});

describe("identity(): a logo found in storage (a second reading)", () => {
  it("returns the surface the asset already carries and never measures again", async () => {
    const t = setup({ "https://example.com/print.png": await print() });
    t.rows.set(`ws-1:${keyOf(LOGO_URL)}`, { id: "cached", key: keyOf(LOGO_URL), width: 300, height: 200, metadata: { surface: "dark", provisional: true } });
    await t.storage.put(keyOf(LOGO_URL), await sharp(await block(300, 200, WHITE).png().toBuffer()).toBuffer(), "image/png");
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo).toMatchObject({ assetId: "cached", surface: "dark" });
    expect(measureSpy).not.toHaveBeenCalled();
    expect(t.download).not.toHaveBeenCalledWith(LOGO_URL, expect.anything());
    expect(t.seen[0]).toMatchObject({ logoBackdrop: "#17191d" });
  });

  it.each([[null], [{}], [{ surface: "purple" }], [{ surface: "DARK" }], [{ surface: 1 }]] as unknown[][])("an old asset with metadata %j and light ink is measured from what is stored and keeps the answer with its asset", async metadata => {
    const t = setup({ "https://example.com/print.png": await print() });
    t.rows.set(`ws-1:${keyOf(LOGO_URL)}`, { id: "old", key: keyOf(LOGO_URL), width: 300, height: 200, metadata });
    await t.storage.put(keyOf(LOGO_URL), await block(300, 200, WHITE).png().toBuffer(), "image/png");
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo).toMatchObject({ assetId: "old", surface: "dark" });
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(t.updates).toEqual([{ assetId: "old", metadata: { surface: "dark" } }]);
    expect(t.rows.get(`ws-1:${keyOf(LOGO_URL)}`)!.metadata).toMatchObject({ surface: "dark" });
    expect(t.seen[0]).toMatchObject({ logoBackdrop: "#17191d" });
  });
  it("a store that does not say what the asset holds (metadata undefined): the item has the answer, and there is nothing to update", async () => {
    const t = setup({ "https://example.com/print.png": await print() });
    t.rows.set(`ws-1:${keyOf(LOGO_URL)}`, { id: "old", key: keyOf(LOGO_URL), width: 300, height: 200, metadata: undefined });
    await t.storage.put(keyOf(LOGO_URL), await block(300, 200, WHITE).png().toBuffer(), "image/png");
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo?.surface).toBe("dark");
    expect(t.updates).toEqual([]);
  });
  it("an old asset with dark ink is measured light and keeps that too", async () => {
    const t = setup({ "https://example.com/print.png": await print() });
    t.rows.set(`ws-1:${keyOf(LOGO_URL)}`, { id: "old", key: keyOf(LOGO_URL), width: 300, height: 200, metadata: {} });
    await t.storage.put(keyOf(LOGO_URL), await block(300, 200, BLACK).png().toBuffer(), "image/png");
    const result = await t.enrichment.identity(site(), context);
    expect(result.branding?.logo?.surface).toBe("light");
    expect(t.updates).toEqual([{ assetId: "old", metadata: { surface: "light" } }]);
    expect("logoBackdrop" in t.seen[0]!).toBe(false);
  });
});

describe("images(): an image found in storage never reports a surface", () => {
  it("even if its metadata carries one (only a logo asks for it)", async () => {
    const url = "https://example.com/hero.png";
    const t = setup({});
    t.rows.set(`ws-1:${keyOf(url)}`, { id: "cached-image", key: keyOf(url), width: 800, height: 600, metadata: { surface: "dark" } });
    const result = await t.enrichment.images(site({ images: [{ url }] as SiteReadResult["images"] }), context);
    expect(result.images![0]).toMatchObject({ assetId: "cached-image" });
    expect("surface" in result.images![0]!).toBe(false);
  });
});

describe("images(): nothing but the logo is measured", () => {
  it("a transparent light PNG offered as a site image keeps its metadata free of surface and is never measured", async () => {
    const url = "https://example.com/hero.png";
    const t = setup({ [url]: await pngEntry(block(800, 600, WHITE)) });
    const result = await t.enrichment.images(site({ images: [{ url }] as SiteReadResult["images"] }), context);
    expect(result.images).toHaveLength(1);
    expect("surface" in result.images![0]!).toBe(false);
    expect(t.saved.find(a => a.name === "site_image")!.metadata).not.toHaveProperty("surface");
    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("the screenshot is never measured: only the logo is, once", async () => {
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, WHITE)), "https://example.com/print.png": await print() });
    await t.enrichment.identity(site(), context);
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(t.saved.find(a => a.name === "site_screenshot")!.metadata).not.toHaveProperty("surface");
    expect(t.saved.find(a => a.name === "site_vision")!.metadata).not.toHaveProperty("surface");
  });
});

describe("identity(): what the palette step still does", () => {
  it("logoConfirmed false still takes the logo out of the result, whatever its surface", async () => {
    const withShot = createSiteEnrichment({
      storage: new InMemoryObjectStorage(), download: (async (url: string) => (url.endsWith("print.png") ? print() : pngEntry(block(300, 200, WHITE)))) as never,
      saveAsset: async data => ({ id: "a", key: data.key, width: data.width ?? null, height: data.height ?? null }), findAsset: async () => null,
      vision: () => async () => ({ logoConfirmed: false, colors: ["#123456"], fonts: [] }),
    });
    const second = await withShot.identity(site(), context);
    expect(second.branding?.logo).toBeUndefined();
    expect(second.branding?.colors).toEqual(["#123456"]);
  });

  it("the vision is called once, with the keys, fonts and colors it always got, and its answer keeps the same contract", async () => {
    const t = setup({ [LOGO_URL]: await pngEntry(block(300, 200, solid("#ffffff"))), "https://example.com/print.png": await print() });
    const result = await t.enrichment.identity(site(), context);
    expect(t.visionCalls).toHaveBeenCalledTimes(1);
    expect(Object.keys(t.seen[0]!).sort()).toEqual(["colors", "fonts", "logoBackdrop", "logoKey", "screenshotKey", "signal"]);
    expect(t.seen[0]).toMatchObject({ colors: ["#0000EE"], fonts: ["Inter"] });
    expect(siteVisionSchema.safeParse({ logoConfirmed: true, colors: [], fonts: [] }).success).toBe(true);
    expect(siteVisionSchema.safeParse({ logoConfirmed: true, colors: [], fonts: [], surface: "dark" }).success).toBe(false);
    expect(result.branding?.colors).toEqual(["#111111", "#222222"]);
  });
});
