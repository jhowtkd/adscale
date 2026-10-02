// Minimum sizes of what a site offers (ticket 13, D-8): a logo measures at least 100 px on its shorter side, a site image at least 500, measured after the file is
// decoded and BEFORE it is stored. Property tests (fixed seed) over random dimensions in random order, and the importer itself over formats and edge cases.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { createHandoffImageImporter, IMAGE_TOO_SMALL, MIN_LOGO_SHORT_SIDE_PX, MIN_SITE_IMAGE_SHORT_SIDE_PX } from "./image-import";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import type { SiteReadResult } from "./readers";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rand = () => number;
const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
const shuffle = <T,>(r: Rand, items: T[]) => items.map(item => [r(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item);

const context: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "h-1", readingId: "r-1", taskIntentId: "t-1" };
const keyOf = (url: string) => `workspaces/${context.workspaceId}/handoff/${context.handoffId}/${context.readingId}/${createHash("sha256").update(url).digest("hex")}`;

const png = new Map<string, Buffer>();
async function image(width: number, height: number) {
  const id = `${width}x${height}`;
  if (!png.has(id)) png.set(id, await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 60, b: 200 } } }).png({ compressionLevel: 9 }).toBuffer());
  return { bytes: png.get(id)!, contentType: "image/png" };
}

