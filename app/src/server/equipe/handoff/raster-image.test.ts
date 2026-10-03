// Third-party raster images are decoded in a disposable process, never in the server (ticket 17). The path is `processRaster`: the header is read by hand (admission), and what is
// admitted is decoded by the child of the SVG transport (SIGKILL deadline, 384 MiB, one at a time, six waiting). The checks here are about the path itself; a whole reading with 30 hostile
// images, in a clean process, is in `raster-image.read30.test.ts`.
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_VISION_BACKDROP } from "../domain/logo-surface";
import { readRasterHeader } from "./image-header";
import { RASTER_LIMITS, RasterImageRejected, admitRaster, processRaster, type RasterOperation } from "./raster-image";
import { WHITE, animatedBlankWebp, block, blankLosslessWebp, forgedGifHeader, forgedPng, lyingGif, solid } from "./logo-surface.fixtures";
import * as transport from "./svg-draw-child";
import { logger } from "@/lib/logger";

vi.mock("./svg-draw-child", async importOriginal => {
  const actual = await importOriginal<typeof import("./svg-draw-child")>();
  return { ...actual, runImageChild: vi.fn(actual.runImageChild) };
});
const child = vi.mocked(transport.runImageChild);
const actualChild = (await vi.importActual<typeof import("./svg-draw-child")>("./svg-draw-child")).runImageChild;
afterEach(() => { vi.restoreAllMocks(); child.mockReset(); child.mockImplementation(actualChild); });

const decode = (bytes: Uint8Array, operation: RasterOperation = "validate", options: Parameters<typeof processRaster>[2] = {}) => processRaster(bytes, operation, options);
type Outcome = { value?: Awaited<ReturnType<typeof processRaster>>; error?: unknown };
const outcome = (promise: Promise<Awaited<ReturnType<typeof processRaster>>>): Promise<Outcome> => promise.then(value => ({ value }), (error: unknown) => ({ error }));
const rejectedWith = (result: Outcome, reason: string) => { expect(result.error).toBeInstanceOf(RasterImageRejected); expect(result.error).toMatchObject({ message: `image_rejected:${reason}` }); };
/** Every call that opens an image with `sharp` in THIS process, the header included. */
const sharpWork = () => [vi.spyOn(sharp.prototype, "metadata"), vi.spyOn(sharp.prototype, "resize"), vi.spyOn(sharp.prototype, "toBuffer"), vi.spyOn(sharp.prototype, "raw"), vi.spyOn(sharp.prototype, "jpeg")];
const untouched = (spies: Array<{ mock: unknown }>) => { for (const spy of spies) expect(spy).not.toHaveBeenCalled(); };

/** A photograph-like picture (smooth and noisy at once), the same for every format. */
const photo = (width: number, height: number, channels: 3 | 4 = 3) => {
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++)
    raw[(y * width + x) * channels + c] = c === 3 ? 255 : Math.min(255, Math.round(((x * 255) / width + (y * 120) / height + c * 40) % 256) + ((x * 7 + y * 13 + c) % 9));
  return sharp(raw, { raw: { width, height, channels } });
};
/** What the importer, the site and Instagram vision copies and the measure did with `sharp` in the server before ticket 17 (the code on `main`), to compare byte by byte. */
const mainNormalize = (bytes: Uint8Array, background = "#ffffff") =>
  sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
const mainMeasure = (bytes: Uint8Array) =>
  sharp(bytes, { animated: false }).resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: "mitchell" }).ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });

describe("the limits are written down", () => {
  it("32 MiB decoded, 8192 px of side, 10 MiB of file, 6 waiting, 384 MiB for the child and 8 s", () => {
    expect(RASTER_LIMITS).toEqual({ maxDecodedBytes: 33_554_432, maxSide: 8192, maxBytes: 10 * 1024 * 1024, maxWaiting: 6, maxRssMb: 384, timeoutMs: 8_000 });
  });
});

