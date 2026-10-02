import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { MIN_LOGO_SHORT_SIDE_PX, MIN_SITE_IMAGE_SHORT_SIDE_PX } from "./image-import";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import type { SiteReadResult } from "./readers";
import type { SiteVision } from "./site-vision";
import type { CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";

async function jpeg(width = 200, height = 150) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 200 } } }).jpeg({ quality: 85 }).toBuffer();
}
/** Valid JPEG header (sharp's metadata() succeeds), but the body is cut short — only a FULL decode catches it. */
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

function fakeVisionFactory(
  result: SiteVision extends (input: infer I) => Promise<infer R> ? R | Error : never,
  capture: { context?: SiteReadingContext; input?: Parameters<SiteVision>[0] } = {},
) {
  return (context: SiteReadingContext): SiteVision => {
    capture.context = context;
    return async (input) => {
      capture.input = input;
      if (result instanceof Error) throw result;
      return result;
    };
  };
}

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };
const visionOk = { logoConfirmed: true as boolean | null, colors: ["#111111", "#222222", "#333333"], fonts: ["Inter"] };

function baseData(overrides: Partial<SiteReadResult> = {}): SiteReadResult {
  return {
    title: "T", siteName: "Marca", markdown: "md", links: [], statusCode: 200,
    images: [], screenshotUrl: "https://example.com/print.png",
    branding: { logo: { url: "https://example.com/logo.png" }, colors: ["#0000EE"], fonts: ["Inter"] },
    ...overrides,
  };
}

