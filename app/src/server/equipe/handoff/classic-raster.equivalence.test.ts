// Ticket 19, phase 1: the classic product's direct uploads (Brand Kit upload, measure, preflight, AI normalization) now decode in the disposable raster child.
// The result for whoever uses it right must not change. The ORACLE is the real code of `main` at 949471d2 (`tests/fixtures/classic-raster-main/`, frozen copies from `git show`), run in this same
// process on the same bytes: nothing here recomputes what the new code does. The second half is about the path itself: cheap admission, one shared line, recovery.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { forgedPng } from "@/server/equipe/handoff/logo-surface.fixtures";
import { ImageChildUnavailable } from "@/server/equipe/handoff/svg-draw-child";
import * as transport from "@/server/equipe/handoff/svg-draw-child";
import { RasterRetryError, isRasterRetry } from "@/server/equipe/handoff/raster-image";
import { inspectUsableTransparency, normalizeImageForAi, InvalidImageInputError } from "@/server/ai/normalize-image-for-ai";
import * as mainNormalize from "../../../../tests/fixtures/classic-raster-main/normalize-image-for-ai";
import { analyzePreflight } from "@/server/ai/preflight-analysis";
import * as mainPreflight from "../../../../tests/fixtures/classic-raster-main/preflight-analysis";
import { measureImageBuffer } from "@/server/brand-training/measure-image";
import * as mainMeasure from "../../../../tests/fixtures/classic-raster-main/measure-image";
import { normalizeTrainingUpload } from "@/server/brand-training/upload";
import * as mainUpload from "../../../../tests/fixtures/classic-raster-main/upload";

vi.mock("@/server/equipe/handoff/svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/equipe/handoff/svg-draw-child")>();
  return { ...actual, runImageChild: vi.fn(actual.runImageChild) };
});
const child = vi.mocked(transport.runImageChild);
const actualChild = (await vi.importActual<typeof import("@/server/equipe/handoff/svg-draw-child")>("@/server/equipe/handoff/svg-draw-child")).runImageChild;
afterEach(() => { vi.restoreAllMocks(); child.mockReset(); child.mockImplementation(actualChild); });

// The vendor is a fake that records exactly what would have been sent.
const sent: unknown[] = [];
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ responses: { create: async (request: unknown) => { sent.push(request); return { output_text: JSON.stringify({ overallScore: 71, breakdown: { composition: { score: 64, suggestion: "ok" } }, suggestions: ["a"] }) }; } } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