describe("admission: the header says no before any process is started", () => {
  it("the boundary of the ceiling is 32 MiB decoded and one row more is refused (too_large), with no process and no `sharp`", async () => {
    expect(4096 * 2049 * 4).toBeGreaterThan(RASTER_LIMITS.maxDecodedBytes);
    const inputs = await Promise.all([{ width: 4096, height: 2049 }, { width: 4096, height: 1025, depth: 16 as const }, { width: 4096, height: 4097, colorType: 4 as const }, { width: 20000, height: 20000 }].map(forgedPng));
    const spies = sharpWork();
    for (const bytes of inputs) rejectedWith(await outcome(decode(bytes)), "too_large"); // 16 bits count double; grey + alpha two channels
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
  });
  it("a side past 8192 is refused whatever the area: 8193 x 1, 1 x 8193, and the shapes of the review (8388608 x 1, 32768 x 256, 16-bit 2000000 x 2)", async () => {
    const inputs = await Promise.all([{ width: 8193, height: 1 }, { width: 1, height: 8193 }, { width: 8_388_608, height: 1 }, { width: 32_768, height: 256 }, { width: 2_000_000, height: 2, depth: 16 as const }, { width: 10_000_000, height: 1, colorType: 4 as const }].map(forgedPng));
    const spies = sharpWork();
    for (const bytes of inputs) rejectedWith(await outcome(decode(bytes)), "too_large");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
  });
  it("the same for a WebP, a GIF and a JPEG: the canvas of 16383 x 16383 (28 bytes), a screen of 65535 x 65535, a JPEG that says 20000 x 20000", async () => {
    const jpegOf = async (width: number, height: number) => {
      const bytes = Buffer.from(await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } }).jpeg().toBuffer());
      const sof = bytes.indexOf(Buffer.from([0xff, 0xc0])); // Start Of Frame: marker, length, precision, height, width
      bytes.writeUInt16BE(height, sof + 5); bytes.writeUInt16BE(width, sof + 7);
      return bytes;
    };
    const inputs = [blankLosslessWebp(16383, 16383), forgedGifHeader(65535, 65535), await jpegOf(20000, 20000), await jpegOf(8193, 1)];
    const spies = sharpWork();
    for (const bytes of inputs) rejectedWith(await outcome(decode(bytes, "normalize")), "too_large");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
  });
  it("a file past 10 MiB, an empty one and a PNG cut inside its header are refused with no process", async () => {
    const cut = (await block(64, 64, WHITE).png().toBuffer()).subarray(0, 20);
    const spies = sharpWork();
    rejectedWith(await outcome(decode(Buffer.alloc(RASTER_LIMITS.maxBytes + 1))), "too_large");
    rejectedWith(await outcome(decode(Buffer.alloc(0))), "too_large");
    rejectedWith(await outcome(decode(cut)), "unreadable");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
  });
  it("admitRaster answers from the first bytes: the same limits, the dimensions of a JPEG, and a format it does not read (AVIF) is let through to the child", async () => {
    expect(() => admitRaster(Buffer.alloc(0))).toThrow(RasterImageRejected);
    const avif = await block(64, 64, WHITE).avif({ lossless: true }).toBuffer();
    expect(admitRaster(avif)).toBe("unsupported");
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(admitRaster(jpeg)).toMatchObject({ format: "jpeg", width: 300, height: 200 });
  });
  it("the defaults of the header that ticket 16 depends on do not change: a JPEG has no dimensions, an animated WebP is unsupported; the options of ticket 17 turn them on", async () => {
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(readRasterHeader(jpeg)).toEqual({ format: "jpeg", seeThrough: false });
    expect(readRasterHeader(jpeg, { jpegDimensions: true })).toMatchObject({ format: "jpeg", width: 300, height: 200, decodedBytes: 300 * 200 * 3 });
    const animated = animatedBlankWebp(64, 64);
    expect(readRasterHeader(animated)).toBe("unsupported");
    expect(readRasterHeader(animated, { firstFrame: true })).toMatchObject({ format: "webp", width: 64, height: 64 });
  });
});