type Plan = { url: string; width: number; height: number; broken?: boolean };
function harness(plans: Plan[]) {
  const storage = new InMemoryObjectStorage();
  const put = vi.spyOn(storage, "put");
  const saved: string[] = [];
  const rows = new Map<string, { id: string; key: string; width: number | null; height: number | null }>();
  const byUrl = new Map(plans.map(p => [p.url, p]));
  let inFlight = 0, maxInFlight = 0;
  const calls: string[] = [];
  const download = vi.fn(async (url: string) => {
    calls.push(url); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 0));
    inFlight--;
    const plan = byUrl.get(url);
    if (!plan || plan.broken) throw new Error("404");
    return image(plan.width, plan.height);
  });
  const enrichment = createSiteEnrichment({ storage, download: download as never,
    saveAsset: async data => { saved.push(data.key); const row = { id: `a-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null }; rows.set(`${data.workspaceId}:${data.key}`, row); return row; },
    findAsset: async (workspaceId, key) => rows.get(`${workspaceId}:${key}`) ?? null,
    vision: () => async () => ({ logoConfirmed: null, colors: [], fonts: [] }) });
  return { enrichment, put, saved, calls, maxInFlight: () => maxInFlight, download };
}
const site = (extra: Partial<SiteReadResult>): SiteReadResult => ({ title: "T", siteName: "S", markdown: "m", links: [], images: [], screenshotUrl: null, statusCode: 200, branding: { colors: [], fonts: [] }, ...extra });

const SIDES = [1, 16, 31, 32, 64, 98, 99, 100, 101, 150, 300, 498, 499, 500, 501, 800, 1200, 1600];
const dims = (r: Rand) => ({ width: pick(r, SIDES), height: pick(r, SIDES) });
const short = (p: { width: number; height: number }) => Math.min(p.width, p.height);

describe("the minimum sizes are written down", () => {
  it("100 px for a logo and 500 px for a site image", () => {
    expect(MIN_LOGO_SHORT_SIDE_PX).toBe(100);
    expect(MIN_SITE_IMAGE_SHORT_SIDE_PX).toBe(500);
  });
});

describe("identity(): the logo", () => {
  it("is the FIRST candidate, in the given order, whose shorter side is at least 100, and nothing smaller is ever stored (120 random sets)", async () => {
    const r = rng(8);
    let chosenCount = 0, tooSmallError = 0, downloadError = 0, none = 0;
    for (let i = 0; i < 120; i++) {
      const count = 1 + Math.floor(r() * 4);
      const plans: Plan[] = Array.from({ length: count }, (_, n) => ({ url: `https://cdn.example/logo-${i}-${n}.png`, ...dims(r), ...(r() < 0.15 ? { broken: true } : {}) }));
      const order = shuffle(r, plans);
      const [first, ...rest] = order;
      const withLogoField = r() < 0.5;
      const h = harness(plans);
      const result = await h.enrichment.identity(site({ branding: { colors: [], fonts: [], ...(withLogoField ? { logo: { url: first!.url } } : {}) },
        logoCandidates: (withLogoField ? rest : order).map(p => p.url) }), context);
      const tried = order.slice(0, 3);
      const winner = tried.find(p => !p.broken && short(p) >= 100);
      if (winner) {
        expect(result.branding?.logo?.url).toBe(winner.url);
        expect(result.groupErrors?.logo).toBeUndefined();
        // Nothing after the winner is fetched, and the stored object is the winner's alone.
        expect(h.calls).toEqual(tried.slice(0, tried.indexOf(winner) + 1).map(p => p.url));
        expect(h.put.mock.calls.map(c => c[0])).toEqual([keyOf(winner.url)]);
        chosenCount++;
      } else {
        expect(result.branding?.logo).toBeUndefined();
        expect(h.put).not.toHaveBeenCalled();
        expect(h.saved).toEqual([]);
        const small = tried.filter(p => !p.broken && short(p) < 100).length, broken = tried.filter(p => p.broken).length;
        expect(result.groupErrors?.logo, JSON.stringify(tried)).toBe(small > 0 && broken === 0 ? "logo_too_small" : "logo_download_failed");
        if (small > 0 && broken === 0) tooSmallError++; else downloadError++;
        none++;
      }
      expect(h.calls.length).toBeLessThanOrEqual(3);
    }
    expect(chosenCount).toBeGreaterThan(30);
    expect(tooSmallError).toBeGreaterThan(5);
    expect(downloadError).toBeGreaterThan(5);
    expect(none).toBeGreaterThan(10);
  }, 60_000);

  it("the edge: 99 on the shorter side is not a logo, 100 is, in portrait and in landscape", async () => {
    for (const [width, height, ok] of [[99, 400, false], [400, 99, false], [100, 400, true], [400, 100, true], [99, 99, false], [100, 100, true], [1000, 99, false]] as const) {
      const h = harness([{ url: "https://cdn.example/l.png", width, height }]);
      const result = await h.enrichment.identity(site({ branding: { colors: [], fonts: [], logo: { url: "https://cdn.example/l.png" } } }), context);
      expect(Boolean(result.branding?.logo), `${width}x${height}`).toBe(ok);
      expect(h.put.mock.calls.length).toBe(ok ? 1 : 0);
    }
  });

  it("no candidate at all is no error; svg and ico are never tried", async () => {
    const h = harness([]);
    expect((await h.enrichment.identity(site({}), context)).groupErrors?.logo).toBeUndefined();
    expect(h.download).not.toHaveBeenCalled();
  });
});