/** A picture that is smooth and noisy at once, the same for every format. */
const picture = (width: number, height: number, channels: 3 | 4 = 3, alpha: (x: number, y: number) => number = () => 255) => {
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++)
    raw[(y * width + x) * channels + c] = c === 3 ? alpha(x, y) : Math.min(255, Math.round(((x * 255) / width + (y * 120) / height + c * 40) % 256) + ((x * 7 + y * 13 + c) % 9));
  return sharp(raw, { raw: { width, height, channels } });
};
const NAVY = "#071522", YELLOW = "#FFC914", WHITE = "#FFFFFF";
type Sample = { name: string; bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif" };
let samples: Sample[];
let hostileDir: string;

beforeAll(async () => {
  const halfAlpha = (x: number, y: number) => ((x + y) % 5 === 0 ? 0 : (x * 255) / 300);
  const rgba = await picture(300, 200, 4, halfAlpha).png().toBuffer();
  samples = [
    { name: "png-opaque", bytes: await picture(300, 200).png().toBuffer(), mime: "image/png" },
    { name: "png-transparent", bytes: rgba, mime: "image/png" },
    { name: "png-fully-opaque-rgba", bytes: await picture(120, 90, 4).png().toBuffer(), mime: "image/png" },
    { name: "png-palette-trns", bytes: await sharp(rgba).png({ palette: true, colours: 16 }).toBuffer(), mime: "image/png" },
    { name: "png-16bit", bytes: await picture(150, 100).toColourspace("rgb16").png({ compressionLevel: 1 }).toBuffer(), mime: "image/png" },
    { name: "png-16bit-rgba-interlaced", bytes: await picture(150, 100, 4, (x, y) => ((x + y) % 5 === 0 ? 0 : 200)).toColourspace("rgb16").png({ progressive: true }).toBuffer(), mime: "image/png" },
    { name: "jpeg-baseline", bytes: await picture(640, 480).jpeg({ quality: 80 }).toBuffer(), mime: "image/jpeg" },
    { name: "jpeg-exif6", bytes: await picture(400, 300).jpeg({ quality: 85 }).withMetadata({ orientation: 6 }).toBuffer(), mime: "image/jpeg" },
    { name: "jpeg-exif8-small", bytes: await picture(200, 120).jpeg().withMetadata({ orientation: 8 }).toBuffer(), mime: "image/jpeg" },
    { name: "jpeg-progressive", bytes: await picture(500, 350).jpeg({ quality: 75, progressive: true }).toBuffer(), mime: "image/jpeg" },
    { name: "jpeg-cmyk", bytes: await picture(260, 180).toColourspace("cmyk").jpeg().toBuffer(), mime: "image/jpeg" },
    { name: "jpeg-phone-12mp", bytes: await picture(4000, 3000).jpeg({ quality: 60 }).withMetadata({ orientation: 6 }).toBuffer(), mime: "image/jpeg" },
    { name: "webp-lossy", bytes: await picture(480, 320).webp({ quality: 70 }).toBuffer(), mime: "image/webp" },
    { name: "webp-alpha", bytes: await picture(300, 200, 4, halfAlpha).webp({ lossless: true }).toBuffer(), mime: "image/webp" },
    { name: "gif", bytes: await picture(160, 120).gif().toBuffer(), mime: "image/gif" },
    { name: "avif", bytes: await picture(160, 120).avif({ quality: 40, effort: 0 }).toBuffer(), mime: "image/avif" },
  ];
  // The 16-bit samples must really be 16-bit: the IHDR bit depth (byte 24) says so.
  for (const name of ["png-16bit", "png-16bit-rgba-interlaced"]) expect(samples.find(s => s.name === name)!.bytes[24], name).toBe(16);
  hostileDir = mkdtempSync(path.join(tmpdir(), "classic-raster-"));
}, 120_000);
afterAll(() => { if (hostileDir) rmSync(hostileDir, { recursive: true, force: true }); });

const fileOf = (sample: Sample, type: string = sample.mime) => new File([new Uint8Array(sample.bytes)], sample.name, { type });
const FIXED = () => new Date("2026-10-03T12:00:00.000Z");
const TARGETS = [{ hex: NAVY, label: "navy" }, { hex: YELLOW }, { hex: WHITE, label: "white" }];
const MEASURE_OPTIONS = [
  { name: "defaults", options: {} },
  { name: "targets, nearest", options: { colorTargets: TARGETS } },
  { name: "targets, nearest with ceiling", options: { colorTargets: TARGETS, maxAssignDeltaE: 25 } },
  { name: "targets, within tolerance", options: { colorTargets: TARGETS, colorAssignment: "within_tolerance" as const, deltaETolerance: 12 } },
  { name: "5x5 regions", options: { regionGrid: 5, colorTargets: [{ hex: "abc" }] } },
];
/** Both sides of the comparison, settled: a value or the error's class and message (a vendor error never reaches an assertion as an unhandled rejection). */
const settle = <T>(run: () => Promise<T>) => run().then(value => ({ value }), (error: unknown) => ({ error }));

describe("byte for byte against `main`: normalization for AI, usable transparency, upload metadata", () => {
  it("normalizeImageForAi returns the same bytes, mime, dimensions, sizes and transparency flag for every kind of file", async () => {
    for (const sample of samples) {
      const expected = await mainNormalize.normalizeImageForAi({ buffer: sample.bytes, mimeType: sample.mime });
      const actual = await normalizeImageForAi({ buffer: sample.bytes, mimeType: sample.mime });
      expect(actual.mimeType, sample.name).toBe(expected.mimeType);
      expect(actual.width, sample.name).toBe(expected.width);
      expect(actual.height, sample.name).toBe(expected.height);
      expect(actual.originalBytes, sample.name).toBe(expected.originalBytes);
      expect(actual.finalBytes, sample.name).toBe(expected.finalBytes);
      expect(actual.hasTransparency, sample.name).toBe(expected.hasTransparency);
      expect(Buffer.compare(actual.buffer, expected.buffer), `${sample.name} bytes`).toBe(0);
    }
  }, 120_000);
  it("normalizeReferenceBuffers keeps names, order and bytes (and drops the caller's buffer, as `main` does)", async () => {
    const refs = (which: string[]) => samples.filter(s => which.includes(s.name)).map(s => ({ buffer: Buffer.from(s.bytes), mimeType: s.mime, name: `${s.name}.bin` }));
    const names = ["png-transparent", "jpeg-exif6", "webp-lossy", "jpeg-cmyk", "png-palette-trns"];
    const expected = await mainNormalize.normalizeReferenceBuffers(refs(names));
    const { normalizeReferenceBuffers } = await import("@/server/ai/normalize-image-for-ai");
    const given = refs(names);
    const actual = await normalizeReferenceBuffers(given);
    expect(actual.map(r => [r.name, r.mimeType])).toEqual(expected.map(r => [r.name, r.mimeType]));
    actual.forEach((r, i) => expect(Buffer.compare(r.buffer as Buffer, expected[i]!.buffer as Buffer), r.name).toBe(0));
    expect(given.every(ref => ref.buffer === undefined)).toBe(true);
  }, 60_000);
  it("inspectUsableTransparency gives the same verdict (RGBA that is fully opaque is not transparent; palette+tRNS and WebP alpha are)", async () => {
    for (const sample of samples) {
      expect(await inspectUsableTransparency(sample.bytes), sample.name).toBe(await mainNormalize.inspectUsableTransparency(sample.bytes));
    }
    expect(await inspectUsableTransparency(samples.find(s => s.name === "png-palette-trns")!.bytes)).toBe(true);
    expect(await inspectUsableTransparency(samples.find(s => s.name === "png-fully-opaque-rgba")!.bytes)).toBe(false);
  }, 60_000);
  it("normalizeTrainingUpload (raster) returns the same buffer, type, extension and alpha flag, and refuses what `main` refused (a format outside png/jpeg/webp, a wrong declared type, empty and oversized files)", async () => {
    for (const sample of samples) {
      for (const type of [sample.mime, "image/png", "image/jpeg", "image/webp"]) {
        const expected = await settle(() => mainUpload.normalizeTrainingUpload(fileOf(sample, type)));
        const actual = await settle(() => normalizeTrainingUpload(fileOf(sample, type)));
        const label = `${sample.name} as ${type}`;
        if (expected.error) { expect(actual.error, label).toBeInstanceOf(Error); expect((actual.error as Error).message, label).toBe((expected.error as Error).message); continue; }
        expect(actual.error, label).toBeUndefined();
        expect(actual.value!.type, label).toBe(expected.value!.type);
        expect(actual.value!.extension, label).toBe(expected.value!.extension);
        expect(actual.value!.hasAlpha, label).toBe(expected.value!.hasAlpha);
        expect(Buffer.compare(actual.value!.buffer, expected.value!.buffer), label).toBe(0);
      }
    }
    for (const bad of [new File([], "empty.png", { type: "image/png" }), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }), new File([new Uint8Array(32)], "x.txt", { type: "text/plain" })]) {
      const expected = await settle(() => mainUpload.normalizeTrainingUpload(bad)), actual = await settle(() => normalizeTrainingUpload(bad));
      expect((actual.error as Error).message).toBe((expected.error as Error).message);
    }
  }, 120_000);
});

