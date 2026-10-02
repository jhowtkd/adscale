import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { MIN_LOGO_SHORT_SIDE_PX, MIN_SITE_IMAGE_SHORT_SIDE_PX } from "./image-import";
import { MAX_SVG_BYTES, SvgLogoError } from "./svg-sanitize";
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
type StoredAsset = { id: string; key: string; width: number | null; height: number | null; metadata?: unknown };

function fakeAssetStore() {
  const rows = new Map<string, StoredAsset>();
  let counter = 0;
  const saved: CreateWorkspaceAssetInput[] = [];
  const saveAsset = vi.fn(async (data: CreateWorkspaceAssetInput) => {
    saved.push(data);
    // The row comes back with its metadata, as the real table's rows do (what a later reading finds under the same key).
    const row: StoredAsset = { id: `asset-${++counter}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata };
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
  const options = new Map<string, unknown>();
  const fn = async (url: string, asked?: unknown) => {
    calls.push(url);
    options.set(url, asked);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    inFlight--;
    const entry = entries[url];
    if (!entry) throw new Error(`no fixture for ${url}`);
    if (entry instanceof Error) throw entry;
    return entry;
  };
  return { fn, calls, options, maxInFlight: () => maxInFlight };
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

    describe("a site whose only logo is an ICO file, or an SVG that cannot be read", () => {
      const BAD_SVG = { bytes: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>`), contentType: "image/svg+xml" };

      it("an .ico is never downloaded: no logo, and the reason is not a download failure (the card asks for the file)", async () => {
        const { store, calls, enrichment } = await run({});
        const result = await enrichment.identity(logoData(["https://example.com/favicon.ico", "https://example.com/Favicon.ICO?v=3"]), context);
        expect(result.branding?.logo).toBeUndefined();
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(calls.filter((url) => /favicon/i.test(url))).toEqual([]);
        expect(store.saved.some((asset) => asset.name === "site_logo")).toBe(false);
      });

      it("the logo the reader itself found counts the same", async () => {
        const { calls, enrichment } = await run({});
        const result = await enrichment.identity(baseData({ branding: { logo: { url: "https://example.com/assets/logo.ico" }, colors: [], fonts: [] } }), context);
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(calls).not.toContain("https://example.com/assets/logo.ico");
      });

      it("next to a raster candidate the raster decides: too small stays logo_too_small, one that could not be fetched stays a download failure, a decent one is the logo", async () => {
        const small = await run({ "https://example.com/favicon-32x32.png": await ok(32, 32) });
        expect((await small.enrichment.identity(logoData(["https://example.com/logo.ico", "https://example.com/favicon-32x32.png"]), context)).groupErrors?.logo).toBe("logo_too_small");
        const broken = await run({ "https://example.com/gone.png": new Error("404") });
        expect((await broken.enrichment.identity(logoData(["https://example.com/logo.ico", "https://example.com/gone.png"]), context)).groupErrors?.logo).toBe("logo_download_failed");
        const decent = await run({ "https://example.com/share.png": await ok(1236, 888) });
        const result = await decent.enrichment.identity(logoData(["https://example.com/logo.ico", "https://example.com/share.png"]), context);
        expect(result.branding?.logo?.url).toBe("https://example.com/share.png");
        expect(result.groupErrors?.logo).toBeUndefined();
      });

      it("an SVG that cannot be drawn is a logo not found (logo_unsupported_format), never a failed download, and nothing is stored for it", async () => {
        const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
        const { store, calls, enrichment } = await run({ "https://example.com/logo.svg": BAD_SVG });
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
        expect(result.branding?.logo).toBeUndefined();
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(calls).toContain("https://example.com/logo.svg"); // It is tried now: only the .ico is skipped.
        expect(store.saved.some((asset) => asset.name === "site_logo")).toBe(false);
        // The reason is logged by its code, and the log carries nothing of the file.
        expect(info).toHaveBeenCalledWith("[equipe-handoff] svg logo not used", { readingId: "reading-1", reason: "svg_empty" });
        info.mockRestore();
      });

      it.each([
        ["scripts only (nothing to draw)", BAD_SVG.bytes],
        ["malformed", Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g><rect width="5" height="5"/>`)],
        ["not an SVG at all", Buffer.from("<html><body>an error page that says svg</body></html>")],
        ["a 'billion laughs' file", Buffer.from(`<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">]><svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="0" y="30">&lol2;</text></svg>`)],
        ["an external entity", Buffer.from(`<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="0" y="30">&xxe;</text></svg>`)],
        ["with no size", Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`)],
        ["too deep", Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${"<g>".repeat(200)}<rect width="5" height="5"/>${"</g>".repeat(200)}</svg>`)],
        ["past the size limit", Buffer.alloc(MAX_SVG_BYTES + 1)],
      ])("an SVG that is %s: not found, not a download failure, nothing stored", async (_name, bytes) => {
        const { store, enrichment } = await run({ "https://example.com/logo.svg": { bytes, contentType: "image/svg+xml" } });
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
        expect(result.branding?.logo).toBeUndefined();
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(store.saved.some((asset) => asset.name === "site_logo")).toBe(false);
      });

      it("an unreadable SVG next to a candidate that could not be fetched stays a download failure; next to an icon that was too small it stays unsupported", async () => {
        const broken = await run({ "https://example.com/logo.svg": BAD_SVG, "https://example.com/gone.png": new Error("404") });
        expect((await broken.enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/gone.png"]), context)).groupErrors?.logo).toBe("logo_download_failed");
        const small = await run({ "https://example.com/logo.svg": BAD_SVG, "https://example.com/favicon-32x32.png": await ok(32, 32) });
        expect((await small.enrichment.identity(logoData(["https://example.com/favicon-32x32.png", "https://example.com/logo.svg"]), context)).groupErrors?.logo).toBe("logo_unsupported_format");
      });

      it("an unreadable SVG next to a good PNG: the PNG is the logo, and no error is left", async () => {
        const { store, calls, enrichment } = await run({ "https://example.com/logo.svg": BAD_SVG, "https://example.com/share.png": await ok(1236, 888) });
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/share.png"]), context);
        expect(result.branding?.logo?.url).toBe("https://example.com/share.png");
        expect(result.groupErrors?.logo).toBeUndefined();
        expect(calls.indexOf("https://example.com/logo.svg")).toBeLessThan(calls.indexOf("https://example.com/share.png"));
        expect(store.saved.filter((asset) => asset.name === "site_logo")).toHaveLength(1);
      });

      it("any other unsupported type is still a download failure (the downloader says so with its own error)", async () => {
        const { enrichment } = await run({ "https://example.com/logo": new Error("image_type_unsupported") });
        expect((await enrichment.identity(logoData(["https://example.com/logo"]), context)).groupErrors?.logo).toBe("logo_download_failed");
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

  describe("a logo that is an SVG (ticket 15, item 2)", () => {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const wordmark = (size = 'width="240" height="80" viewBox="0 0 240 80"') => `<svg xmlns="http://www.w3.org/2000/svg" ${size}><circle cx="40" cy="40" r="30" fill="#c9573a"/><rect x="86" y="25" width="132" height="11" fill="#2b1a10"/></svg>`;
    const svgEntry = (text = wordmark()): DownloadEntry => ({ bytes: Buffer.from(text), contentType: "image/svg+xml" });
    const setup = async (entries: Record<string, DownloadEntry>, vision = fakeVisionFactory(visionOk)) => {
      const store = fakeAssetStore();
      const storage = new InMemoryObjectStorage();
      const downloader = fakeDownloader({ "https://example.com/print.png": { bytes: await jpeg(), contentType: "image/jpeg" }, ...entries });
      const enrichment = createSiteEnrichment({ storage, ...store, vision, download: downloader.fn as never });
      return { store, storage, downloader, enrichment };
    };
    afterEach(() => vi.restoreAllMocks());

    it("becomes a PNG: that is what is stored, as image/png, and branding.logo.key points to it", async () => {
      const { store, storage, enrichment } = await setup({ "https://example.com/logo.svg": svgEntry() });
      const result = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      expect(result.groupErrors?.logo).toBeUndefined();
      expect(result.branding?.logo?.url).toBe("https://example.com/logo.svg");
      const key = result.branding!.logo!.key!;
      expect(key).toBeTruthy();
      expect((await storage.get(key)).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect((await storage.head(key))?.contentType).toBe("image/png");
      const asset = store.saved.find((a) => a.name === "site_logo")!;
      expect(asset).toMatchObject({ key, type: "image/png", source: "brand_site", width: 1024, height: 341 });
      expect(asset.size).toBe((await storage.get(key)).length);
      expect(asset.metadata).toMatchObject({ convertedFrom: "svg", provisional: true, kind: "site_logo", originUrl: "https://example.com/logo.svg", handoffId: "handoff-1", readingId: "reading-1" });
      expect(result.branding?.logo).toMatchObject({ assetId: expect.any(String), width: 1024, height: 341 });
    });

    it("never keeps the SVG: no object of the logo's key, and no stored object is an SVG or has its type", async () => {
      const { store, storage, enrichment } = await setup({ "https://example.com/logo.svg": svgEntry() });
      await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      for (const key of storage.keys()) {
        expect((await storage.head(key))?.contentType, key).not.toBe("image/svg+xml");
        expect((await storage.get(key)).toString("utf8", 0, 200), key).not.toContain("<svg");
        expect(key).not.toMatch(/\.svg$/i);
      }
      expect(store.saved.some((a) => a.type === "image/svg+xml")).toBe(false);
    });

    it("the longest side is at most 1024 px, in either orientation, whatever size the file declares", async () => {
      const { store, enrichment } = await setup({
        "https://example.com/wide.svg": svgEntry(wordmark('width="100000" height="30000"')),
        "https://example.com/tall.svg": svgEntry(wordmark('viewBox="0 0 30 90"')),
      });
      await enrichment.identity(logoData(["https://example.com/wide.svg"]), context);
      await enrichment.identity(logoData(["https://example.com/tall.svg"]), context);
      const sizes = store.saved.filter((a) => a.name === "site_logo").map((a) => [a.width, a.height]);
      expect(sizes).toEqual([[1024, 307], [341, 1024]]);
    });

    it("is not 'too small' for being a 24 × 24 vector: a vector has no size in pixels (a 24 × 24 raster still is)", async () => {
      const { enrichment } = await setup({
        "https://example.com/tiny.svg": svgEntry(wordmark('width="24" height="24"')),
        "https://example.com/tiny.png": await ok(24, 24),
      });
      const vector = await enrichment.identity(logoData(["https://example.com/tiny.svg"]), context);
      expect(vector.groupErrors?.logo).toBeUndefined();
      expect(vector.branding?.logo?.width).toBe(1024);
      const raster = await enrichment.identity(logoData(["https://example.com/tiny.png"]), context);
      expect(raster.groupErrors?.logo).toBe("logo_too_small");
    });

    it("is accepted when the address does not say .svg, whether the server told it by its type or the downloader found it by its first bytes (both arrive as image/svg+xml)", async () => {
      const { store, enrichment } = await setup({ "https://example.com/logo": svgEntry(), "https://example.com/brand/mark?v=2": svgEntry(wordmark('width="100" height="100"')) });
      for (const address of ["https://example.com/logo", "https://example.com/brand/mark?v=2"]) {
        const result = await enrichment.identity(logoData([address]), context);
        expect(result.branding?.logo?.url, address).toBe(address);
        expect(result.groupErrors?.logo, address).toBeUndefined();
      }
      expect(store.saved.filter((a) => a.name === "site_logo" && a.type === "image/png")).toHaveLength(2);
    });

    it("is found in the logo the reader itself found, as in the candidates", async () => {
      const { enrichment } = await setup({ "https://example.com/assets/logo.svg": svgEntry() });
      const result = await enrichment.identity(baseData({ branding: { logo: { url: "https://example.com/assets/logo.svg" }, colors: [], fonts: [] } }), context);
      expect(result.branding?.logo?.key).toBeTruthy();
      expect(result.groupErrors?.logo).toBeUndefined();
    });

    it("an .ico is skipped without being downloaded and the SVG after it is the logo", async () => {
      const { enrichment, downloader } = await setup({ "https://example.com/logo.svg": svgEntry() });
      const result = await enrichment.identity(logoData(["https://example.com/favicon.ico", "https://example.com/logo.svg"]), context);
      expect(result.branding?.logo?.url).toBe("https://example.com/logo.svg");
      expect(downloader.calls).not.toContain("https://example.com/favicon.ico");
    });

    it("the key is stable: the same address gives the same key, and a second reading reuses the stored PNG without downloading it again", async () => {
      const { createHash } = await import("node:crypto");
      const { store, storage, enrichment, downloader } = await setup({ "https://example.com/logo.svg": svgEntry() });
      const first = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      const second = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      expect(first.branding?.logo?.key).toBe(`workspaces/ws-1/handoff/handoff-1/reading-1/${createHash("sha256").update("https://example.com/logo.svg").digest("hex")}`);
      expect(second.branding?.logo?.key).toBe(first.branding?.logo?.key);
      expect(second.branding?.logo?.assetId).toBe(first.branding?.logo?.assetId);
      expect(downloader.calls.filter((url) => url.endsWith("logo.svg"))).toHaveLength(1);
      expect(store.saved.filter((a) => a.name === "site_logo")).toHaveLength(1);
      expect(storage.keys().filter((k) => !k.endsWith("-vision.jpg") && k.includes("/handoff/")).length).toBeGreaterThan(0);
    });

    describe("a second reading of the same address (the stored drawing is found under its key)", () => {
      const WIDE = wordmark('viewBox="0 0 2000 100"'); // 20:1: drawn at 1024 × 51, a short side under the 100 px a raster logo needs.
      const keyOf = async (url: string) => `workspaces/ws-1/handoff/handoff-1/reading-1/${(await import("node:crypto")).createHash("sha256").update(url).digest("hex")}`;

      it("a wide SVG is still the logo the second time: not 'too small', not downloaded again, no error", async () => {
        const { store, enrichment, downloader } = await setup({ "https://example.com/wide.svg": svgEntry(WIDE) });
        const first = await enrichment.identity(logoData(["https://example.com/wide.svg"]), context);
        expect(first.groupErrors?.logo).toBeUndefined();
        expect(first.branding?.logo).toMatchObject({ width: 1024, height: 51 });
        expect(store.saved.find((a) => a.name === "site_logo")?.metadata).toMatchObject({ convertedFrom: "svg" });

        const second = await enrichment.identity(logoData(["https://example.com/wide.svg"]), context);
        expect(second.groupErrors?.logo).toBeUndefined();
        expect(second.branding?.logo?.key).toBe(first.branding?.logo?.key);
        expect(second.branding?.logo?.assetId).toBe(first.branding?.logo?.assetId);
        expect(downloader.calls.filter((url) => url.endsWith("wide.svg"))).toHaveLength(1);
        expect(store.saved.filter((a) => a.name === "site_logo")).toHaveLength(1);
      });

      it("the same scenario with a raster of a short side under 100 px found in storage is still logo_too_small, and an asset with no metadata is judged by its size", async () => {
        for (const metadata of [undefined, null, {}, { convertedFrom: "png" }, "svg", { convertedFrom: ["svg"] }] as unknown[]) {
          const { store, enrichment, downloader } = await setup({});
          const url = "https://example.com/small-logo.png";
          store.rows.set(`ws-1:${await keyOf(url)}`, { id: "cached", key: await keyOf(url), width: 400, height: 50, metadata });
          const result = await enrichment.identity(logoData([url]), context);
          expect(result.branding?.logo, JSON.stringify(metadata)).toBeUndefined();
          expect(result.groupErrors?.logo, JSON.stringify(metadata)).toBe("logo_too_small");
          expect(downloader.calls, JSON.stringify(metadata)).not.toContain(url);
        }
      });

      it("a cached drawing of an SVG is the logo whatever size it has, found by what the first import stored (convertedFrom)", async () => {
        const { store, enrichment } = await setup({});
        const url = "https://example.com/wide.svg";
        store.rows.set(`ws-1:${await keyOf(url)}`, { id: "drawn", key: await keyOf(url), width: 1024, height: 51, metadata: { convertedFrom: "svg", provisional: true } });
        const result = await enrichment.identity(logoData([url]), context);
        expect(result.groupErrors?.logo).toBeUndefined();
        expect(result.branding?.logo).toMatchObject({ assetId: "drawn", width: 1024, height: 51 });
      });

      it("the same address among the images does not offer the logo's drawing as an image, nor call it too small: it is refused as an SVG always was", async () => {
        const { store, enrichment, downloader } = await setup({ "https://example.com/wide.svg": svgEntry(WIDE), "https://example.com/photo.png": await ok(1000, 800) });
        const logo = await enrichment.identity(logoData(["https://example.com/wide.svg"]), context);
        expect(logo.branding?.logo?.key).toBeTruthy();

        const images = await enrichment.images(baseData({ images: [{ url: "https://example.com/wide.svg" }, { url: "https://example.com/photo.png" }] }), context);
        expect(images.images?.map((i) => i.url)).toEqual(["https://example.com/photo.png"]);
        expect(downloader.calls.filter((url) => url.endsWith("wide.svg"))).toHaveLength(1); // The second time it was found in storage, not fetched.
        expect(store.saved.some((a) => a.name === "site_image" && (a.metadata as Record<string, unknown>).originUrl === "https://example.com/wide.svg")).toBe(false);

        const only = await enrichment.images(baseData({ images: [{ url: "https://example.com/wide.svg" }] }), context);
        expect(only.images).toEqual([]);
        // What an SVG refused as an image has always given: a download failure, not "too small" (the person is not told the photo is small).
        expect(only.groupErrors).toEqual({ images: "image_download_failed" });
      });

      it("a raster logo in storage is still offered as an image when it measures up, and refused when it does not, as before", async () => {
        const { store, enrichment } = await setup({});
        const big = "https://example.com/big.png", small = "https://example.com/small.png";
        store.rows.set(`ws-1:${await keyOf(big)}`, { id: "big", key: await keyOf(big), width: 1200, height: 900, metadata: { provisional: true } });
        store.rows.set(`ws-1:${await keyOf(small)}`, { id: "small", key: await keyOf(small), width: 300, height: 300, metadata: { provisional: true } });
        const result = await enrichment.images(baseData({ images: [{ url: big }, { url: small }] }), context);
        expect(result.images?.map((i) => i.url)).toEqual([big]);
      });
    });

    describe("a download that says the SVG is too large (the real downloader's typed error)", () => {
      const keyHash = async (url: string) => (await import("node:crypto")).createHash("sha256").update(url).digest("hex");
      it("is a logo not found, never a download failure, with nothing stored", async () => {
        const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
        const { store, storage, enrichment } = await setup({ "https://example.com/logo.svg": new SvgLogoError("svg_too_large") });
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
        expect(result.branding?.logo).toBeUndefined();
        expect(result.groupErrors?.logo).toBe("logo_unsupported_format");
        expect(store.saved.some((a) => a.name === "site_logo")).toBe(false);
        const hash = await keyHash("https://example.com/logo.svg");
        expect(storage.keys().every((key) => !key.endsWith(hash))).toBe(true);
        expect(info).toHaveBeenCalledWith("[equipe-handoff] svg logo not used", { readingId: "reading-1", reason: "svg_too_large" });
      });

      it("a good PNG after it is the logo, and no error is left", async () => {
        const { store, enrichment } = await setup({ "https://example.com/logo.svg": new SvgLogoError("svg_too_large"), "https://example.com/share.png": await ok(1236, 888) });
        const result = await enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/share.png"]), context);
        expect(result.branding?.logo?.url).toBe("https://example.com/share.png");
        expect(result.groupErrors?.logo).toBeUndefined();
        expect(store.saved.filter((a) => a.name === "site_logo")).toHaveLength(1);
      });

      it("next to a candidate that could not be fetched it stays a download failure; a plain too-large raster error still is one", async () => {
        const broken = await setup({ "https://example.com/logo.svg": new SvgLogoError("svg_too_large"), "https://example.com/gone.png": new Error("404") });
        expect((await broken.enrichment.identity(logoData(["https://example.com/logo.svg", "https://example.com/gone.png"]), context)).groupErrors?.logo).toBe("logo_download_failed");
        const raster = await setup({ "https://example.com/logo.png": new Error("image_too_large") });
        expect((await raster.enrichment.identity(logoData(["https://example.com/logo.png"]), context)).groupErrors?.logo).toBe("logo_download_failed");
      });
    });

    it("the logo is asked for with SVG allowed; the screenshot and the images never are", async () => {
      const { enrichment, downloader } = await setup({ "https://example.com/logo.svg": svgEntry(), "https://example.com/photo.png": await ok(1000, 800) });
      await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      await enrichment.images(baseData({ images: [{ url: "https://example.com/photo.png" }] }), context);
      expect(downloader.options.get("https://example.com/logo.svg")).toMatchObject({ allowSvg: true });
      expect(downloader.options.get("https://example.com/print.png")).not.toHaveProperty("allowSvg");
      expect(downloader.options.get("https://example.com/photo.png")).not.toHaveProperty("allowSvg");
    });

    it("vision keeps its contract: it is called once, on the JPEG copy made from the stored PNG (…-vision.jpg), with no extra call", async () => {
      const capture: { context?: SiteReadingContext; input?: Parameters<SiteVision>[0] } = {};
      const visionCalls = vi.fn(async (input: Parameters<SiteVision>[0]) => { void input; return visionOk; });
      const { storage, enrichment } = await setup({ "https://example.com/logo.svg": svgEntry() }, () => async (input) => { capture.input = input; return visionCalls(input); });
      const result = await enrichment.identity(logoData(["https://example.com/logo.svg"]), context);
      expect(visionCalls).toHaveBeenCalledTimes(1);
      expect(capture.input?.logoKey).toBe(`${result.branding!.logo!.key}-vision.jpg`);
      expect(capture.input?.logoKey).toMatch(/-vision\.jpg$/);
      const copy = await storage.get(capture.input!.logoKey!);
      expect(copy.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);
      const meta = await sharp(copy).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1024);
      expect(result.branding?.colors).toEqual(visionOk.colors);
    });

    it("an SVG is still refused as a site image (only the logo takes one): nothing stored, and it counts as a failed download", async () => {
      const { store, enrichment } = await setup({ "https://example.com/art.svg": svgEntry() });
      const result = await enrichment.images(baseData({ images: [{ url: "https://example.com/art.svg" }] }), context);
      expect(result.images).toEqual([]);
      expect(result.groupErrors).toEqual({ images: "image_download_failed" });
      expect(store.saved.some((a) => a.name === "site_image")).toBe(false);
    });

    it("an SVG is still refused as the screenshot", async () => {
      const { store, enrichment } = await setup({ "https://example.com/print.png": svgEntry() });
      const result = await enrichment.identity(baseData({ branding: { colors: [], fonts: [] } }), context);
      expect(result.groupErrors?.colors).toBe("site_vision_failed");
      expect(store.saved.some((a) => a.name === "site_screenshot")).toBe(false);
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