describe("the pictures that are legitimate come out exactly as `main` made them", () => {
  const FORMATS = [
    ["jpeg", (p: sharp.Sharp) => p.jpeg().toBuffer(), "image/jpeg"], ["png", (p: sharp.Sharp) => p.png().toBuffer(), "image/png"], ["webp", (p: sharp.Sharp) => p.webp().toBuffer(), "image/webp"],
    ["gif", (p: sharp.Sharp) => p.gif().toBuffer(), "image/gif"], ["avif", (p: sharp.Sharp) => p.avif({ effort: 0 }).toBuffer(), "image/avif"],
  ] as const;

  it.each(FORMATS)("%s of 1200 x 800: the normalized copy (JPEG, 1024 px) is byte for byte the one `main` made in the server, and so are its dimensions", async (_name, encode, contentType) => {
    const bytes = await encode(photo(1200, 800));
    const expected = await mainNormalize(bytes);
    const got = await decode(bytes, "normalize", { contentType });
    expect(Buffer.compare(got.data, expected.data)).toBe(0);
    expect(got.info).toMatchObject({ width: expected.info.width, height: expected.info.height, format: "jpeg" });
    expect(got.info.width).toBe(1024);
  });
  it.each(FORMATS)("%s of 1200 x 800: the plain copy is stored as it came and `validate` gives its true dimensions and format", async (name, encode, contentType) => {
    const bytes = await encode(photo(1200, 800));
    const got = await decode(bytes, "validate", { contentType });
    expect(got.info).toMatchObject({ width: 1200, height: 800, format: name === "avif" ? "heif" : name });
    expect(got.data.length).toBe(0); // nothing travels back but the answer: the original bytes stay in the server, untouched
  });
  it("the measure of a logo (128 px, mitchell, raw RGBA) is byte for byte the one `main` made, and the kernel matters (lanczos3 is not the same)", async () => {
    const bytes = await block(1024, 512, solid("#7ed321")).png().toBuffer();
    const expected = await mainMeasure(bytes);
    const got = await decode(bytes, "measure");
    expect(got.info).toMatchObject({ width: expected.info.width, height: expected.info.height, format: "raw" });
    expect(Buffer.compare(got.data, expected.data)).toBe(0);
    const lanczos = await sharp(bytes).resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true }).ensureAlpha().toColourspace("srgb").raw().toBuffer();
    expect(Buffer.compare(got.data, lanczos)).not.toBe(0);
  });
  it("a transparent logo is flattened on the backdrop it is asked for (white by default, the graphite of the dark plate on request), as `main` did", async () => {
    const bytes = await block(800, 800, WHITE).png().toBuffer();
    for (const background of [undefined, LOGO_VISION_BACKDROP.light, LOGO_VISION_BACKDROP.dark]) {
      const got = await decode(bytes, "normalize", { background });
      const expected = await mainNormalize(bytes, background ?? "#ffffff");
      expect(Buffer.compare(got.data, expected.data)).toBe(0);
    }
    await expect(decode(bytes, "normalize", { background: "red; rm -rf /" })).rejects.toThrow("image_background_invalid");
    await expect(decode(bytes, "normalize", { background: "#12345" })).rejects.toThrow("image_background_invalid");
  });
  it("a photo turned by its EXIF orientation is turned the same way", async () => {
    const bytes = await photo(1200, 800).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const got = await decode(bytes, "normalize");
    const expected = await mainNormalize(bytes);
    expect(Buffer.compare(got.data, expected.data)).toBe(0);
    expect(got.info).toMatchObject({ width: 683, height: 1024 });
  });
  it("a picture smaller than 1024 is not enlarged, and a see-through one without alpha needs nothing", async () => {
    const bytes = await photo(300, 200).png().toBuffer();
    const got = await decode(bytes, "normalize");
    expect(got.info).toMatchObject({ width: 300, height: 200 });
    expect(Buffer.compare(got.data, (await mainNormalize(bytes)).data)).toBe(0);
  });
  it("a PNG that takes real memory but is a normal picture (3000 x 2000 RGBA, 24 MB decoded, 2.9 MB of file) is accepted by every operation, `validate` included (it was imported on `main`)", async () => {
    const bytes = await photo(3000, 2000, 4).png({ compressionLevel: 1 }).toBuffer();
    expect(bytes.length).toBeLessThan(RASTER_LIMITS.maxBytes);
    for (const operation of ["validate", "normalize", "measure"] as const) {
      const result = await outcome(decode(bytes, operation));
      expect(result.error, `${operation}: ${String(result.error)}`).toBeUndefined();
    }
  }, 30_000);
});

