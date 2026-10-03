// The header of an image read by hand (ticket 16, second round of the review of PR 618): the size a picture takes once decoded and whether it can be see-through, from the first bytes of
// the file, without opening it with `sharp` (libvips reserves a canvas when it opens a WebP or a GIF just to read its header).
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { readRasterHeader } from "./image-header";
import { animatedBlankWebp, blankLosslessWebp, block, forgedGifHeader, WHITE } from "./logo-surface.fixtures";

const be32 = (value: number) => { const out = Buffer.alloc(4); out.writeUInt32BE(value >>> 0); return out; };
const le32 = (value: number) => { const out = Buffer.alloc(4); out.writeUInt32LE(value >>> 0); return out; };
const le24 = (value: number) => Buffer.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
const le16 = (value: number) => Buffer.from([value & 0xff, (value >> 8) & 0xff]);
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pngChunk = (name: string, data: Buffer) => Buffer.concat([be32(data.length), Buffer.from(name), data, Buffer.alloc(4)]);
/** A PNG with the chunks the header reader walks: IHDR, the `before` chunks, one IDAT, the `after` chunks (a name and a size each) and IEND. The pixel data is not real. */
function pngBytes(o: { width: number; height: number; depth: number; colour: number; before?: Array<[string, number]>; after?: Array<[string, number]> }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0); ihdr.writeUInt32BE(o.height, 4); ihdr[8] = o.depth; ihdr[9] = o.colour;
  const extra = (chunks: Array<[string, number]> = []) => chunks.map(([name, size]) => pngChunk(name, Buffer.alloc(size)));
  return Buffer.concat([SIGNATURE, pngChunk("IHDR", ihdr), ...extra(o.before), pngChunk("IDAT", Buffer.alloc(4)), ...extra(o.after), pngChunk("IEND", Buffer.alloc(0))]);
}
const png = (colour: number, depth: number, extras: { before?: Array<[string, number]>; after?: Array<[string, number]> } = {}) => readRasterHeader(pngBytes({ width: 100, height: 50, depth, colour, ...extras }));
const PIXELS = 100 * 50;