describe("images(): what the site offers", () => {
  it("keeps exactly the images whose shorter side is at least 500 among the first 26, stores only those, and says why when none is left (80 random sets)", async () => {
    const r = rng(21);
    let kept = 0, allSmall = 0, someBroken = 0;
    for (let i = 0; i < 80; i++) {
      const count = Math.floor(r() * 36);
      const plans: Plan[] = Array.from({ length: count }, (_, n) => ({ url: `https://cdn.example/${i}-${n}.png`, ...dims(r), ...(r() < 0.1 ? { broken: true } : {}) }));
      const h = harness(plans);
      const result = await h.enrichment.images(site({ images: plans.map(p => ({ url: p.url })) }), context);
      const considered = plans.slice(0, 26);
      const good = considered.filter(p => !p.broken && short(p) >= 500);
      expect(new Set(result.images.map(x => x.url)), `n=${count}`).toEqual(new Set(good.map(p => p.url)));
      expect(result.images).toHaveLength(good.length);
      expect(new Set(h.put.mock.calls.map(c => c[0]))).toEqual(new Set(good.map(p => keyOf(p.url))));
      expect(h.saved).toHaveLength(good.length);
      expect(new Set(h.calls)).toEqual(new Set(considered.map(p => p.url))); // Every one of the first 26 is looked at, no more.
      expect(h.calls.length).toBeLessThanOrEqual(26);
      expect(h.maxInFlight()).toBeLessThanOrEqual(3);
      const small = considered.filter(p => !p.broken && short(p) < 500).length, broken = considered.filter(p => p.broken).length;
      if (considered.length && !good.length) {
        expect(result.groupErrors?.images).toBe(small > 0 && broken === 0 ? "images_too_small" : "image_download_failed");
        if (small > 0 && broken === 0) allSmall++; else someBroken++;
      } else expect(result.groupErrors).toBeUndefined();
      if (good.length) kept++;
    }
    expect(kept).toBeGreaterThan(20);
    expect(allSmall).toBeGreaterThan(3);
    expect(someBroken).toBeGreaterThan(3);
  }, 120_000);

  it("the edge: 499 on the shorter side is dropped, 500 stays", async () => {
    const plans: Plan[] = [{ url: "https://cdn.example/a.png", width: 499, height: 900 }, { url: "https://cdn.example/b.png", width: 900, height: 499 },
      { url: "https://cdn.example/c.png", width: 500, height: 900 }, { url: "https://cdn.example/d.png", width: 900, height: 500 }, { url: "https://cdn.example/e.png", width: 500, height: 500 }];
    const h = harness(plans);
    const result = await h.enrichment.images(site({ images: plans.map(p => ({ url: p.url })) }), context);
    expect(result.images.map(i => i.url).sort()).toEqual(["https://cdn.example/c.png", "https://cdn.example/d.png", "https://cdn.example/e.png"]);
  });

  it("without candidates there is nothing to report", async () => {
    expect((await harness([]).enrichment.images(site({}), context)).groupErrors).toBeUndefined();
  });
});