describe("what `main` did not decode: the first picture of an animation, and AVIF", () => {
  it("an AVIF is decoded in the child, and an animated WebP and an animated GIF give their FIRST picture (not the strip of all frames)", async () => {
    const avif = await block(64, 64, WHITE).avif({ lossless: true }).toBuffer();
    expect((await decode(avif, "validate", { contentType: "image/avif" })).info).toMatchObject({ width: 64, height: 64 });
    const webp = animatedBlankWebp(64, 64);
    expect(await sharp(webp, { animated: true }).metadata()).toMatchObject({ pages: 2, height: 128 }); // it is a real animation: two stacked pictures when all are read
    const first = await decode(webp, "normalize", { contentType: "image/webp" });
    expect(first.info).toMatchObject({ width: 64, height: 64 });
    expect(Buffer.compare(first.data, (await mainNormalize(webp)).data)).toBe(0);
    const gif1 = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#f00" } }).gif().toBuffer();
    const gct = (gif1[10]! & 0x80) ? 3 * (1 << ((gif1[10]! & 7) + 1)) : 0;
    const frame = gif1.subarray(13 + gct, gif1.length - 1);
    const gif = Buffer.concat([gif1.subarray(0, 13 + gct), frame, frame, Buffer.from([0x3b])]); // the same frame twice: two pages
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
    expect((await decode(gif, "validate", { contentType: "image/gif" })).info).toMatchObject({ width: 8, height: 8 });
    expect((await decode(gif, "normalize")).info).toMatchObject({ width: 8, height: 8 });
  });
  it("an AVIF that is hostile is refused by the child's own checks, since its header is not read by hand: more pixels than the header may hold (the limit of pixels), more than 32 MiB decoded", async () => {
    const make = (side: number) => spawnSync(process.execPath, ["-e", `
      require("sharp")({ create: { width: ${side}, height: ${side}, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).avif({ effort: 0, quality: 30 }).toBuffer()
        .then(bytes => process.stdout.write(bytes)).catch(error => { console.error(error); process.exit(1); });`], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }).stdout;
    const spies = sharpWork();
    for (const side of [6000, 9000]) { // 36 and 81 million pixels; 144 MB and 324 MB decoded
      const bytes = make(side);
      expect(bytes.length).toBeGreaterThan(100);
      expect(admitRaster(bytes)).toBe("unsupported"); // admission cannot tell: that is what the child is for
      rejectedWith(await outcome(decode(bytes)), "unreadable"); // accepted by being refused, not by being quick
    }
    untouched(spies);
  }, 60_000);
});