describe("PNG: the IHDR and the chunks before the first IDAT", () => {
  it.each([
    ["RGBA, 8 bits", 6, 8, 4], ["RGBA, 16 bits (two bytes a sample)", 6, 16, 8], ["grey + alpha, 8 bits (two bands)", 4, 8, 2], ["grey + alpha, 16 bits", 4, 16, 4],
  ])("%s: see-through for sure, %i bytes a pixel", (_name, colour, depth, bytesPerPixel) => {
    expect(png(colour, depth)).toEqual({ format: "png", width: 100, height: 50, seeThrough: true, decodedBytes: PIXELS * bytesPerPixel });
  });
  it.each([["RGB, 8 bits", 2, 8, 3], ["RGB, 16 bits", 2, 16, 6], ["grey, 8 bits", 0, 8, 1], ["grey, 1 bit (opened as 8)", 0, 1, 1], ["palette, 8 bits (opened as RGB)", 3, 8, 3], ["palette, 4 bits", 3, 4, 3]])(
    "%s with no tRNS: it cannot be see-through, and nothing needs decoding",
    (_name, colour, depth, bytesPerPixel) => {
      expect(png(colour, depth)).toEqual({ format: "png", width: 100, height: 50, seeThrough: false, decodedBytes: PIXELS * bytesPerPixel });
    },
  );
  it.each([["RGB + tRNS (a colour key): a fourth band", 2, 8, 4], ["RGB 16 bits + tRNS", 2, 16, 8], ["grey + tRNS: a second band", 0, 8, 2], ["palette + tRNS: RGBA", 3, 8, 4], ["palette, 1 bit + tRNS", 3, 1, 4]])(
    "%s",
    (_name, colour, depth, bytesPerPixel) => {
      expect(png(colour, depth, { before: [["tRNS", 4]] })).toEqual({ format: "png", width: 100, height: 50, seeThrough: true, decodedBytes: PIXELS * bytesPerPixel });
    },
  );
  it("the chunks before tRNS are walked by their lengths (a colour profile of 1000 bytes, a physical size)", () => {
    expect(png(3, 8, { before: [["iCCP", 1000], ["pHYs", 9], ["PLTE", 768], ["tRNS", 16]] })).toMatchObject({ seeThrough: true, decodedBytes: PIXELS * 4 });
  });
  it("a tRNS after the first IDAT does not count (the format puts it before)", () => {
    expect(png(3, 8, { after: [["tRNS", 4]] })).toMatchObject({ seeThrough: false });
  });
  it("a chunk that says it is longer than the file ends the walk: nothing is read past the bytes", () => {
    const bytes = pngBytes({ width: 100, height: 50, depth: 8, colour: 2 });
    const lying = Buffer.concat([bytes.subarray(0, 33), be32(0xffffffff), Buffer.from("zzzz"), Buffer.alloc(8)]);
    expect(readRasterHeader(lying)).toMatchObject({ format: "png", seeThrough: false });
  });
  it("a file that is only the IHDR (no chunk after it) is read all the same", () => {
    expect(readRasterHeader(pngBytes({ width: 100, height: 50, depth: 8, colour: 6 }).subarray(0, 33))).toMatchObject({ seeThrough: true, decodedBytes: PIXELS * 4 });
  });
  it("the size is the IHDR's whatever the file holds: 100000 x 100000 in 16-bit RGBA claims 80 GB and is read as such", () => {
    expect(readRasterHeader(pngBytes({ width: 100000, height: 100000, depth: 16, colour: 6 }))).toMatchObject({ width: 100000, height: 100000, decodedBytes: 100000 * 100000 * 8 });
    expect(readRasterHeader(pngBytes({ width: 0x7fffffff, height: 0x7fffffff, depth: 16, colour: 6 }))).toMatchObject({ width: 0x7fffffff, height: 0x7fffffff });
  });
  it.each([
    ["a width of zero", { width: 0, height: 50, depth: 8, colour: 6 }], ["a height of zero", { width: 100, height: 0, depth: 8, colour: 6 }],
    ["a width past 2^31 - 1", { width: 0x80000000, height: 50, depth: 8, colour: 6 }], ["a bit depth of 3", { width: 100, height: 50, depth: 3, colour: 6 }],
    ["RGBA in 4 bits", { width: 100, height: 50, depth: 4, colour: 6 }], ["a palette in 16 bits", { width: 100, height: 50, depth: 16, colour: 3 }],
    ["a colour type of 5", { width: 100, height: 50, depth: 8, colour: 5 }], ["a colour type of 1", { width: 100, height: 50, depth: 8, colour: 1 }],
  ])("%s is unreadable", (_name, header) => {
    expect(readRasterHeader(pngBytes(header))).toBe("unreadable");
  });
  it("a first chunk that is not an IHDR of 13 bytes is unreadable, and so is a file cut inside the IHDR", () => {
    const bytes = pngBytes({ width: 100, height: 50, depth: 8, colour: 6 });
    expect(readRasterHeader(Buffer.concat([bytes.subarray(0, 8), be32(12), bytes.subarray(12)]))).toBe("unreadable");
    expect(readRasterHeader(Buffer.concat([bytes.subarray(0, 12), Buffer.from("IHDX"), bytes.subarray(16)]))).toBe("unreadable");
    expect(readRasterHeader(bytes.subarray(0, 32))).toBe("unreadable");
    expect(readRasterHeader(bytes.subarray(0, 8))).toBe("unreadable");
  });
});

describe("JPEG", () => {
  it("is known by its first three bytes and has no alpha channel: no size is needed", () => {
    expect(readRasterHeader(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]))).toEqual({ format: "jpeg", seeThrough: false });
    expect(readRasterHeader(Buffer.from([0xff, 0xd8, 0xff]))).toEqual({ format: "jpeg", seeThrough: false });
    expect(readRasterHeader(Buffer.from([0xff, 0xd8]))).toBe("unsupported");
  });
});