describe("createHandoffImageImporter with minShortSide", () => {
  const signal = () => new AbortController().signal;
  function importer(entries: Record<string, { bytes: Buffer; contentType: string }>, existing: Array<{ key: string; width: number | null; height: number | null }> = []) {
    const storage = new InMemoryObjectStorage();
    const put = vi.spyOn(storage, "put");
    const download = vi.fn(async (url: string) => { const entry = entries[url]; if (!entry) throw new Error("404"); return entry; });
    const rows = new Map(existing.map((e, i) => [e.key, { id: `existing-${i}`, ...e }]));
    const saveAsset = vi.fn(async (data: { key: string; width?: number | null; height?: number | null }) => { const row = { id: `new-${rows.size}`, key: data.key, width: data.width ?? null, height: data.height ?? null }; rows.set(data.key, row); return row; });
    const run = createHandoffImageImporter({ storage, download: download as never, saveAsset: saveAsset as never, findAsset: async (_w, key) => rows.get(key) ?? null, source: "brand_site" });
    return { run, put, download, saveAsset };
  }
  const encode = (format: "png" | "jpeg" | "webp" | "gif", width: number, height: number) => {
    const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 20 } } });
    return { png: () => base.png().toBuffer(), jpeg: () => base.jpeg().toBuffer(), webp: () => base.webp().toBuffer(), gif: () => base.gif().toBuffer() }[format]();
  };
  const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;

  it.each(["png", "jpeg", "webp", "gif"] as const)("%s: 500 on the shorter side is stored; 499 is refused with image_too_small and never stored", async (format) => {
    const url = (n: number) => `https://cdn.example/${format}-${n}`;
    const imp = importer({ [url(1)]: { bytes: await encode(format, 700, 500), contentType: TYPES[format] }, [url(2)]: { bytes: await encode(format, 499, 900), contentType: TYPES[format] },
      [url(3)]: { bytes: await encode(format, 900, 499), contentType: TYPES[format] } });
    const ok = await imp.run(url(1), "site_image", context, signal(), false, {}, { minShortSide: 500 });
    expect(ok).toMatchObject({ url: url(1), width: 700, height: 500 });
    expect(imp.put).toHaveBeenCalledTimes(1);
    for (const n of [2, 3]) await expect(imp.run(url(n), "site_image", context, signal(), false, {}, { minShortSide: 500 })).rejects.toThrow(IMAGE_TOO_SMALL);
    expect(imp.put).toHaveBeenCalledTimes(1);
    expect(imp.saveAsset).toHaveBeenCalledTimes(1);
  });

  it("without a limit any size is stored (the control)", async () => {
    const imp = importer({ "https://cdn.example/t": { bytes: await encode("png", 3, 3), contentType: "image/png" } });
    await expect(imp.run("https://cdn.example/t", "site_image", context, signal())).resolves.toMatchObject({ width: 3, height: 3 });
  });

  it("an image rotated by EXIF is measured as the file declares it: the shorter side is the same either way", async () => {
    const upright = await sharp({ create: { width: 700, height: 520, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const tiny = await sharp({ create: { width: 480, height: 900, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const imp = importer({ "https://cdn.example/rot-ok": { bytes: upright, contentType: "image/jpeg" }, "https://cdn.example/rot-small": { bytes: tiny, contentType: "image/jpeg" } });
    await expect(imp.run("https://cdn.example/rot-ok", "site_image", context, signal(), false, {}, { minShortSide: 500 })).resolves.toBeTruthy();
    await expect(imp.run("https://cdn.example/rot-small", "site_image", context, signal(), false, {}, { minShortSide: 500 })).rejects.toThrow(IMAGE_TOO_SMALL);
  });

  it("bytes that are not an image are refused as such, never as too small, with or without a limit", async () => {
    const imp = importer({ "https://cdn.example/bad": { bytes: Buffer.from("<html>not an image</html>"), contentType: "image/png" },
      "https://cdn.example/mismatch": { bytes: await encode("png", 800, 800), contentType: "image/jpeg" }, "https://cdn.example/empty": { bytes: Buffer.alloc(0), contentType: "image/png" } });
    for (const url of ["bad", "mismatch", "empty"]) for (const limits of [{}, { minShortSide: 500 }, { minShortSide: 100 }]) {
      // Sharp itself refuses what it cannot decode (its own message); a file that is not what it claims is image_bytes_invalid. Neither is "too small".
      const error = await imp.run(`https://cdn.example/${url}`, "site_image", context, signal(), false, {}, limits).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toBe(IMAGE_TOO_SMALL);
    }
    expect(imp.put).not.toHaveBeenCalled();
    const message = (await imp.run("https://cdn.example/mismatch", "site_image", context, signal(), false, {}, { minShortSide: 500 }).catch((e: Error) => e)) as Error;
    expect(message.message).toBe("image_bytes_invalid");
  });

  it("an asset that already exists is judged by its recorded size: small is refused without a download, large is reused, unknown size is reused", async () => {
    const url = (n: string) => `https://cdn.example/${n}`;
    const key = (n: string) => keyOf(url(n));
    const imp = importer({}, [{ key: key("small"), width: 99, height: 800 }, { key: key("big"), width: 900, height: 700 }, { key: key("edge"), width: 500, height: 500 }, { key: key("unknown"), width: null, height: null }]);
    await expect(imp.run(url("small"), "site_image", context, signal(), false, {}, { minShortSide: 500 })).rejects.toThrow(IMAGE_TOO_SMALL);
    await expect(imp.run(url("small"), "site_logo", context, signal(), false, {}, { minShortSide: 100 })).rejects.toThrow(IMAGE_TOO_SMALL); // 99 < 100: refused as a logo too
    await expect(imp.run(url("big"), "site_image", context, signal(), false, {}, { minShortSide: 500 })).resolves.toMatchObject({ assetId: "existing-1", width: 900 });
    await expect(imp.run(url("edge"), "site_image", context, signal(), false, {}, { minShortSide: 500 })).resolves.toMatchObject({ assetId: "existing-2" });
    await expect(imp.run(url("unknown"), "site_image", context, signal(), false, {}, { minShortSide: 500 })).resolves.toMatchObject({ assetId: "existing-3" });
    expect(imp.download).not.toHaveBeenCalled();
    expect(imp.put).not.toHaveBeenCalled();
  });
});