describe("a refused or broken picture is refused as the picture's own, and nothing of it is kept", () => {
  it("bytes that are not what the type says, bytes cut short and a GIF that lies about its frame are refused (unreadable), each with a message that names no content", async () => {
    const png = await photo(200, 100).png().toBuffer();
    const lying = lyingGif(1, 1, 4096, 4095), truncated = png.subarray(0, png.length - 40);
    const spies = sharpWork();
    rejectedWith(await outcome(decode(png, "validate", { contentType: "image/jpeg" })), "unreadable");
    rejectedWith(await outcome(decode(truncated, "validate", { contentType: "image/png" })), "unreadable"); // truncated payload: decoded before it is kept
    rejectedWith(await outcome(decode(lying, "validate")), "unreadable");
    rejectedWith(await outcome(decode(Buffer.from("<html>not an image</html>"), "validate")), "unreadable");
    untouched(spies);
  });
  it("`measure` and `normalize` share the answer's shape and never hand back more than 10 MiB", async () => {
    const bytes = await photo(1200, 800).png().toBuffer();
    expect(child).not.toHaveBeenCalled();
    await decode(bytes, "normalize");
    expect(child.mock.calls[0]![1]).toMatchObject({ maxOutputBytes: 10 * 1024 * 1024, maxRssMb: 384, timeoutMs: 8_000 });
  });
});

describe("no `sharp` in this process, for hostile pictures and for good ones", () => {
  it("not a call of `sharp` is made here by any operation on a picture that is decoded (in the child) or refused (by the header)", async () => {
    const good = await photo(600, 400).png().toBuffer(), jpeg = await photo(600, 400).jpeg().toBuffer();
    const refused = await forgedPng({ width: 6324, height: 6324, depth: 16, interlace: 1 });
    const spies = sharpWork();
    const all = [sharp.prototype.rotate, sharp.prototype.flatten, sharp.prototype.ensureAlpha].map(method => vi.spyOn(sharp.prototype, method.name as "rotate"));
    await decode(good, "normalize"); await decode(jpeg, "validate"); await decode(good, "measure");
    await outcome(decode(refused)); await outcome(decode(Buffer.from("junk")));
    untouched([...spies, ...all]);
    expect(child).toHaveBeenCalledTimes(4); // the three good pictures, and the bytes that no header reads (it is the child that says they are no image)
  });
});

// The transport: the program the child runs is replaced by hostile ones; the watches of the real worker (memory, orphan) are the real ones.
const MARK = `t17-${process.pid}-${Date.now()}`;
const alive = () => spawnSync("ps", ["-ax", "-o", "command="], { encoding: "utf8" }).stdout.split("\n").filter(line => line.includes(MARK) && !line.startsWith("ps "));
const gone = async () => { for (let i = 0; i < 40 && alive().length; i++) await new Promise(resolve => setTimeout(resolve, 50)); return alive(); };
const replaceProgram = (source: string) => child.mockImplementation((input, options) => actualChild(input, { ...options, workerSource: `/*${MARK}*/${source}` }));
const small = () => photo(64, 64).png().toBuffer();