describe("WebP: the first chunk says the kind and the canvas", () => {
  const riff = (...chunks: Buffer[]) => { const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]); return Buffer.concat([Buffer.from("RIFF"), le32(body.length), body]); };
  const chunk = (name: string, payload: Buffer) => Buffer.concat([Buffer.from(name), le32(payload.length), payload, Buffer.alloc(payload.length % 2)]);
  const lossless = (width: number, height: number, alpha: boolean) => { const bytes = Buffer.from(blankLosslessWebp(width, height)); if (!alpha) bytes[24] = bytes[24]! & ~0x10; return bytes; };
  const lossy = (width: number, height: number, scale = 0) => riff(chunk("VP8 ", Buffer.concat([Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]), le16(width | (scale << 14)), le16(height | (scale << 14)), Buffer.alloc(8)])));
  const extended = (flags: number, width: number, height: number) => riff(chunk("VP8X", Buffer.concat([Buffer.from([flags, 0, 0, 0]), le24(width - 1), le24(height - 1)])), chunk("VP8 ", Buffer.alloc(16)));

  it("lossless: 14 bits of width - 1 and of height - 1, so the sizes at both ends of the format", () => {
    expect(readRasterHeader(lossless(1, 1, true))).toEqual({ format: "webp", width: 1, height: 1, seeThrough: true, decodedBytes: 4 });
    expect(readRasterHeader(lossless(16384, 16384, true))).toMatchObject({ width: 16384, height: 16384, decodedBytes: 16384 * 16384 * 4 });
    expect(readRasterHeader(lossless(6324, 5001, true))).toMatchObject({ width: 6324, height: 5001 });
  });
  it("lossless: the alpha bit says whether the picture is see-through (with it off libwebp ignores the alpha channel)", () => {
    expect(readRasterHeader(lossless(300, 200, false))).toMatchObject({ seeThrough: false });
    expect(readRasterHeader(lossless(300, 200, true))).toMatchObject({ seeThrough: true });
  });
  it("lossy with no extended header has no alpha: 14 bits of width and of height, and the scale bits above them are not size", () => {
    expect(readRasterHeader(lossy(300, 200))).toEqual({ format: "webp", width: 300, height: 200, seeThrough: false, decodedBytes: 300 * 200 * 4 });
    expect(readRasterHeader(lossy(16383, 16383))).toMatchObject({ width: 16383, height: 16383 });
    expect(readRasterHeader(lossy(300, 200, 3))).toMatchObject({ width: 300, height: 200 });
  });
  it("extended: the canvas is 24 bits of width - 1 and of height - 1, and its alpha flag is not trusted (the pixels tell)", () => {
    expect(readRasterHeader(extended(0x10, 3000, 2000))).toEqual({ format: "webp", width: 3000, height: 2000, seeThrough: true, decodedBytes: 3000 * 2000 * 4 });
    expect(readRasterHeader(extended(0x00, 3000, 2000))).toMatchObject({ seeThrough: true });
    expect(readRasterHeader(extended(0x20 | 0x08 | 0x04, 100000, 3))).toMatchObject({ width: 100000, height: 3 }); // colour profile, EXIF and XMP flags are not the animation flag
  });
  it("extended with the animation flag is unsupported, whatever the other flags and the size", () => {
    expect(readRasterHeader(extended(0x02, 300, 200))).toBe("unsupported");
    expect(readRasterHeader(extended(0x12, 300, 200))).toBe("unsupported");
    expect(readRasterHeader(extended(0x3e, 16777216, 16777216))).toBe("unsupported");
    expect(readRasterHeader(animatedBlankWebp(64, 64))).toBe("unsupported");
  });
  it("a first chunk that is not one of the three, a wrong signature or start code, a size of zero and a file cut short are unreadable", () => {
    expect(readRasterHeader(riff(chunk("ABCD", Buffer.alloc(16))))).toBe("unreadable");
    const badLossless = Buffer.from(lossless(300, 200, true)); badLossless[20] = 0x2e;
    expect(readRasterHeader(badLossless)).toBe("unreadable");
    const badLossy = Buffer.from(lossy(300, 200)); badLossy[24] = 0x00;
    expect(readRasterHeader(badLossy)).toBe("unreadable");
    expect(readRasterHeader(lossy(0, 200))).toBe("unreadable");
    expect(readRasterHeader(lossy(300, 0))).toBe("unreadable");
    expect(readRasterHeader(lossless(300, 200, true).subarray(0, 24))).toBe("unreadable");
    expect(readRasterHeader(lossy(300, 200).subarray(0, 29))).toBe("unreadable");
    expect(readRasterHeader(extended(0x10, 300, 200).subarray(0, 29))).toBe("unreadable");
    expect(readRasterHeader(lossless(300, 200, true).subarray(0, 19))).toBe("unreadable");
  });
  it("RIFF alone is not a WebP: the format name must be there too", () => {
    expect(readRasterHeader(Buffer.concat([Buffer.from("RIFF"), le32(20), Buffer.from("WAVE"), Buffer.alloc(16)]))).toBe("unsupported");
  });
});