describe("createSiteEnrichment.identity", () => {
  it("stores the first working logo candidate and stops trying further ones", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download, calls } = fakeDownloader({ "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" }, "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.logo?.url).toBe("https://example.com/logo.png");
    expect(result.branding?.logo?.key).toBeDefined();
    expect(calls.filter((u) => u === "https://example.com/logo.png")).toHaveLength(1);
    expect(result.groupErrors?.logo).toBeUndefined();
  });

  it("tries the next raster candidate when an earlier one fails, up to 3 candidates", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download, calls } = fakeDownloader({
      "https://example.com/logo.png": new Error("404"),
      "https://cdn.example.com/alt1.png": new Error("timeout"),
      "https://cdn.example.com/alt2.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const data = baseData({ logoCandidates: ["https://cdn.example.com/alt1.png", "https://cdn.example.com/alt2.png", "https://cdn.example.com/alt3-never-tried.png"] });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(data, context);
    expect(result.branding?.logo?.url).toBe("https://cdn.example.com/alt2.png");
    expect(calls).not.toContain("https://cdn.example.com/alt3-never-tried.png");
  });

  it("marks logo_download_failed only when candidates existed and all of them failed", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": new Error("404"),
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.logo).toBeUndefined();
    expect(result.groupErrors?.logo).toBe("logo_download_failed");
  });

  it("does not report logo_download_failed when there was no logo candidate to begin with", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context);
    expect(result.branding?.logo).toBeUndefined();
    expect(result.groupErrors?.logo).toBeUndefined();
  });

  it("dedupes the branding logo against logoCandidates and caps at 3 attempts", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download, calls } = fakeDownloader({
      "https://example.com/logo.png": new Error("404"),
      "https://cdn.example.com/a.png": new Error("404"),
      "https://cdn.example.com/b.png": new Error("404"),
      "https://cdn.example.com/c.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const data = baseData({ logoCandidates: ["https://example.com/logo.png", "https://cdn.example.com/a.png", "https://cdn.example.com/b.png", "https://cdn.example.com/c.png"] });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    await enrichment.identity(data, context);
    const logoAttempts = calls.filter((u) => u !== "https://example.com/print.png");
    expect(logoAttempts).toEqual(["https://example.com/logo.png", "https://cdn.example.com/a.png", "https://cdn.example.com/b.png"]);
    expect(logoAttempts).not.toContain("https://cdn.example.com/c.png");
  });

  it("skips vision and clears colors when there is no screenshot to analyze", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const capture: { context?: SiteReadingContext; input?: unknown } = {};
    const { fn: download } = fakeDownloader({ "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk, capture), download });
    const result = await enrichment.identity(baseData({ screenshotUrl: null }), context);
    expect(result.branding?.colors).toEqual([]);
    expect(result.groupErrors?.colors).toBe("site_vision_failed");
    expect(capture.input).toBeUndefined();
  });

  it("clears colors and marks site_vision_failed when the screenshot fails to download", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": new Error("timeout"),
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.colors).toEqual([]);
    expect(result.groupErrors?.colors).toBe("site_vision_failed");
    // The screenshot never made it to storage, but a successfully downloaded
    // logo from the SAME call still did — a corner case worth flagging: a
    // failed identity() group can leave partial assets behind.
    expect(store.saved.some((s) => s.name === "site_logo")).toBe(true);
    expect(store.saved.some((s) => s.name === "site_screenshot")).toBe(false);
  });

  describe("the cause of a failed palette is logged, not swallowed (ticket 13, D-2)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("names the provider's refusal (status, type, request id, the parameter path, the reason) and nothing of the call or of its words", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const store = fakeAssetStore();
      const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
      const refusal = Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "output_config.format.schema: property 'maxItems' is not supported" } },
        undefined, new Headers({ "request-id": "req_011Cfc9G7WWwEUwQG75Munpv" }));
      const enrichment = createSiteEnrichment({ storage: new InMemoryObjectStorage(), ...store, vision: fakeVisionFactory(refusal), download });
      const result = await enrichment.identity(baseData(), context);
      expect(result.groupErrors?.colors).toBe("site_vision_failed");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("[equipe-handoff] palette vision failed", {
        source: "site", readingId: "reading-1", kind: "provider_rejected", status: 400, type: "invalid_request_error",
        requestId: "req_011Cfc9G7WWwEUwQG75Munpv", param: "output_config.format.schema", reason: "schema_unsupported",
      });
    });

    it("names our own error code when the failure was local, and only the error's name when its message is not a code", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const store = fakeAssetStore();
      const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
      await createSiteEnrichment({ storage: new InMemoryObjectStorage(), ...store, vision: fakeVisionFactory(new Error("budget_exceeded")), download }).identity(baseData(), context);
      await createSiteEnrichment({ storage: new InMemoryObjectStorage(), ...store, vision: fakeVisionFactory(new Error("Unexpected content: the brand is https://x.example/y")), download }).identity(baseData(), context);
      expect(warn.mock.calls.map(([, detail]) => (detail as { message: string }).message)).toEqual(["Error: budget_exceeded", "Error"]);
    });

    it("stays quiet when the vision worked", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
      const store = fakeAssetStore();
      const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
      await createSiteEnrichment({ storage: new InMemoryObjectStorage(), ...store, vision: fakeVisionFactory(visionOk), download }).identity(baseData(), context);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("clears colors and marks site_vision_failed when the vision model call itself rejects", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(new Error("free_call_unbounded")), download });
    const result = await enrichment.identity(baseData({ branding: { fonts: ["Inter"], colors: [] } }), context);
    expect(result.branding?.colors).toEqual([]);
    expect(result.groupErrors?.colors).toBe("site_vision_failed");
    // Fonts are only touched on a SUCCESSFUL vision result — a failed call
    // leaves the supplier's own font candidates untouched.
    expect(result.branding?.fonts).toEqual(["Inter"]);
  });

  it("normalizes the logo from OUR stored bytes (never refetches the original URL) and calls vision with both keys", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const capture: { context?: SiteReadingContext; input?: Parameters<SiteVision>[0] } = {};
    const { fn: download, calls } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(300, 300), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(800, 600), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk, capture), download });
    const result = await enrichment.identity(baseData(), context);
    expect(capture.input?.logoKey).toContain("-vision.jpg");
    expect(capture.input?.screenshotKey).toBeDefined();
    // Exactly 2 remote downloads happened (logo once, screenshot once, run
    // concurrently — no ordering guarantee between them); the logo
    // normalization for vision reused the stored bytes via storage.get.
    expect(calls.slice().sort()).toEqual(["https://example.com/logo.png", "https://example.com/print.png"]);
    expect(store.saved.some((s) => s.name === "site_vision" && s.key.endsWith("-vision.jpg"))).toBe(true);
    expect(result.branding?.colors).toEqual(visionOk.colors);
  });

  it("calls vision without a logoKey when no logo was captured", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const capture: { context?: SiteReadingContext; input?: Parameters<SiteVision>[0] } = {};
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": new Error("404"),
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk, capture), download });
    await enrichment.identity(baseData(), context);
    expect(capture.input?.logoKey).toBeUndefined();
  });

  it("drops the logo when vision reports logoConfirmed=false, even though the download succeeded", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory({ ...visionOk, logoConfirmed: false }), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.logo).toBeUndefined();
  });

  it("keeps the logo when vision returns logoConfirmed=null (uncertain, not rejected)", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory({ ...visionOk, logoConfirmed: null }), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.logo?.url).toBe("https://example.com/logo.png");
  });

  it("keeps the supplier fonts when vision returns an empty fonts array", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/jpeg" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory({ ...visionOk, fonts: [] }), download });
    const result = await enrichment.identity(baseData({ branding: { fonts: ["Poppins"], colors: [] } }), context);
    expect(result.branding?.fonts).toEqual(["Poppins"]);
  });

  it("reuses a previously stored asset for the same URL instead of downloading again", async () => {
    const store = fakeAssetStore();
    // Pre-seed the exact key importImage would compute for this URL+context, mirroring a resumed/retried reading.
    const storage = new InMemoryObjectStorage();
    const { fn: download, calls } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    // First run stores the screenshot (and there is no logo candidate here).
    await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context);
    expect(calls.filter((u) => u === "https://example.com/print.png")).toHaveLength(1);
    // Second run for the SAME context/url must hit the asset cache, not the network.
    await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context);
    expect(calls.filter((u) => u === "https://example.com/print.png")).toHaveLength(1);
  });

  it("passes the reading context through to the vision factory", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const capture: { context?: SiteReadingContext } = {};
    const { fn: download } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk, capture), download });
    await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context);
    expect(capture.context).toEqual(context);
  });

  it("rejects bytes whose decoded format does not match the declared content-type", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    // Real JPEG bytes mislabeled as PNG: sharp decodes "jpeg", the reader's contentType says "image/png".
    const { fn: download } = fakeDownloader({
      "https://example.com/logo.png": { bytes: await jpeg(), contentType: "image/png" },
      "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.identity(baseData(), context);
    expect(result.branding?.logo).toBeUndefined();
    expect(result.groupErrors?.logo).toBe("logo_download_failed");
  });
});