describe("the child is disposable", () => {
  it("a child that is killed by a signal in the middle of the decoding (a crash) is a refused picture, the server lives, and the next picture is decoded", async () => {
    const bytes = await small();
    replaceProgram(`process.stdin.resume(); process.kill(process.pid, "SIGSEGV");`);
    rejectedWith(await outcome(decode(bytes)), "unreadable");
    child.mockImplementation(actualChild);
    expect((await decode(bytes, "validate")).info).toMatchObject({ width: 64, height: 64 });
    expect(await gone()).toEqual([]);
  });
  it("a child that cannot load `sharp` (exit 14) says so in the log as a RASTER decoding problem, not as a drawing of an SVG", async () => {
    const bytes = await small();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    replaceProgram(`process.exit(14)`);
    rejectedWith(await outcome(decode(bytes)), "unreadable");
    expect(error).toHaveBeenCalledWith("[equipe-handoff] raster decoding is unavailable: the decoding process could not load sharp");
    expect(error.mock.calls.some(call => String(call[0]).includes("svg drawing"))).toBe(false);
  });
  it("a child that cannot load `sharp` or exits with an error is a refused picture, and one that says nothing is too", async () => {
    const bytes = await small();
    for (const source of [`process.exit(14)`, `process.exit(1)`, `process.stdin.resume(); process.stdin.on("end", () => process.exit(0))`]) {
      replaceProgram(source);
      rejectedWith(await outcome(decode(bytes)), "unreadable");
    }
  });
  it("a child that answers with something that is not the answer (a header that is too long, dimensions that are not numbers) is a refused picture", async () => {
    const bytes = await small();
    const answer = (header: string) => `const h = Buffer.from(${JSON.stringify(header)}), l = Buffer.alloc(4); l.writeUInt32BE(h.length); process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(Buffer.concat([l, h, Buffer.from("x")]), () => process.exit(0)));`;
    for (const header of [JSON.stringify({ width: 0, height: 5, format: "x" }), JSON.stringify({ width: "5", height: 5, format: "x" }), JSON.stringify({ width: 1.5, height: 5, format: "x" }), "x".repeat(2000)]) {
      replaceProgram(answer(header));
      rejectedWith(await outcome(decode(bytes)), "unreadable");
    }
  });
  it("a child that takes more than 384 MiB is killed by its own watch (the transport says svg_too_complex: the memory letter), the picture is refused, the server does not grow, nothing is left running", async () => {
    const bytes = await small();
    let childError: unknown;
    child.mockImplementation((input, options) => actualChild(input, { ...options, workerSource: `/*${MARK}*/const hold = []; for (let i = 0; i < 40; i++) hold.push(Buffer.alloc(16 * 1048576, 1)); const on = process.stdin.on.bind(process.stdin); process.stdin.on = (name, fn) => on(name, name === "end" ? () => setTimeout(fn, 1000) : fn);${options.workerSource}` })
      .catch(error => { childError = error; throw error; })); // 640 MiB, and the decoding starts a second later: the watch has ticks to run
    const before = process.memoryUsage().rss;
    rejectedWith(await outcome(decode(bytes)), "unreadable");
    expect(childError).toMatchObject({ code: "svg_too_complex" }); // without the watch it would be svg_timeout: what says why is the letter, not the clock
    expect(process.memoryUsage().rss - before).toBeLessThan(64 * 1024 * 1024);
    expect(await gone()).toEqual([]);
  });
  it("a child that never ends is killed at the deadline (SIGKILL, whatever it is doing): 8 s, a refused picture, nothing left running, and the line is free again", async () => {
    const bytes = await small();
    replaceProgram(`process.stdin.resume(); setInterval(() => {}, 1000)`);
    const started = Date.now();
    rejectedWith(await outcome(decode(bytes)), "unreadable");
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(RASTER_LIMITS.timeoutMs - 200);
    expect(took).toBeLessThan(RASTER_LIMITS.timeoutMs + 3_000);
    expect(await gone()).toEqual([]);
    child.mockImplementation(actualChild);
    expect((await decode(bytes, "validate")).info.width).toBe(64);
  }, 30_000);
  it("the caller's own deadline kills the child at once and its reason is what is thrown (not a refused picture)", async () => {
    const bytes = await small();
    replaceProgram(`process.stdin.resume(); setInterval(() => {}, 1000)`);
    const signal = AbortSignal.timeout(300);
    const result = await outcome(decode(bytes, "validate", { signal }));
    expect(result.error).not.toBeInstanceOf(RasterImageRejected);
    expect(result.error).toMatchObject({ name: "TimeoutError" });
    expect(await gone()).toEqual([]);
  });
  it("a caller that has already given up starts nothing", async () => {
    const bytes = await small();
    const reason = new Error("gave up");
    const result = await outcome(decode(bytes, "validate", { signal: AbortSignal.abort(reason) }));
    expect(result.error).toBe(reason);
    expect(child).not.toHaveBeenCalled();
  });
  it("the environment of the child is not the server's: a secret in it never reaches the decoding", async () => {
    const bytes = await small();
    process.env.T17_SECRET_FOR_TEST = "do-not-leak";
    try {
      let seen = "";
      child.mockImplementation(async (input, options) => {
        const out = await actualChild(input, { ...options, workerSource: `/*${MARK}*/const v = JSON.stringify(Object.keys(process.env)); const h = Buffer.from(JSON.stringify({ width: 1, height: 1, format: "env" })), l = Buffer.alloc(4); l.writeUInt32BE(h.length); process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(Buffer.concat([l, h, Buffer.from(v)]), () => process.exit(0)));` });
        seen = out.subarray(4 + out.readUInt32BE(0)).toString();
        return out;
      });
      await decode(bytes);
      expect(seen).toContain("PATH");
      expect(seen).not.toContain("T17_SECRET_FOR_TEST");
    } finally { delete process.env.T17_SECRET_FOR_TEST; }
  });
});