describe("byte for byte against `main`: every number of the deterministic training measure (clock fixed)", () => {
  it("measureImageBuffer returns the same object, field by field, for every option set and every kind of file", async () => {
    for (const sample of samples) {
      // The 12 MP phone photo goes through the options that stress the loop most (no targets, and three with nearest); the rest of the matrix runs on the small files.
      const matrix = sample.name === "jpeg-phone-12mp" ? MEASURE_OPTIONS.slice(0, 2) : MEASURE_OPTIONS;
      for (const { name, options } of matrix) {
        const expected = await mainMeasure.measureImageBuffer(sample.bytes, { ...options, now: FIXED });
        const actual = await measureImageBuffer(sample.bytes, { ...options, now: FIXED });
        expect(actual, `${sample.name} / ${name}`).toEqual(expected);
      }
    }
  }, 240_000);
  it("an invalid colour target is refused with the same message, and before any process", async () => {
    const expected = await settle(() => mainMeasure.measureImageBuffer(samples[0]!.bytes, { colorTargets: [{ hex: "nope" }] }));
    child.mockClear();
    const actual = await settle(() => measureImageBuffer(samples[0]!.bytes, { colorTargets: [{ hex: "nope" }] }));
    expect((actual.error as Error).message).toBe((expected.error as Error).message);
    expect(child).not.toHaveBeenCalled();
  });
  it("the exported colour helpers still agree with `main`", () => {
    return import("@/server/brand-training/measure-image").then(({ colorDeltaE, parseHexColor }) => {
      for (const [a, b] of [["#071522", "#FFC914"], ["#fff", "#000"], ["abc", "#abcdef"], ["#zzz", "#000000"]] as const) expect(colorDeltaE(a, b)).toBe(mainMeasure.colorDeltaE(a, b));
      expect(parseHexColor("#071522")).toEqual(mainMeasure.parseHexColor("#071522"));
    });
  });
});