describe("GIF: the logical screen", () => {
  it("is 16 bits of width and of height, little endian, in both versions of the format, and counts three canvases", () => {
    expect(readRasterHeader(forgedGifHeader(300, 200))).toEqual({ format: "gif", width: 300, height: 200, seeThrough: true, decodedBytes: 300 * 200 * 4 * 3 });
    expect(readRasterHeader(forgedGifHeader(65535, 1))).toMatchObject({ width: 65535, height: 1 });
    const old = Buffer.from(forgedGifHeader(300, 200)); old.write("GIF87a", 0, "ascii");
    expect(readRasterHeader(old)).toMatchObject({ format: "gif", width: 300, height: 200 });
  });
  it("a size of zero, a file cut short and a wrong version are not read as a GIF", () => {
    expect(readRasterHeader(forgedGifHeader(0, 200))).toBe("unreadable");
    expect(readRasterHeader(forgedGifHeader(300, 0))).toBe("unreadable");
    expect(readRasterHeader(forgedGifHeader(300, 200).subarray(0, 12))).toBe("unreadable");
    const wrong = Buffer.from(forgedGifHeader(300, 200)); wrong.write("GIF90a", 0, "ascii");
    expect(readRasterHeader(wrong)).toBe("unsupported");
  });
});

describe("what is not read at all", () => {
  it.each([
    ["AVIF (an ISO box: ftyp avif)", Buffer.concat([be32(28), Buffer.from("ftypavif"), Buffer.alloc(16)])], ["HEIC", Buffer.concat([be32(24), Buffer.from("ftypheic"), Buffer.alloc(12)])],
    ["TIFF, little endian", Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])], ["TIFF, big endian", Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8])],
    ["BMP", Buffer.from("BM\0\0\0\0\0\0\0\0")], ["an SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>")], ["text", Buffer.from("not an image at all")],
    ["no bytes", Buffer.alloc(0)], ["zeros", Buffer.alloc(64)], ["a part of the PNG signature", SIGNATURE.subarray(0, 7)],
  ])("%s is unsupported", (_name, bytes) => {
    expect(readRasterHeader(bytes)).toBe("unsupported");
  });
  it("a Uint8Array that is not a Buffer reads the same", () => {
    expect(readRasterHeader(new Uint8Array(pngBytes({ width: 100, height: 50, depth: 8, colour: 6 })))).toMatchObject({ format: "png", width: 100, height: 50 });
    expect(readRasterHeader(new Uint8Array(blankLosslessWebp(100, 50)))).toMatchObject({ format: "webp", width: 100, height: 50 });
  });
});