describe("one at a time, six waiting", () => {
  /** Replaces the child with one that waits for the test to let it go, and counts how many run at once. */
  function gated() {
    const gates: Array<() => void> = [];
    let active = 0, peak = 0, started = 0;
    const answer = (header: object) => { const h = Buffer.from(JSON.stringify(header)), l = Buffer.alloc(4); l.writeUInt32BE(h.length); return Buffer.concat([l, h]); };
    child.mockImplementation((() => {
      started++; active++; peak = Math.max(peak, active);
      return new Promise(resolve => gates.push(() => { active--; resolve(answer({ width: 64, height: 64, format: "png" })); }));
    }) as never);
    return { release: () => gates.shift()!(), started: () => started, peak: () => peak, active: () => active };
  }
  const bytes = () => small();

  it("two are never decoded at once: the first is held at the gate, the seven others wait behind it and are served one by one", async () => {
    const input = await bytes(), g = gated();
    const calls = [outcome(decode(input, "validate"))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < 6; i++) calls.push(outcome(decode(input, "validate")));
    for (let turn = 1; turn <= 7; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); expect(g.active()).toBe(1); g.release(); }
    const results = await Promise.all(calls);
    expect(results.every(result => !result.error)).toBe(true);
    expect(g.peak()).toBe(1);
  });
  it("one running and six waiting is the most: the next is refused (busy) with no process, and the seven are served", async () => {
    const input = await bytes(), g = gated();
    const calls = [outcome(decode(input, "validate"))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < 6; i++) calls.push(outcome(decode(input, "validate")));
    rejectedWith(await outcome(decode(input, "validate")), "busy");
    expect(g.started()).toBe(1);
    for (let turn = 1; turn <= 7; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).every(result => !result.error)).toBe(true);
    expect(g.peak()).toBe(1);
    // The line is empty again.
    const again = outcome(decode(input, "validate"));
    await vi.waitFor(() => expect(g.started()).toBe(8)); g.release();
    expect((await again).error).toBeUndefined();
  });
  it("a picture that fails lets the next one through, and a caller that gives up while it waits takes no turn", async () => {
    const input = await bytes(), g = gated();
    const deadline = new AbortController();
    const running = outcome(decode(input, "validate"));
    await vi.waitFor(() => expect(g.started()).toBe(1));
    const abandoned = outcome(decode(input, "validate", { signal: deadline.signal }));
    const behind = outcome(decode(input, "validate"));
    deadline.abort(new Error("deadline"));
    expect(await abandoned).toEqual({ error: expect.objectContaining({ message: "deadline" }) });
    g.release();
    await vi.waitFor(() => expect(g.started()).toBe(2)); // the turn of the one that gave up came and went without a process
    g.release();
    expect((await Promise.all([running, behind])).every(result => !result.error)).toBe(true);
    expect(g.started()).toBe(2);
    expect(g.peak()).toBe(1);
  });
  it("a child that fails does not hold its place: the one behind it is decoded", async () => {
    const input = await bytes();
    let call = 0;
    child.mockImplementation(((...args: Parameters<typeof actualChild>) => (call++ === 0 ? Promise.reject(new Error("crash")) : actualChild(...args))) as never);
    const results = await Promise.all([outcome(decode(input, "validate")), outcome(decode(input, "validate"))]);
    expect(results.filter(result => result.error)).toHaveLength(1);
    expect(results.filter(result => result.value)).toHaveLength(1);
  });
});
