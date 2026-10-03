// Third-party raster images are decoded in a disposable process, never in the server (ticket 17). The path is `processRaster`: the header is read by hand (admission), and what is
// admitted is decoded by the child of the SVG transport (SIGKILL deadline, 384 MiB, one at a time, a queue bounded in bytes and fair between accounts). The checks here are about the path itself; a whole reading with 30 hostile
// images, in a clean process, is in `raster-image.read30.test.ts`.
import { spawnSync } from "node:child_process";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { LOGO_VISION_BACKDROP } from "../domain/logo-surface";
import { readRasterHeader } from "./image-header";
import { RASTER_LIMITS, RasterImageRejected, RasterRetryError, admitRaster, isRasterRetry, processRaster, rethrowRasterRetry, type RasterOperation } from "./raster-image";
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

/** The first bytes of a JPEG that says `width` x `height` (the header, which is all admission reads). */
const jpegBytes = (width: number, height: number) => {
  const bytes = Buffer.from("ffd8ffc0000b080000000001011100ffd9", "hex");
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9);
  return bytes;
};
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
  it("40 million pixels (the ceiling of `main`), 30000 px of side, 10 MiB of file, 128 MiB queued (50 MiB for one account), 384 MiB for the child, 8 s of decoding and 45 s of waiting", () => {
    expect(RASTER_LIMITS).toEqual({ maxPixels: 40_000_000, maxSide: 30_000, maxBytes: 10 * 1024 * 1024, maxQueuedBytes: 128 * 1024 * 1024, maxAccountQueuedBytes: 50 * 1024 * 1024, maxRssMb: 384, timeoutMs: 8_000, waitMs: 45_000 });
  });
  it("what the importer accepts is what `main` accepted in practice: the ceiling of pixels, and a side of 30000 px at most (a picture 1 px high and 10 million wide was `main`'s way to hold a decoder for seconds); the ceiling of decoded bytes and the side of 8192 are the logo measure's (ticket 16)", () => {
    expect(RASTER_LIMITS.maxSide).toBe(30_000);
    expect(Object.keys(RASTER_LIMITS)).not.toEqual(expect.arrayContaining(["maxDecodedBytes"]));
  });
});