// What the hand-made reader says must be what libvips says of real files, made by the real encoders: the size, the bands and the bytes of a sample, and above all that a picture it calls
// opaque really has no alpha channel (a wrong "no" would leave a logo unmeasured; a wrong "yes" only costs a decoding).
describe("against libvips, on files the real encoders made", () => {
  const draw = () => block(40, 30, WHITE);
  const files: Array<[string, () => Promise<Buffer>]> = [
    ["PNG RGBA 8 bits", () => draw().png().toBuffer()],
    ["PNG RGBA 8 bits, interlaced", () => draw().png({ progressive: true }).toBuffer()],
    ["PNG RGBA 16 bits", () => draw().toColourspace("rgb16").png().toBuffer()],
    ["PNG grey + alpha", () => draw().greyscale().png().toBuffer()],
    ["PNG RGB opaque", () => draw().flatten({ background: "#ffffff" }).png().toBuffer()],
    ["PNG grey opaque", () => draw().flatten({ background: "#ffffff" }).greyscale().png().toBuffer()],
    ["PNG palette with transparency", () => draw().png({ palette: true }).toBuffer()],
    ["PNG palette, opaque", () => draw().flatten({ background: "#ffffff" }).png({ palette: true }).toBuffer()],
    ["WebP lossless with alpha", () => draw().webp({ lossless: true }).toBuffer()],
    ["WebP lossless, opaque", () => draw().flatten({ background: "#ffffff" }).webp({ lossless: true }).toBuffer()],
    ["WebP lossy, opaque", () => draw().flatten({ background: "#ffffff" }).webp({ quality: 70 }).toBuffer()],
    ["WebP lossy with alpha", () => draw().webp({ quality: 70 }).toBuffer()],
    ["GIF with transparency", () => draw().gif().toBuffer()],
    ["GIF, opaque", () => draw().flatten({ background: "#ffffff" }).gif().toBuffer()],
    ["JPEG", () => draw().flatten({ background: "#ffffff" }).jpeg().toBuffer()],
  ];

  it.each(files)("%s", async (_name, make) => {
    const bytes = await make();
    const header = readRasterHeader(bytes);
    const meta = await sharp(bytes).metadata();
    if (typeof header === "string") throw new Error(`the header of a real file was not read: ${header}`);
    if (header.format === "jpeg") {
      expect(meta.hasAlpha).toBe(false);
      return;
    }
    expect(header).toMatchObject({ width: meta.width, height: meta.height });
    if (!header.seeThrough) expect(meta.hasAlpha).toBe(false); // never a "no" for a picture that has alpha
    if (header.format === "png") expect(header.seeThrough).toBe(meta.hasAlpha);
    const weight = header.format === "gif" ? 3 : 1;
    if (header.seeThrough && meta.hasAlpha) expect(header.decodedBytes).toBe(meta.width! * meta.height! * meta.channels! * (meta.depth === "ushort" ? 2 : 1) * weight);
  });

  it("reads the same from the first 40 bytes of a WebP or a GIF (the rest of the file is not looked at)", async () => {
    for (const make of [files[8]!, files[11]!, files[12]!]) {
      const bytes = await make[1]();
      expect(readRasterHeader(bytes.subarray(0, 40))).toEqual(readRasterHeader(bytes));
    }
  });
});