describe("a site's logo and images must measure up (ticket 13, D-8)", () => {
  const png = (width: number, height: number) => jpeg(width, height);
  const logoData = (urls: string[]) => baseData({ branding: { colors: [], fonts: [] }, logoCandidates: urls });
  const run = async (entries: Record<string, DownloadEntry>) => {
    const store = fakeAssetStore();
    const { fn: download, calls } = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" }, ...entries });
    const enrichment = createSiteEnrichment({ storage: new InMemoryObjectStorage(), ...store, vision: fakeVisionFactory(visionOk), download });
    return { store, calls, enrichment };
  };
  const ok = async (width: number, height: number): Promise<DownloadEntry> => ({ bytes: await png(width, height), contentType: "image/jpeg" });

  it("the limits are the agreed ones: 100 px for a logo, 500 px for an image, on the shorter side", () => {
    expect(MIN_LOGO_SHORT_SIDE_PX).toBe(100);
    expect(MIN_SITE_IMAGE_SHORT_SIDE_PX).toBe(500);
  });

  describe("logo: an icon is never the logo", () => {
    it("drops a 32×32 favicon BEFORE storing it and takes the next candidate that is decent", async () => {
      const { store, enrichment } = await run({ "https://example.com/favicon-32x32.png": await ok(32, 32), "https://example.com/share.png": await ok(1236, 888) });
      const result = await enrichment.identity(logoData(["https://example.com/favicon-32x32.png", "https://example.com/share.png"]), context);
      expect(result.branding?.logo?.url).toBe("https://example.com/share.png");
      expect(result.groupErrors?.logo).toBeUndefined();
      expect(store.saved.filter((a) => a.name === "site_logo").map((a) => a.width)).toEqual([1236]);
    });

    it("with only icons it finds no logo: the reason is logo_too_small, and nothing was stored for them", async () => {
      const { store, enrichment } = await run({ "https://example.com/favicon-32x32.png": await ok(32, 32), "https://example.com/wa-icon.png": await ok(48, 48) });
      const result = await enrichment.identity(logoData(["https://example.com/favicon-32x32.png", "https://example.com/wa-icon.png"]), context);
      expect(result.branding?.logo).toBeUndefined();
      expect(result.groupErrors?.logo).toBe("logo_too_small");
      expect(store.saved.some((a) => a.name === "site_logo")).toBe(false);
    });

    it("a candidate that could not be fetched keeps it a download failure, even next to icons", async () => {
      const { enrichment } = await run({ "https://example.com/favicon-32x32.png": await ok(32, 32), "https://example.com/gone.png": new Error("404") });
      const result = await enrichment.identity(logoData(["https://example.com/favicon-32x32.png", "https://example.com/gone.png"]), context);
      expect(result.groupErrors?.logo).toBe("logo_download_failed");
    });

    it("the boundary is the shorter side: 99 is too small, 100 is enough, in either orientation", async () => {
      const { enrichment } = await run({
        "https://example.com/a.png": await ok(99, 800), "https://example.com/b.png": await ok(800, 99),
        "https://example.com/c.png": await ok(100, 800), "https://example.com/d.png": await ok(800, 100),
      });
      expect((await enrichment.identity(logoData(["https://example.com/a.png", "https://example.com/b.png"]), context)).groupErrors?.logo).toBe("logo_too_small");
      expect((await enrichment.identity(logoData(["https://example.com/c.png"]), context)).branding?.logo?.url).toBe("https://example.com/c.png");
      expect((await enrichment.identity(logoData(["https://example.com/d.png"]), context)).branding?.logo?.url).toBe("https://example.com/d.png");
    });

    describe("a site whose only logo is an SVG or an ICO file", () => {
      it("downloads nothing, finds no logo, and says why (not a download failure): the card asks for the file", async () => {
        const { store, calls, enrichment } = await run({});
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/favicon.ico", "https://example.com/Logo.SVG?v=3"]), context);
        expect(result.branding?.logo).toBeUndefined();
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(calls.filter((url) => /logo|favicon/i.test(url))).toEqual([]);
        expect(store.saved.some((asset) => asset.name === "site_logo")).toBe(false);
      });

      it("the logo the reader itself found counts the same", async () => {
        const { enrichment } = await run({});
        const result = await enrichment.identity(baseData({ branding: { logo: { url: "https://example.com/assets/logo.svg" }, colors: [], fonts: [] } }), context);
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
      });

      it("next to a raster candidate the raster decides: too small stays logo_too_small, one that could not be fetched stays a download failure, a decent one is the logo", async () => {
        const small = await run({ "https://example.com/favicon-32x32.png": await ok(32, 32) });
        expect((await small.enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/favicon-32x32.png"]), context)).groupErrors?.logo).toBe("logo_too_small");
        const broken = await run({ "https://example.com/gone.png": new Error("404") });
        expect((await broken.enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/gone.png"]), context)).groupErrors?.logo).toBe("logo_download_failed");
        const decent = await run({ "https://example.com/share.png": await ok(1236, 888) });
        const result = await decent.enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/share.png"]), context);
        expect(result.branding?.logo?.url).toBe("https://example.com/share.png");
        expect(result.groupErrors?.logo).toBeUndefined();
      });

      it("a logo entry without an address is not an SVG: it stays the download failure it always was", async () => {
        const { enrichment } = await run({});
        const result = await enrichment.identity(baseData({ branding: { logo: { url: "" }, colors: [], fonts: [] } }), context);
        expect(result.groupErrors?.logo).toBe("logo_download_failed");
      });

      it("no candidate at all is still no error (nothing was found, nothing is asked)", async () => {
        const { enrichment } = await run({});
        expect((await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context)).groupErrors?.logo).toBeUndefined();
      });
    });

    it("keeps the candidates' order: a decent first one wins over a bigger later one", async () => {
      const { enrichment, calls } = await run({ "https://example.com/first.png": await ok(180, 180), "https://example.com/bigger.png": await ok(2000, 2000) });
      const result = await enrichment.identity(logoData(["https://example.com/first.png", "https://example.com/bigger.png"]), context);
      expect(result.branding?.logo?.url).toBe("https://example.com/first.png");
      expect(calls).not.toContain("https://example.com/bigger.png");
    });
  });

  it("a copy stored earlier by a reading that did not measure is not reused when it is too small", async () => {
    const { createHash } = await import("node:crypto");
    const smallUrl = "https://example.com/old-favicon.png";
    const stale = { id: "stale-asset", key: "", width: 32, height: 32 };
    const download = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" }, "https://example.com/good.png": await ok(400, 400) });
    const store = fakeAssetStore();
    const enrichment = createSiteEnrichment({
      storage: new InMemoryObjectStorage(), saveAsset: store.saveAsset, vision: fakeVisionFactory(visionOk), download: download.fn,
      findAsset: async (workspaceId, key) => key.endsWith(createHash("sha256").update(smallUrl).digest("hex")) ? { ...stale, key } : store.findAsset(workspaceId, key),
    });
    const result = await enrichment.identity(logoData([smallUrl, "https://example.com/good.png"]), context);
    expect(result.branding?.logo?.url).toBe("https://example.com/good.png");
    expect(download.calls).not.toContain(smallUrl);
  });

  describe("images: thumbnails and icons are not offered", () => {
    const imagesOf = (...urls: string[]) => baseData({ images: urls.map((url) => ({ url })) });

    it("keeps only what measures 500 px on its shorter side, and stores only that", async () => {
      const { store, enrichment } = await run({
        "https://example.com/big.png": await ok(1000, 800), "https://example.com/thumb.png": await ok(172, 276), "https://example.com/edge.png": await ok(500, 1200),
        "https://example.com/under.png": await ok(1200, 499), "https://example.com/icon.png": await ok(64, 64),
      });
      const result = await enrichment.images(imagesOf("https://example.com/big.png", "https://example.com/thumb.png", "https://example.com/edge.png", "https://example.com/under.png", "https://example.com/icon.png"), context);
      expect(result.images?.map((i) => i.url).sort()).toEqual(["https://example.com/big.png", "https://example.com/edge.png"]);
      expect(result.groupErrors).toBeUndefined();
      expect(store.saved.filter((a) => a.name === "site_image")).toHaveLength(2);
    });

    it("when everything found is small the images are NOT FOUND (images_too_small), not a failed reading", async () => {
      const { store, enrichment } = await run({ "https://example.com/a.png": await ok(172, 276), "https://example.com/b.png": await ok(300, 300) });
      const result = await enrichment.images(imagesOf("https://example.com/a.png", "https://example.com/b.png"), context);
      expect(result.images).toEqual([]);
      expect(result.groupErrors).toEqual({ images: "images_too_small" });
      expect(store.saved.some((a) => a.name === "site_image")).toBe(false);
    });

    it("a fetch that failed next to small images is still a download failure", async () => {
      const { enrichment } = await run({ "https://example.com/a.png": await ok(172, 276), "https://example.com/gone.png": new Error("timeout") });
      const result = await enrichment.images(imagesOf("https://example.com/a.png", "https://example.com/gone.png"), context);
      expect(result.groupErrors).toEqual({ images: "image_download_failed" });
    });

    it("22 small images and 4 big ones (the real Café Orfeu) leave the 4", async () => {
      const entries: Record<string, DownloadEntry> = {};
      const urls = Array.from({ length: 26 }, (_, i) => `https://example.com/i${i}.png`);
      for (const [i, url] of urls.entries()) entries[url] = i % 7 === 0 ? await ok(1000 + i, 900) : await ok(172, 276);
      const { enrichment } = await run(entries);
      const result = await enrichment.images(imagesOf(...urls), context);
      expect(result.images).toHaveLength(4);
      expect(result.groupErrors).toBeUndefined();
    });
  });
});

describe("createSiteEnrichment.images", () => {
  const withImages = (urls: string[]) => baseData({ images: urls.map((url) => ({ url })) });

  it("downloads every candidate up to 26 and stores each one", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/img-${i}.png`);
    const entries = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, { bytes: await jpeg(600, 600), contentType: "image/jpeg" }] as const)));
    const { fn: download } = fakeDownloader(entries);
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages(urls), context);
    expect(result.images).toHaveLength(5);
    expect(result.groupErrors?.images).toBeUndefined();
    expect(store.saved.filter((s) => s.name === "site_image")).toHaveLength(5);
  });

  it("caps at 26 candidates even when more are offered", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/img-${i}.png`);
    const entries = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, { bytes: await jpeg(600, 600), contentType: "image/jpeg" }] as const)));
    const { fn: download, calls } = fakeDownloader(entries);
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    await enrichment.images(withImages(urls), context);
    expect(new Set(calls).size).toBe(26);
  });

  it("downloads at most 3 images in parallel", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = Array.from({ length: 8 }, (_, i) => `https://example.com/img-${i}.png`);
    const entries = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, { bytes: await jpeg(600, 600), contentType: "image/jpeg" }] as const)));
    const { fn: download, maxInFlight } = fakeDownloader(entries, 10);
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    await enrichment.images(withImages(urls), context);
    expect(maxInFlight()).toBe(3);
  });

  it("isolates a single failing image: the rest still land, and no groupError is set when at least one succeeds", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = ["https://example.com/ok-1.png", "https://example.com/bad.png", "https://example.com/ok-2.png"];
    const { fn: download } = fakeDownloader({
      "https://example.com/ok-1.png": { bytes: await jpeg(600, 600), contentType: "image/jpeg" },
      "https://example.com/bad.png": new Error("image_http_error"),
      "https://example.com/ok-2.png": { bytes: await jpeg(600, 600), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages(urls), context);
    expect(result.images.map((i) => i.url).sort()).toEqual(["https://example.com/ok-1.png", "https://example.com/ok-2.png"]);
    expect(result.groupErrors?.images).toBeUndefined();
  });

  it("isolates corrupt/undecodable bytes as a single failure among many", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = ["https://example.com/ok.png", "https://example.com/corrupt.png"];
    const { fn: download } = fakeDownloader({
      "https://example.com/ok.png": { bytes: await jpeg(600, 600), contentType: "image/jpeg" },
      "https://example.com/corrupt.png": { bytes: Buffer.from("not-an-image-at-all"), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages(urls), context);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe("https://example.com/ok.png");
  });

  it("rejects a truncated file whose HEADER still decodes (metadata succeeds) but whose body does not survive a full decode", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = ["https://example.com/ok.png", "https://example.com/truncated.png"];
    const { fn: download } = fakeDownloader({
      "https://example.com/ok.png": { bytes: await jpeg(600, 600), contentType: "image/jpeg" },
      "https://example.com/truncated.png": { bytes: await truncatedJpeg(800, 700), contentType: "image/jpeg" },
    });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages(urls), context);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.url).toBe("https://example.com/ok.png");
  });

  it("reports image_download_failed only when every candidate failed", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const urls = ["https://example.com/a.png", "https://example.com/b.png"];
    const { fn: download } = fakeDownloader({ "https://example.com/a.png": new Error("x"), "https://example.com/b.png": new Error("y") });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages(urls), context);
    expect(result.images).toEqual([]);
    expect(result.groupErrors?.images).toBe("image_download_failed");
  });

  it("returns no images and no groupError when there were no candidates", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const { fn: download } = fakeDownloader({});
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages([]), context);
    expect(result.images).toEqual([]);
    expect(result.groupErrors?.images).toBeUndefined();
  });

  it("stores the original raster at its own resolution (no forced resize, unlike the vision copy)", async () => {
    const store = fakeAssetStore();
    const storage = new InMemoryObjectStorage();
    const url = "https://example.com/big.png";
    const { fn: download } = fakeDownloader({ [url]: { bytes: await jpeg(1600, 1200), contentType: "image/jpeg" } });
    const enrichment = createSiteEnrichment({ storage, ...store, vision: fakeVisionFactory(visionOk), download });
    const result = await enrichment.images(withImages([url]), context);
    expect(result.images[0]).toMatchObject({ width: 1600, height: 1200 });
    const saved = store.saved.find((s) => s.name === "site_image")!;
    expect(saved.type).toBe("image/jpeg"); // not forced to image/jpeg-vision-normalized
  });
});