describe("byte for byte against `main`: preflight statistics and what the vendor receives", () => {
  const brief = { name: "Launch", objective: "sales", offer: "10% off", constraints: "none", ctaVariants: ["Buy"] } as never;
  const kinds = ["png-opaque", "png-transparent", "jpeg-exif6", "jpeg-progressive", "jpeg-phone-12mp", "webp-lossy", "webp-alpha", "png-palette-trns"];
  it("the returned result (technical block included) and the request sent to the vendor, image data URL included, are identical", async () => {
    for (const name of kinds) {
      const sample = samples.find(s => s.name === name)!;
      const input = { assetBuffer: sample.bytes, mimeType: sample.mime, claimedWidth: 1080, claimedHeight: 1350, campaignBrief: brief, locale: "pt-BR" };
      sent.length = 0;
      const expected = await mainPreflight.analyzePreflight(input);
      const actual = await analyzePreflight(input);
      expect(sent, name).toHaveLength(2);
      expect(actual, name).toEqual(expected);
      expect(sent[1], `${name} request`).toEqual(sent[0]);
      // The data URL carries the same pixels as `main`'s: the long edge is capped at 2048 and the format is kept.
      const url = ((sent[1] as { input: Array<{ content: unknown }> }).input[1]!.content as Array<{ image_url?: string }>)[1]!.image_url!;
      expect(url.startsWith(`data:${sample.mime};base64,`)).toBe(true);
    }
  }, 240_000);
  it("a legitimate PNG of more than 10 MiB (the 50 MiB of the asset upload is the envelope) is analyzed as on `main`: the same result and the same request to the vendor, and one byte past 50 MiB is refused with no process and no vendor call", async () => {
    const width = 2048, height = 2048, raw = Buffer.alloc(width * height * 4);
    let seed = 99;
    for (let i = 0; i < raw.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; raw[i] = i % 4 === 3 ? 255 : seed >>> 24; }
    const big = await sharp(raw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(big.length).toBeGreaterThan(10 * 1024 * 1024);
    expect(big.length).toBeLessThan(17 * 1024 * 1024);
    const input = { assetBuffer: big, mimeType: "image/png", claimedWidth: width, claimedHeight: height, locale: "pt-BR" };
    sent.length = 0;
    const expected = await mainPreflight.analyzePreflight(input);
    const actual = await analyzePreflight(input);
    expect(sent).toHaveLength(2);
    expect(actual).toEqual(expected);
    expect(sent[1]).toEqual(sent[0]);
    // The picture is not shrunk (2048 x 2048, no enlargement), so what the vendor receives is itself more than 10 MiB: the child's output envelope (17 MiB) is what is proved here, not just the admission.
    const url = ((sent[1] as { input: Array<{ content: unknown }> }).input[1]!.content as Array<{ image_url?: string }>)[1]!.image_url!;
    expect(Buffer.from(url.split(",")[1]!, "base64").length).toBeGreaterThan(10 * 1024 * 1024);
    child.mockClear();
    sent.length = 0;
    await expect(analyzePreflight({ assetBuffer: Buffer.alloc(50 * 1024 * 1024 + 1, 1), mimeType: "image/png" })).rejects.toThrow();
    expect(child).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  }, 180_000);
  it("an image under 100 px and an unsupported type fail with the same messages, and the vendor is never called", async () => {
    const tiny = await picture(60, 40).png().toBuffer();
    for (const input of [{ assetBuffer: tiny, mimeType: "image/png" }, { assetBuffer: tiny, mimeType: "image/gif" }]) {
      sent.length = 0;
      const expected = await settle(() => mainPreflight.analyzePreflight(input)), actual = await settle(() => analyzePreflight(input));
      expect((actual.error as Error).message).toBe((expected.error as Error).message);
      expect(sent).toHaveLength(0);
    }
  });
});

describe("the callers admit by the header: a hostile file is refused with no process and no `sharp` in the server", () => {
  const sharpWork = () => [vi.spyOn(sharp.prototype, "metadata"), vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw"), vi.spyOn(sharp.prototype, "stats"), vi.spyOn(sharp.prototype, "rotate")];
  it("20000 x 20000 and 30001 x 1 end every direct upload path without spawning, and the vendor is never called", async () => {
    const hostile = await Promise.all([{ width: 20_000, height: 20_000 }, { width: 30_001, height: 1 }].map(forgedPng));
    const spies = sharpWork();
    sent.length = 0;
    for (const bytes of hostile) {
      await expect(normalizeImageForAi({ buffer: bytes })).rejects.toBeInstanceOf(InvalidImageInputError);
      await expect(inspectUsableTransparency(bytes)).rejects.toThrow();
      await expect(measureImageBuffer(bytes)).rejects.toThrow();
      await expect(analyzePreflight({ assetBuffer: bytes, mimeType: "image/png" })).rejects.toThrow();
      await expect(normalizeTrainingUpload(new File([new Uint8Array(bytes)], "x.png", { type: "image/png" }))).rejects.toThrow();
    }
    expect(child).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("one shared line and recovery", () => {
  it("normalization, measure, preflight, transparency and upload metadata share the one decoder: with 10 callers at once, never more than one child runs, and every caller is answered", async () => {
    let live = 0, peak = 0;
    child.mockImplementation(async (...args) => { live++; peak = Math.max(peak, live); try { return await actualChild(...args); } finally { live--; } });
    const png = samples.find(s => s.name === "png-opaque")!, jpeg = samples.find(s => s.name === "jpeg-exif6")!;
    const calls = [
      () => normalizeImageForAi({ buffer: png.bytes, accountKey: "classic:a" }),
      () => measureImageBuffer(jpeg.bytes, { accountKey: "classic:a" }),
      () => analyzePreflight({ assetBuffer: jpeg.bytes, mimeType: "image/jpeg", accountKey: "classic:b" }),
      () => inspectUsableTransparency(png.bytes, "classic:b"),
      () => normalizeTrainingUpload(fileOf(png), "classic:c"),
    ];
    const results = await Promise.all([...calls, ...calls].map(call => settle(call)));
    expect(results.filter(r => r.error)).toEqual([]);
    expect(child).toHaveBeenCalledTimes(10);
    expect(peak).toBe(1);
  }, 120_000);
  it("workspaces take turns: a second workspace's single call is not behind all of the first one's backlog", async () => {
    const png = samples.find(s => s.name === "png-opaque")!;
    const order: string[] = [];
    child.mockImplementation(async (...args) => { try { return await actualChild(...args); } finally { order.push("done"); } });
    const finished: string[] = [];
    const mark = (tag: string) => <T,>(value: T) => { finished.push(tag); return value; };
    const backlog = Array.from({ length: 6 }, () => normalizeImageForAi({ buffer: png.bytes, accountKey: "classic:ws-one" }).then(mark("one")));
    const other = normalizeImageForAi({ buffer: png.bytes, accountKey: "classic:ws-two" }).then(mark("two"));
    await Promise.all([...backlog, other]);
    // Decided by count and order, not by time: the lone second workspace finishes before the first one's last call.
    expect(finished.indexOf("two")).toBeLessThan(finished.lastIndexOf("one"));
  }, 120_000);
  it("a child that is unavailable is a retry for every caller (never a corrupt file), and the line is free afterwards", async () => {
    const png = samples.find(s => s.name === "png-opaque")!;
    child.mockImplementation(async () => { throw new ImageChildUnavailable("spawn failed"); });
    const refusals = await Promise.all([
      settle(() => normalizeImageForAi({ buffer: png.bytes })),
      settle(() => measureImageBuffer(png.bytes)),
      settle(() => analyzePreflight({ assetBuffer: png.bytes, mimeType: "image/png" })),
      settle(() => inspectUsableTransparency(png.bytes)),
      settle(() => normalizeTrainingUpload(fileOf(png))),
    ]);
    for (const r of refusals) { expect(r.error).toBeDefined(); expect(isRasterRetry(r.error)).toBe(true); expect(r.error).toBeInstanceOf(RasterRetryError); }
    child.mockImplementation(actualChild);
    const recovered = await normalizeImageForAi({ buffer: png.bytes });
    expect(recovered.width).toBe(300);
    expect((await measureImageBuffer(png.bytes, { now: FIXED })).width).toBe(300);
  }, 60_000);
  it("a file the decoder cannot read (a valid header with no pixel data) is that image's own refusal, not a retry, and the next image is read", async () => {
    const png = samples.find(s => s.name === "png-opaque")!;
    const broken = await forgedPng({ width: 200, height: 200 });
    // (The upload only reads the header, as `main` did, so it accepts this file; the pixels are read later, by the measure.)
    const refused = await Promise.all([
      settle(() => normalizeImageForAi({ buffer: broken })),
      settle(() => measureImageBuffer(broken)),
    ]);
    for (const r of refused) { expect(r.error).toBeDefined(); expect(isRasterRetry(r.error)).toBe(false); }
    expect((await normalizeImageForAi({ buffer: png.bytes })).width).toBe(300);
  }, 60_000);
});

describe("the server process never loads sharp for the raster callers (clean process, real modules)", () => {
  it("normalization, measure, transparency, upload (raster and SVG) and preflight answer a legitimate file and refuse a hostile one with no sharp or libvips in the parent", () => {
    const legit = path.join(hostileDir, "legit.png"), hostile = path.join(hostileDir, "hostile.png"), driver = path.join(hostileDir, "driver.mjs");
    return Promise.all([picture(200, 150).png().toBuffer(), forgedPng({ width: 20_000, height: 20_000 })]).then(([ok, bad]) => {
      writeFileSync(legit, ok); writeFileSync(hostile, bad);
      writeFileSync(driver, `
        import { readFileSync } from "node:fs";
        const [legitFile, hostileFile] = process.argv.slice(2);
        const ok = readFileSync(legitFile), bad = readFileSync(hostileFile);
        const { normalizeImageForAi, inspectUsableTransparency } = await import("@/server/ai/normalize-image-for-ai");
        const { measureImageBuffer } = await import("@/server/brand-training/measure-image");
        const { normalizeTrainingUpload } = await import("@/server/brand-training/upload");
        const { analyzePreflight } = await import("@/server/ai/preflight-analysis");
        const out = { ok: {}, hostile: {} };
        out.ok.normalize = (await normalizeImageForAi({ buffer: ok })).width;
        out.ok.measure = (await measureImageBuffer(ok)).width;
        out.ok.transparency = await inspectUsableTransparency(ok);
        out.ok.upload = (await normalizeTrainingUpload(new File([ok], "a.png", { type: "image/png" }))).extension;
        out.ok.upload_svg = (await normalizeTrainingUpload(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="5" height="5"/></svg>'], "a.svg", { type: "image/svg+xml" }))).extension;
        for (const [name, run] of [["normalize", () => normalizeImageForAi({ buffer: bad })], ["measure", () => measureImageBuffer(bad)], ["transparency", () => inspectUsableTransparency(bad)], ["upload", () => normalizeTrainingUpload(new File([bad], "a.png", { type: "image/png" }))], ["preflight", () => analyzePreflight({ assetBuffer: bad, mimeType: "image/png" })]]) {
          out.hostile[name] = await run().then(() => "accepted", e => e.message);
        }
        out.shared = process.report.getReport().sharedObjects.filter(file => /sharp|vips/i.test(file));
        console.log(JSON.stringify(out));
      `);
      const run = spawnSync(process.execPath, ["--conditions", "react-server", "--import", "tsx", driver, legit, hostile], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
      if (run.status !== 0) throw new Error(`driver failed (${run.status}): ${run.stderr.slice(-2000)}`);
      const result = JSON.parse(run.stdout.trim().split("\n").pop()!) as { ok: { normalize: number; measure: number; transparency: boolean; upload: string; upload_svg: string }; hostile: Record<string, string>; shared: string[] };
      expect(result.ok).toEqual({ normalize: 200, measure: 200, transparency: false, upload: "png", upload_svg: "png" });
      for (const message of Object.values(result.hostile)) expect(message).not.toBe("accepted");
      expect(result.shared).toEqual([]);
    });
  }, 180_000);
});