// The review of PR 619 (finding 4): the walk over the chunks of a PNG ran in the event loop with no limit, and the header was read two to five times for each image.
describe("the walk over the chunks of a PNG is bounded, and the header of a buffer is read once", () => {
  /** A PNG whose IDAT comes after `count` empty `tEXt` chunks (12 bytes each), the shape of the file of the review (872146 of them in 10 MiB). */
  const flood = (count: number, colour = 2, tail: Array<[string, number]> = []) => {
    const head = pngBytes({ width: 1200, height: 800, depth: 8, colour }).subarray(0, 33);
    const filler = Buffer.alloc(12 * count);
    for (let i = 0; i < count; i++) filler.write("tEXt", i * 12 + 4, "latin1");
    const rest = [...tail.map(([name, size]) => pngChunk(name, Buffer.alloc(size))), pngChunk("IDAT", Buffer.alloc(4)), pngChunk("IEND", Buffer.alloc(0))];
    return new Uint8Array(Buffer.concat([head, filler, ...rest]));
  };
  /** The calls that read from the bytes by hand (`ascii` takes a slice each time): a measure of work that does not depend on the speed of the machine. */
  const work = (run: () => void) => { const spy = vi.spyOn(Uint8Array.prototype, "subarray"); try { run(); return spy.mock.calls.length; } finally { spy.mockRestore(); } };

  it("up to 256 chunks are walked up to the IDAT (255 fillers: the tRNS-less PNG is read), and one more is 'unsupported' (never a guess)", () => {
    expect(readRasterHeader(flood(255))).toMatchObject({ format: "png", width: 1200, height: 800, seeThrough: false });
    expect(readRasterHeader(flood(256))).toBe("unsupported");
  });
  it("a tRNS that is found inside the limit still counts, and one that is beyond it is not looked for", () => {
    expect(readRasterHeader(flood(100, 2, [["tRNS", 6]]))).toMatchObject({ seeThrough: true, decodedBytes: 1200 * 800 * 4 });
    const beyond = flood(300), withTrns = new Uint8Array(Buffer.concat([beyond.subarray(0, beyond.length - 24 - 12), pngChunk("tRNS", Buffer.alloc(6)), beyond.subarray(beyond.length - 24 - 12)]));
    expect(readRasterHeader(withTrns)).toBe("unsupported");
  });
  it("the walk stops after 64 KiB of chunks as well: a colour profile of 60000 bytes is walked, one of 70000 followed by anything is 'unsupported'", () => {
    expect(readRasterHeader(new Uint8Array(pngBytes({ width: 100, height: 50, depth: 8, colour: 3, before: [["iCCP", 60_000], ["tRNS", 16]] })))).toMatchObject({ seeThrough: true });
    expect(readRasterHeader(new Uint8Array(pngBytes({ width: 100, height: 50, depth: 8, colour: 3, before: [["iCCP", 70_000], ["tRNS", 16]] })))).toBe("unsupported");
  });
  it("the file of the review (a valid 1200 x 800 PNG of 10 MiB with 872146 empty chunks before the IDAT) costs a bounded handful of reads, not one for each chunk", () => {
    const bytes = flood(872_146);
    expect(bytes.length).toBeGreaterThan(10_400_000);
    expect(bytes.length).toBeLessThanOrEqual(10 * 1024 * 1024); // inside the limit of the file: it is imported
    let header: ReturnType<typeof readRasterHeader> | undefined;
    const reads = work(() => { header = readRasterHeader(bytes); });
    expect(header).toBe("unsupported");
    expect(reads).toBeLessThan(600); // 256 walked chunks and the IHDR; the walk used to make 872146
    const started = performance.now();
    for (let i = 0; i < 20; i++) readRasterHeader(new Uint8Array(bytes.buffer.slice(0, 33 + 12 * 400)));
    expect(performance.now() - started).toBeLessThan(500); // the old walk of the whole file cost about 100 ms for each read of the full file
  });
  it("a buffer is inspected once: the header that comes back is the same whatever the options and however many times it is asked for (the importer, the admission, the measure and the vision copy all ask)", () => {
    const bytes = flood(200, 6);
    const first = work(() => readRasterHeader(bytes, { firstFrame: true, jpegDimensions: true }));
    expect(first).toBeGreaterThan(0);
    const again = work(() => {
      for (const options of [{}, { firstFrame: true }, { jpegDimensions: true }, { firstFrame: true, jpegDimensions: true }, undefined]) readRasterHeader(bytes, options);
    });
    expect(again).toBeLessThanOrEqual(5); // only the cheap checks of the signature that tell the options apart, no new walk
    expect(readRasterHeader(bytes)).toEqual(readRasterHeader(bytes, { firstFrame: true }));
  });
  it("the memory is by buffer, not by content: a second buffer with the same bytes is read on its own, and the defaults of ticket 16 still hold after a call with the options of ticket 17", async () => {
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(readRasterHeader(jpeg, { jpegDimensions: true })).toMatchObject({ format: "jpeg", width: 300, height: 200 });
    expect(readRasterHeader(jpeg)).toEqual({ format: "jpeg", seeThrough: false }); // no dimensions unless asked, even though they were read first
    const animated = animatedBlankWebp(64, 64);
    expect(readRasterHeader(animated, { firstFrame: true })).toMatchObject({ format: "webp", width: 64, height: 64 });
    expect(readRasterHeader(animated)).toBe("unsupported"); // the same buffer, now without the option that lets the first picture through
    const copy = new Uint8Array(animated);
    expect(readRasterHeader(copy)).toBe("unsupported");
    expect(readRasterHeader(copy, { firstFrame: true })).toMatchObject({ format: "webp" });
  });
  it("the verdicts that are not headers are remembered too, and are the same each time: unreadable stays unreadable, unsupported stays unsupported", () => {
    const cut = pngBytes({ width: 100, height: 50, depth: 8, colour: 6 }).subarray(0, 20);
    const avif = new Uint8Array(Buffer.concat([be32(28), Buffer.from("ftypavif"), Buffer.alloc(16)]));
    for (let i = 0; i < 3; i++) { expect(readRasterHeader(cut)).toBe("unreadable"); expect(readRasterHeader(avif, { firstFrame: true, jpegDimensions: true })).toBe("unsupported"); }
  });
  describe("the walk over the segments of a JPEG has the same bounds (256 segments, 64 KiB), and the answer is 'unsupported': the importer sends the picture to the child, the measure of a logo skips it", () => {
    const sof = (width: number, height: number) => Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x11, 0x00]);
    const jpeg = (padding: Buffer, width = 4032, height = 3024) => new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), padding, sof(width, height), Buffer.from([0xff, 0xd9])]));
    const comments = (count: number) => Buffer.concat(Array.from({ length: count }, () => Buffer.from([0xff, 0xfe, 0x00, 0x02])));
    it("up to 256 segments before the frame header are walked (the dimensions come out), one more is unsupported", () => {
      expect(readRasterHeader(jpeg(comments(255)), { jpegDimensions: true })).toMatchObject({ format: "jpeg", width: 4032, height: 3024 });
      expect(readRasterHeader(jpeg(comments(256)), { jpegDimensions: true })).toBe("unsupported");
    });
    it("a run of fill bytes (0xff) or one long segment past 64 KiB is unsupported, and 60000 bytes of profile are walked", () => {
      expect(readRasterHeader(jpeg(Buffer.alloc(70_000, 0xff)), { jpegDimensions: true })).toBe("unsupported");
      const segment = (size: number) => Buffer.concat([Buffer.from([0xff, 0xe2, (size + 2) >> 8, (size + 2) & 0xff]), Buffer.alloc(size)]);
      expect(readRasterHeader(jpeg(segment(60_000)), { jpegDimensions: true })).toMatchObject({ width: 4032 });
      expect(readRasterHeader(jpeg(Buffer.concat([segment(30_000), segment(30_000), segment(30_000)])), { jpegDimensions: true })).toBe("unsupported");
    });
    it("a flood of a million comment segments costs a bounded number of reads, and the default (no dimensions asked) is still the answer of ticket 16", () => {
      const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), comments(1_000_000), sof(100, 100)]));
      const spy = vi.spyOn(Uint8Array.prototype, "subarray");
      try { expect(readRasterHeader(bytes, { jpegDimensions: true })).toBe("unsupported"); expect(spy.mock.calls.length).toBeLessThan(50); } finally { spy.mockRestore(); }
      expect(readRasterHeader(bytes)).toEqual({ format: "jpeg", seeThrough: false });
    });
  });
});