describe("admission: the header says no before any process is started", () => {
  it("the boundary of the ceiling is 40 million pixels whatever the depth or the channels, and one row more is refused (too_large), with no process and no `sharp`", async () => {
    const over = await Promise.all([{ width: 8000, height: 5001 }, { width: 8000, height: 5001, depth: 16 as const }, { width: 8000, height: 5001, colorType: 4 as const }, { width: 20000, height: 20000 }].map(forgedPng));
    const spies = sharpWork();
    for (const bytes of over) rejectedWith(await outcome(decode(bytes)), "too_large");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
    // At the ceiling (and at depths that cost more memory) the header does not refuse: it is the child that protects the memory.
    const at = await Promise.all([{ width: 8000, height: 5000 }, { width: 8000, height: 5000, depth: 16 as const }, { width: 8000, height: 5000, interlace: 1 as const }].map(forgedPng));
    for (const bytes of at) expect(admitRaster(bytes)).toMatchObject({ width: 8000, height: 5000 });
  });
  it("a side is limited at 30000 px, not at 8192: the shapes `main` imported (8193 x 1, 10000 x 2000, 30000 x 1) pass the header, and a longer side is too_large whatever the area (30001 x 1, 8388608 x 1, 4000000 x 10, 10000000 x 1), with no process", async () => {
    const pass = await Promise.all([{ width: 8193, height: 1 }, { width: 1, height: 8193 }, { width: 10_000, height: 2_000 }, { width: 30_000, height: 1 }, { width: 1, height: 30_000 }, { width: 30_000, height: 1_333 }].map(forgedPng));
    for (const bytes of pass) expect(() => admitRaster(bytes)).not.toThrow();
    const fail = await Promise.all([{ width: 30_001, height: 1 }, { width: 1, height: 30_001 }, { width: 8_388_608, height: 1 }, { width: 4_000_000, height: 10, colorType: 4 as const }, { width: 10_000_000, height: 1 }, { width: 2_000_000, height: 2, depth: 16 as const }, { width: 32_768, height: 1_221 }, { width: 40_000_001, height: 1 }].map(forgedPng));
    const spies = sharpWork();
    for (const bytes of fail) rejectedWith(await outcome(decode(bytes)), "too_large");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
  });
  it("the same for a WebP, a GIF and a JPEG: more than 40 MP is refused with no process (the canvas of 16383 x 16383 in 28 bytes, a screen of 65535 x 65535, a JPEG that says 20000 x 20000), and the sizes of a camera are admitted", async () => {
    const jpegOf = async (width: number, height: number) => {
      const bytes = Buffer.from(await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } }).jpeg().toBuffer());
      const sof = bytes.indexOf(Buffer.from([0xff, 0xc0])); // Start Of Frame: marker, length, precision, height, width
      bytes.writeUInt16BE(height, sof + 5); bytes.writeUInt16BE(width, sof + 7);
      return bytes;
    };
    const inputs = [blankLosslessWebp(16383, 16383), forgedGifHeader(65535, 65535), await jpegOf(20000, 20000), await jpegOf(8001, 5000), await jpegOf(30001, 1)];
    const spies = sharpWork();
    for (const bytes of inputs) rejectedWith(await outcome(decode(bytes, "normalize")), "too_large");
    expect(child).not.toHaveBeenCalled();
    untouched(spies);
    for (const [width, height] of [[4032, 3024], [6000, 4000], [8000, 5000], [10000, 2000], [8193, 1], [30000, 1]] as const) expect(() => admitRaster(jpegBytes(width, height))).not.toThrow();
    expect(() => admitRaster(blankLosslessWebp(4032, 3024))).not.toThrow();
    expect(() => admitRaster(forgedGifHeader(4032, 3024))).not.toThrow();
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

describe("the side limit is also the child's: a header the parent cannot read still meets it", () => {
  /** A real, valid grey PNG of 1 x `height` whose IHDR is followed by `chunks` empty `tEXt` chunks (with their checksums): more than 256 of them and the hand-made header gives up ('unsupported'), so the parent cannot judge the side. */
  const tall = async (height: number, chunks: number) => {
    const real = await sharp(Buffer.alloc(height, 0x80), { raw: { width: 1, height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
    const text = Buffer.alloc(12); text.write("tEXt", 4, "latin1"); text.writeUInt32BE(crc32(Buffer.from("tEXt")), 8);
    return Buffer.concat([real.subarray(0, 33), ...Array.from({ length: chunks }, () => text), real.subarray(33)]);
  };
  it("a 1 x 30001 PNG that the header cannot read (300 chunks before the IDAT) is let through by the parent, reaches the child and is refused there (too_large side, before it is decoded), while the same picture of 30000 is decoded: only the guard of the worker can tell them apart", async () => {
    const over = await tall(30_001, 300), at = await tall(30_000, 300);
    expect(over.length).toBeLessThan(RASTER_LIMITS.maxBytes);
    expect(admitRaster(over)).toBe("unsupported"); // the parent cannot see the side
    expect(admitRaster(at)).toBe("unsupported");
    expect((await decode(at, "validate")).info).toMatchObject({ width: 1, height: 30_000 });
    expect(child).toHaveBeenCalledTimes(1);
    rejectedWith(await outcome(decode(over, "validate")), "unreadable");
    expect(child).toHaveBeenCalledTimes(2); // it did go to the child: the parent's guard is not what refused it
    rejectedWith(await outcome(decode(over, "normalize")), "unreadable");
    rejectedWith(await outcome(decode(over, "measure")), "unreadable");
    expect(child).toHaveBeenCalledTimes(4);
  }, 60_000);
  it("the same picture with a header the parent CAN read is refused by the parent alone (no process), so each of the two guards is shown on its own", async () => {
    const over = await tall(30_001, 0);
    rejectedWith(await outcome(decode(over, "validate")), "too_large");
    expect(child).not.toHaveBeenCalled();
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
  it("the photos of a phone and of a camera that `main` imported (12 and 24 MP, a panorama of 10000 x 2000) are accepted by every operation and come out byte for byte as `main` made them", async () => {
    const cases = [
      ["jpeg 4032 x 3024 (12 MP, EXIF 6)", await photo(4032, 3024).jpeg({ quality: 70 }).withMetadata({ orientation: 6 }).toBuffer(), "image/jpeg"],
      ["jpeg 6000 x 4000 (24 MP)", await photo(6000, 4000).jpeg({ quality: 60 }).toBuffer(), "image/jpeg"],
      ["webp 4032 x 3024", await photo(4032, 3024).webp({ quality: 50, effort: 0 }).toBuffer(), "image/webp"],
      ["png 3000 x 3000 RGBA", await photo(3000, 3000, 4).png({ compressionLevel: 1 }).toBuffer(), "image/png"],
      ["panorama jpeg 10000 x 2000", await photo(10000, 2000).jpeg({ quality: 60 }).toBuffer(), "image/jpeg"],
    ] as const;
    for (const [name, bytes, contentType] of cases) {
      expect(bytes.length, name).toBeLessThan(RASTER_LIMITS.maxBytes);
      const validated = await outcome(decode(bytes, "validate", { contentType }));
      expect(validated.error, `${name}: ${String(validated.error)}`).toBeUndefined();
      const got = await decode(bytes, "normalize", { contentType });
      const expected = await mainNormalize(bytes);
      expect(Buffer.compare(got.data, expected.data), name).toBe(0);
      expect(got.info, name).toMatchObject({ width: expected.info.width, height: expected.info.height });
    }
  }, 120_000);
  it("an AVIF of a camera (4032 x 3024) is accepted by the importer (the child protects the memory), and a pixel past 40 MP is not", async () => {
    const avif = await photo(4032, 3024).avif({ effort: 0, quality: 30 }).toBuffer();
    const got = await decode(avif, "normalize", { contentType: "image/avif" });
    expect(got.info).toMatchObject({ width: 1024, height: 768 });
  }, 120_000);
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
  it("an AVIF that is hostile is refused by the child's own checks, since its header is not read by hand: more pixels than the header may hold (the limit of pixels), 40 MP and over", async () => {
    const make = (side: number) => spawnSync(process.execPath, ["-e", `
      require("sharp")({ create: { width: ${side}, height: ${side}, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).avif({ effort: 0, quality: 30 }).toBuffer()
        .then(bytes => process.stdout.write(bytes)).catch(error => { console.error(error); process.exit(1); });`], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }).stdout;
    const spies = sharpWork();
    for (const side of [7000, 9000]) { // 49 and 81 million pixels: over the 40 MP of `main`
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
    const refused = await forgedPng({ width: 6400, height: 6400, depth: 16, interlace: 1 });
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
  it("a child that cannot load `sharp` (exit 14) is a failure of the SYSTEM, not of the picture: a retry error (never a refused picture), logged as a RASTER decoding problem, not as a drawing of an SVG", async () => {
    const bytes = await small();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    replaceProgram(`process.exit(14)`);
    const result = await outcome(decode(bytes));
    expect(result.error).toBeInstanceOf(RasterRetryError);
    expect(result.error).not.toBeInstanceOf(RasterImageRejected);
    expect(result.error).toMatchObject({ reason: "unavailable" });
    expect(error).toHaveBeenCalledWith("[equipe-handoff] raster decoding is unavailable: the decoding process could not load sharp");
    expect(error.mock.calls.some(call => String(call[0]).includes("svg drawing"))).toBe(false);
  });
  it("a child that cannot be started (no `node` to run) is a retry error with its own `error` line in the log (it used to say nothing), and the line moves on afterwards", async () => {
    const bytes = await small();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const real = process.execPath;
    Object.defineProperty(process, "execPath", { value: "/nonexistent/node-for-t17", configurable: true });
    let result: Outcome;
    try { result = await outcome(decode(bytes)); } finally { Object.defineProperty(process, "execPath", { value: real, configurable: true }); }
    expect(result.error).toBeInstanceOf(RasterRetryError);
    expect(result.error).toMatchObject({ reason: "unavailable" });
    expect(error).toHaveBeenCalledWith("[equipe-handoff] raster decoding is unavailable: the decoding process could not start");
    expect((await decode(bytes, "validate")).info).toMatchObject({ width: 64, height: 64 });
  });
  it("the infrastructure failures of the transport are retry errors whatever the operation (validate, normalize, measure) and the caller can tell them from a refused picture with `rethrowRasterRetry`", async () => {
    const bytes = await small();
    child.mockImplementation((() => Promise.reject(new transport.ImageChildUnavailable("raster_spawn_failed"))) as never);
    for (const operation of ["validate", "normalize", "measure"] as const) {
      const result = await outcome(decode(bytes, operation));
      expect(result.error, operation).toMatchObject({ reason: "unavailable" });
      expect(() => rethrowRasterRetry(result.error)).toThrow(result.error as Error);
    }
    expect(() => rethrowRasterRetry(new RasterImageRejected("unreadable"))).not.toThrow(); // the picture's own refusal is for the caller to count
    expect(() => rethrowRasterRetry(new Error("x"))).not.toThrow();
    expect(() => rethrowRasterRetry(new Error("x"), AbortSignal.abort())).toThrow(RasterRetryError); // a deadline is never "this picture is bad"
  });
  it("`isRasterRetry` tells a retry of the raster from anything else, also after a durable step replays the error (it comes back as a plain Error with the message only)", () => {
    expect(isRasterRetry(new RasterRetryError("capacity"))).toBe(true);
    expect(isRasterRetry(Object.assign(new Error("raster_retry:wait_timeout"), { name: "StepError" }))).toBe(true);
    expect(isRasterRetry(new RasterImageRejected("unreadable"))).toBe(false);
    expect(isRasterRetry(new Error("image_rejected:unreadable"))).toBe(false);
    expect(isRasterRetry("raster_retry:capacity")).toBe(false);
    expect(isRasterRetry(undefined)).toBe(false);
    expect(() => rethrowRasterRetry(Object.assign(new Error("raster_retry:unavailable"), { name: "StepError" }))).toThrow("raster_retry:unavailable");
  });
  it("a child that exits with an error or says nothing is still the picture's own refusal (only the system's failures are retried)", async () => {
    const bytes = await small();
    for (const source of [`process.exit(1)`, `process.stdin.resume(); process.stdin.on("end", () => process.exit(0))`]) {
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
    expect(process.memoryUsage().rss - before).toBeLessThan(160 * 1024 * 1024); // the child held 640 MiB: what the SERVER may take is a quarter of that at most (the earlier 64 MiB was inside the noise of the allocator of a busy worker)
    expect(await gone()).toEqual([]);
  });
  it("a child that never ends is killed at ITS deadline (SIGKILL, whatever it is doing): 8 s, and the picture that did it is still a refused picture (RasterImageRejected, not a retry), nothing left running, and the line is free again", async () => {
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
  it("the caller's own deadline kills the child at once and it is a retry error of the step (reason wait_timeout), never a refused picture", async () => {
    const bytes = await small();
    replaceProgram(`process.stdin.resume(); setInterval(() => {}, 1000)`);
    const signal = AbortSignal.timeout(300);
    const result = await outcome(decode(bytes, "validate", { signal }));
    expect(result.error).not.toBeInstanceOf(RasterImageRejected);
    expect(result.error).toBeInstanceOf(RasterRetryError);
    expect(result.error).toMatchObject({ reason: "wait_timeout" });
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

describe("one at a time, a queue bounded in bytes and fair between accounts", () => {
  /** Replaces the child with one that waits for the test to let it go, and counts how many run at once. `order` is the label of each picture, in the order the child was started. */
  function gated(labels = new Map<Uint8Array, string>()) {
    const gates: Array<() => void> = [];
    const order: string[] = [];
    let active = 0, peak = 0, started = 0;
    const answer = (header: object) => { const h = Buffer.from(JSON.stringify(header)), l = Buffer.alloc(4); l.writeUInt32BE(h.length); return Buffer.concat([l, h]); };
    child.mockImplementation(((input: Uint8Array) => {
      started++; active++; peak = Math.max(peak, active); order.push(labels.get(input) ?? "?");
      return new Promise(resolve => gates.push(() => { active--; resolve(answer({ width: 64, height: 64, format: "png" })); }));
    }) as never);
    return { release: () => gates.shift()!(), started: () => started, peak: () => peak, active: () => active, order };
  }
  const bytes = () => small();
  /** A picture the header admits that weighs `size` bytes in all (the tail is ignored: the child is the gate here). */
  const padded = async (size: number) => { const head = await small(); return Buffer.concat([head, Buffer.alloc(size - head.length)]); };

  it("two are never decoded at once: the first is held at the gate, the others wait behind it and are served one by one (no limit of six: they all wait)", async () => {
    const input = await bytes(), g = gated();
    const calls = [outcome(decode(input, "validate"))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < 20; i++) calls.push(outcome(decode(input, "validate")));
    for (let turn = 1; turn <= 21; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); expect(g.active()).toBe(1); g.release(); }
    const results = await Promise.all(calls);
    expect(results.every(result => !result.error)).toBe(true);
    expect(g.peak()).toBe(1);
  });

  it("the simultaneous readings of the review all get their turn: 3 and 6 accounts, 4 pictures each at once, every picture is decoded and none is refused or retried", async () => {
    for (const accounts of [3, 6]) {
      const labels = new Map<Uint8Array, string>(), g = gated(labels);
      const calls: Array<Promise<Outcome>> = [];
      for (let a = 0; a < accounts; a++) for (let i = 0; i < 4; i++) { const input = await bytes(); labels.set(input, `a${a}`); calls.push(outcome(decode(input, "validate", { accountKey: `w:a${a}` }))); }
      for (let turn = 1; turn <= accounts * 4; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
      const results = await Promise.all(calls);
      expect(results.filter(result => result.error)).toEqual([]);
      expect(g.peak()).toBe(1);
    }
  });

  it("the line is fair between accounts: one that has queued twenty pictures does not take the turn of the others (they alternate, the account that just ran goes behind every other that waits)", async () => {
    const labels = new Map<Uint8Array, string>(), g = gated(labels);
    const calls: Array<Promise<Outcome>> = [];
    const add = async (label: string) => { const input = await bytes(); labels.set(input, label); calls.push(outcome(decode(input, "validate", { accountKey: label[0]! }))); };
    await add("A1"); await vi.waitFor(() => expect(g.started()).toBe(1)); // A1 is running
    for (let i = 2; i <= 6; i++) await add(`A${i}`); // A fills the line first
    await add("B1"); await add("C1"); await add("B2");
    for (let turn = 1; turn <= 9; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).filter(result => result.error)).toEqual([]);
    // Everybody is served, and the line does not belong to the account that filled it: B and C are served within the first turns, and no account runs twice in a row while another waits.
    expect(g.order).toHaveLength(9);
    expect(g.order.slice(0, 4)).toEqual(expect.arrayContaining(["B1", "C1"]));
    expect(g.order.indexOf("B2")).toBeLessThan(g.order.indexOf("A4"));
    const remaining = (at: number) => new Set(g.order.slice(at + 1).map(label => label[0]));
    for (let at = 0; at < g.order.length - 1; at++) if (g.order[at]![0] === g.order[at + 1]![0]) expect(remaining(at + 1).size, `turn ${at}: ${g.order.join(",")}`).toBeLessThanOrEqual(1);
  });

  it("without an account key every picture is the same account (the uploads of the route): still one at a time, in order", async () => {
    const labels = new Map<Uint8Array, string>(), g = gated(labels);
    const calls: Array<Promise<Outcome>> = [];
    for (let i = 1; i <= 4; i++) { const input = await bytes(); labels.set(input, `U${i}`); calls.push(outcome(decode(input, "validate"))); }
    for (let turn = 1; turn <= 4; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    await Promise.all(calls);
    expect(g.order).toEqual(["U1", "U2", "U3", "U4"]);
  });

  it("the queue is bounded by BYTES that wait (128 MiB), not by count: twelve of 10 MiB wait, the next that would pass the ceiling is a retry error (capacity) with no process, never a refused picture", async () => {
    const big = await padded(RASTER_LIMITS.maxBytes), g = gated();
    expect(big.length).toBe(RASTER_LIMITS.maxBytes);
    const calls = [outcome(decode(await bytes(), "validate"))]; // the one that runs does not count as waiting
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < 12; i++) calls.push(outcome(decode(big, "validate", { accountKey: `acc${i}` })));
    const refused = await outcome(decode(big, "validate", { accountKey: "late" }));
    expect(refused.error).toBeInstanceOf(RasterRetryError);
    expect(refused.error).not.toBeInstanceOf(RasterImageRejected);
    expect(refused.error).toMatchObject({ reason: "capacity" });
    expect(g.started()).toBe(1);
    for (let turn = 1; turn <= 13; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).filter(result => result.error)).toEqual([]);
    // The line is empty again, and the bytes that waited are free.
    const again = outcome(decode(big, "validate"));
    await vi.waitFor(() => expect(g.started()).toBe(14)); g.release();
    expect((await again).error).toBeUndefined();
  });

  it("one account cannot take the whole room: it may have RASTER_LIMITS.maxAccountQueuedBytes (50 MiB) waiting (a site reading is five operations of 10 MiB at the most, all of them waiting when the decoder serves another account), the next of the same account is a retry error (capacity) while another account still fits", async () => {
    const big = await padded(RASTER_LIMITS.maxBytes), g = gated();
    const fits = Math.floor(RASTER_LIMITS.maxAccountQueuedBytes / big.length);
    expect(fits).toBe(5);
    expect(fits * big.length).toBeLessThan(RASTER_LIMITS.maxQueuedBytes); // one account alone cannot fill the global line
    const calls = [outcome(decode(await bytes(), "validate", { accountKey: "first" }))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < fits; i++) calls.push(outcome(decode(big, "validate", { accountKey: "greedy" }))); // the whole room of one account
    const refused = await outcome(decode(big, "validate", { accountKey: "greedy" }));
    expect(refused.error).toBeInstanceOf(RasterRetryError);
    expect(refused.error).toMatchObject({ reason: "capacity" });
    calls.push(outcome(decode(big, "validate", { accountKey: "polite" }))); // the room of the others is intact
    for (let turn = 1; turn <= fits + 2; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).filter(result => result.error)).toEqual([]);
    // Served, the account has room again.
    const again = outcome(decode(big, "validate", { accountKey: "greedy" }));
    await vi.waitFor(() => expect(g.started()).toBe(fits + 3)); g.release();
    expect((await again).error).toBeUndefined();
  });

  it("many small pictures fit where few big ones do not: hundreds of KB-sized pictures wait without a limit of count", async () => {
    const g = gated(), input = await bytes();
    const calls = [outcome(decode(input, "validate"))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    for (let i = 0; i < 200; i++) calls.push(outcome(decode(input, "validate", { accountKey: `acc${i % 7}` })));
    for (let turn = 1; turn <= 201; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).filter(result => result.error)).toEqual([]);
  }, 30_000);

  it("a caller that gives up while it waits frees its bytes and its turn: it gets a retry error (wait_timeout) with no process, and the room it held is taken by the next", async () => {
    const big = await padded(RASTER_LIMITS.maxBytes), g = gated();
    const calls = [outcome(decode(await bytes(), "validate"))];
    await vi.waitFor(() => expect(g.started()).toBe(1));
    const deadline = new AbortController();
    for (let i = 0; i < 11; i++) calls.push(outcome(decode(big, "validate", { accountKey: `acc${i}` })));
    const abandoned = outcome(decode(big, "validate", { signal: deadline.signal, accountKey: "gone" })); // 12 x ~10 MiB wait: the line is full
    expect((await outcome(decode(big, "validate", { accountKey: "late" }))).error).toMatchObject({ reason: "capacity" });
    deadline.abort(new Error("deadline"));
    const gone = await abandoned;
    expect(gone.error).toBeInstanceOf(RasterRetryError);
    expect(gone.error).toMatchObject({ reason: "wait_timeout" });
    const late = outcome(decode(big, "validate", { accountKey: "late" })); // the bytes of the one that left are free: now it fits
    calls.push(late);
    for (let turn = 1; turn <= 13; turn++) { await vi.waitFor(() => expect(g.started()).toBe(turn)); g.release(); }
    expect((await Promise.all(calls)).filter(result => result.error)).toEqual([]);
    expect(g.started()).toBe(13); // 1 + 11 + the late one: the one that gave up took no process
  });

  it("the wait has a deadline of its own (45 s): the picture that does not get its turn is a retry error (wait_timeout), not a refused picture, and the one that runs is not touched", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const input = await bytes(), g = gated();
      const running = outcome(decode(input, "validate"));
      expect(g.started()).toBe(1);
      const waiting = outcome(decode(input, "validate", { accountKey: "other" }));
      await vi.advanceTimersByTimeAsync(RASTER_LIMITS.waitMs - 1);
      expect(g.started()).toBe(1);
      await vi.advanceTimersByTimeAsync(2);
      const result = await waiting;
      expect(result.error).toBeInstanceOf(RasterRetryError);
      expect(result.error).toMatchObject({ reason: "wait_timeout" });
      g.release();
      expect((await running).error).toBeUndefined();
      expect(g.started()).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it("the wait deadline of a picture that got its turn is gone (it is not cut at 45 s while the child runs: that is the 8 s of the child)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const input = await bytes(), g = gated();
      const running = outcome(decode(input, "validate"));
      expect(g.started()).toBe(1);
      await vi.advanceTimersByTimeAsync(RASTER_LIMITS.waitMs * 2);
      g.release();
      expect((await running).error).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("a picture that fails lets the next one through, and a caller that gives up while it waits takes no turn", async () => {
    const input = await bytes(), g = gated();
    const deadline = new AbortController();
    const running = outcome(decode(input, "validate"));
    await vi.waitFor(() => expect(g.started()).toBe(1));
    const abandoned = outcome(decode(input, "validate", { signal: deadline.signal }));
    const behind = outcome(decode(input, "validate"));
    deadline.abort(new Error("deadline"));
    expect((await abandoned).error).toMatchObject({ reason: "wait_timeout" });
    g.release();
    await vi.waitFor(() => expect(g.started()).toBe(2)); // the turn of the one that gave up came and went without a process
    g.release();
    expect((await Promise.all([running, behind])).every(result => !result.error)).toBe(true);
    expect(g.started()).toBe(2);
    expect(g.peak()).toBe(1);
  });

  it("a child that fails does not hold its place: the one behind it is decoded, and the failure of the system and the refusal of the picture both free the line", async () => {
    const input = await bytes();
    let call = 0;
    child.mockImplementation(((...args: Parameters<typeof actualChild>) => (call++ === 0 ? Promise.reject(new Error("crash")) : actualChild(...args))) as never);
    const results = await Promise.all([outcome(decode(input, "validate")), outcome(decode(input, "validate"))]);
    expect(results.filter(result => result.error)).toHaveLength(1);
    expect(results.filter(result => result.value)).toHaveLength(1);
    child.mockReset();
    const failures = [new transport.ImageChildUnavailable("raster_spawn_failed"), new RasterImageRejected("unreadable"), new Error("crash")];
    let n = 0;
    child.mockImplementation(((...args: Parameters<typeof actualChild>) => (n < failures.length ? Promise.reject(failures[n++]) : actualChild(...args))) as never);
    const all = await Promise.all([1, 2, 3, 4].map(() => outcome(decode(input, "validate"))));
    expect(all.filter(result => result.error)).toHaveLength(3);
    expect(all.filter(result => result.value)).toHaveLength(1);
  });

  it("a child whose `close` never comes after the kill does not hold the line forever: the next picture is decoded after the deadline of the child", async () => {
    const input = await bytes();
    replaceProgram(`process.stdin.resume(); setInterval(() => {}, 1000)`);
    const first = outcome(decode(input, "validate"));
    child.mockImplementation(actualChild);
    const second = outcome(decode(input, "validate"));
    rejectedWith(await first, "unreadable");
    expect((await second).value?.info).toMatchObject({ width: 64, height: 64 });
  }, 30_000);
});
