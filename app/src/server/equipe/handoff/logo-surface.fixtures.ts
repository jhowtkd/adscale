// Synthetic logos for the tests of ticket 16: built pixel by pixel (or drawn from a tiny inline SVG), never a hostile drawing, never the network.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

export type Rgba = readonly [number, number, number, number];
export const WHITE: Rgba = [255, 255, 255, 255];
export const BLACK: Rgba = [0, 0, 0, 255];
export const NONE: Rgba = [255, 255, 255, 0];

export const hexRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export const solid = (hex: string, alpha = 255): Rgba => { const [r, g, b] = hexRgb(hex); return [r, g, b, alpha]; };

/** Raw 8-bit RGBA pixels, one `paint(x, y)` per pixel. */
export function rgbaPixels(width: number, height: number, paint: (x: number, y: number) => Rgba): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(paint(x, y), (y * width + x) * 4);
  return out;
}

/** A sharp pipeline over those pixels. */
export const fromRgba = (width: number, height: number, paint: (x: number, y: number) => Rgba) =>
  sharp(Buffer.from(rgbaPixels(width, height, paint)), { raw: { width, height, channels: 4 } });

/**
 * A logo made of vertical stripes inside a transparent margin (10% on every side): each stripe takes `share` of the stripes' total width, left to right.
 * The ink is exactly what the stripes say; everything outside is see-through.
 */
export function stripes(width: number, height: number, parts: ReadonlyArray<{ color: Rgba; share: number }>) {
  const mx = Math.round(width * 0.1), my = Math.round(height * 0.1);
  const inner = width - 2 * mx, total = parts.reduce((sum, p) => sum + p.share, 0);
  const edges: number[] = [];
  let acc = 0;
  for (const p of parts) { acc += p.share / total; edges.push(mx + Math.round(acc * inner)); }
  return fromRgba(width, height, (x, y) => {
    if (x < mx || x >= width - mx || y < my || y >= height - my) return NONE;
    return parts[edges.findIndex(edge => x < edge)]!.color;
  });
}

/** One flat colour shape (a block) in a transparent margin. */
export const block = (width: number, height: number, color: Rgba) => stripes(width, height, [{ color, share: 1 }]);

export const png = (pipeline: sharp.Sharp) => pipeline.png().toBuffer();

/** Mean luminance (WCAG) of the ink, weighted by opacity: what a "mean of the luminance" rule would have used. */
export function meanInkLuminance(width: number, height: number, paint: (x: number, y: number) => Rgba): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  let sum = 0, weight = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = paint(x, y);
    if (a < 16) continue;
    const w = a / 255;
    sum += w * (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)); weight += w;
  }
  return weight === 0 ? 0 : sum / weight;
}

/** A PNG made of a white word (thick bars) and a cyan-to-purple gradient (bars and two chevrons) on a transparent canvas: the shape of the owner's logo. */
export function ownerLikeLogo(width = 640, height = 160) {
  const paint = (x: number, y: number): Rgba => {
    const u = x / width, v = y / height;
    const inBar = (x0: number, x1: number) => u >= x0 && u < x1 && v >= 0.2 && v < 0.8;
    // The white word: three thick bars on the left 55%.
    if (inBar(0.04, 0.12) || inBar(0.18, 0.26) || inBar(0.32, 0.40) || inBar(0.46, 0.54)) return WHITE;
    // Two chevrons (a triangle outline each) and two bars in the gradient, on the right.
    const t = Math.min(1, Math.max(0, (u - 0.6) / 0.38));
    const grad: Rgba = [Math.round(0 + t * 124), Math.round(240 - t * 170), Math.round(255 - t * 10), 255];
    const chevron = (cx: number) => { const dx = Math.abs(u - cx), dy = Math.abs(v - 0.5); return dy < 0.3 && dx < 0.04 && dx > 0.06 - dy * 0.1 - 0.04 ? true : (dy < 0.3 && Math.abs(dx - dy * 0.12) < 0.025); };
    if (chevron(0.66) || chevron(0.74) || inBar(0.84, 0.90) || inBar(0.93, 0.98)) return grad;
    return NONE;
  };
  return { width, height, paint, pipeline: fromRgba(width, height, paint) };
}

// ---- Headers that say more than the file holds (ticket 16, memory limits) --------------------------------------------------------------------------------------------------------------

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/**
 * A small valid PNG whose IHDR is rewritten (size, bit depth, colour type, interlacing) with its CRC recomputed: `metadata()` reads the header and allocates nothing, so a
 * file of a few dozen bytes can claim any size. colourType 6 = RGBA, 4 = grey + alpha, 2 = RGB (no alpha). It is not decodable at the size it claims.
 */
export async function forgedPng(header: { width: number; height: number; depth?: 8 | 16; colorType?: 6 | 4 | 2; interlace?: 0 | 1 }): Promise<Buffer> {
  const bytes = Buffer.from(await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } }).png().toBuffer());
  // signature (8) + length (4) + "IHDR" (4) + 13 bytes of data + crc (4)
  bytes.writeUInt32BE(header.width, 16);
  bytes.writeUInt32BE(header.height, 20);
  bytes[24] = header.depth ?? 8;
  bytes[25] = header.colorType ?? 6;
  bytes[28] = header.interlace ?? 0;
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

/** The first bytes of a GIF whose logical screen is `width` x `height`, and a trailer: not a picture, but its header says what it says. */
export const forgedGifHeader = (width: number, height: number) =>
  Buffer.concat([Buffer.from("GIF89a"), Buffer.from([width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0, 0]), Buffer.from([0x3b])]);

// ---- WebP files of any size in a few bytes (second round of the review of PR 618) --------------------------------------------------------------------------------------------------

const le32 = (value: number) => { const out = Buffer.alloc(4); out.writeUInt32LE(value >>> 0); return out; };
const le24 = (value: number) => Buffer.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
const chunk = (name: string, payload: Buffer) => Buffer.concat([Buffer.from(name), le32(payload.length), payload, Buffer.alloc(payload.length % 2)]);
const riff = (...chunks: Buffer[]) => { const body = Buffer.concat([Buffer.from("WEBP"), ...chunks]); return Buffer.concat([Buffer.from("RIFF"), le32(body.length), body]); };
/** The VP8L chunk of a picture where every pixel is transparent black: no transform, no colour cache, one prefix group and five codes of one symbol each, so no pixel takes a single bit. */
const blankLosslessChunk = (width: number, height: number) => {
  const payload = Buffer.alloc(8);
  payload[0] = 0x2f;
  payload.writeUInt32LE((((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | (1 << 28)) >>> 0, 1);
  payload.set([0x88, 0x88, 0x08], 5);
  return chunk("VP8L", payload);
};
/**
 * A valid lossless WebP of any size up to 16383 x 16383 in 28 bytes (every pixel transparent black). libwebp opens it like any other, so it costs what a real file of that size costs to open
 * and nothing to make: the 16383 x 16383 file of the review, the largest the format allows, is 3 KB and takes a gigabyte of canvas to build.
 */
export const blankLosslessWebp = (width: number, height: number) => riff(blankLosslessChunk(width, height));
/** A valid animated WebP of two frames of the same blank picture (the container of an animation: VP8X with the animation flag, ANIM, two ANMF). */
export const animatedBlankWebp = (width: number, height: number) => {
  const frame = () => chunk("ANMF", Buffer.concat([le24(0), le24(0), le24(width - 1), le24(height - 1), le24(100), Buffer.from([0]), blankLosslessChunk(width, height)]));
  return riff(chunk("VP8X", Buffer.concat([Buffer.from([0x12, 0, 0, 0]), le24(width - 1), le24(height - 1)])), chunk("ANIM", Buffer.alloc(6)), frame(), frame());
};

// ---- Files whose decoding is expensive (the review's four, plus one inside the ceiling) ------------------------------------------------------------------------------------------------

/**
 * Writes the logos the review of PR 618 measured, in a child process (decoding them to build them takes hundreds of MB, and the worker of the test run must not hold that):
 * a 6324 x 6324 transparent canvas with a white rectangle, as an interlaced 16-bit PNG (~480 KB), a lossless WebP (~2 KB), and 8-bit PNGs, interlaced or not; and a 2000 x 2000
 * interlaced 16-bit RGBA PNG (30.5 MiB decoded, inside the ceiling). With `formats` it adds a lossless WebP and an AVIF of 2890 x 2890 (31.9 MiB decoded, just inside the ceiling) and two GIFs:
 * 1670 x 1670 (inside: a GIF counts three canvases) and 2890 x 2890 (over).
 * Returns the directory and the paths.
 */
export function writeBigLogoFiles(options: { formats?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "logo-surface-"));
  const script = `
    const sharp = require("sharp"); const path = require("node:path");
    const canvas = (side, rect) => sharp({ create: { width: side, height: side, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
      .composite([{ input: { create: { width: rect[0], height: rect[1], channels: 4, background: "#ffffff" } }, left: 100, top: 100 }]);
    (async () => {
      const dir = process.argv[1];
      await canvas(6324, [2000, 600]).toColourspace("rgb16").png({ compressionLevel: 9, progressive: true }).toFile(path.join(dir, "png16-interlaced-6324.png"));
      await canvas(6324, [2000, 600]).webp({ lossless: true }).toFile(path.join(dir, "webp-lossless-6324.webp"));
      await canvas(6324, [2000, 600]).png({ compressionLevel: 9, progressive: true }).toFile(path.join(dir, "png8-interlaced-6324.png"));
      await canvas(6324, [2000, 600]).png({ compressionLevel: 9 }).toFile(path.join(dir, "png8-6324.png"));
      await canvas(2000, [1200, 360]).toColourspace("rgb16").png({ compressionLevel: 9, progressive: true }).toFile(path.join(dir, "png16-interlaced-2000.png"));
      if (process.argv[2] === "formats") {
        await canvas(2890, [1200, 360]).webp({ lossless: true, effort: 0 }).toFile(path.join(dir, "webp-lossless-2890.webp"));
        await canvas(2890, [1200, 360]).gif({ effort: 1 }).toFile(path.join(dir, "gif-2890.gif"));
        await canvas(1670, [700, 200]).gif({ effort: 1 }).toFile(path.join(dir, "gif-1670.gif"));
        await canvas(2890, [1200, 360]).avif({ effort: 0, quality: 40 }).toFile(path.join(dir, "avif-2890.avif"));
      }
    })().catch(error => { console.error(error); process.exit(1); });`;
  const run = spawnSync(process.execPath, ["-e", script, dir, ...(options.formats ? ["formats"] : [])], { cwd: process.cwd(), encoding: "utf8" });
  if (run.status !== 0) throw new Error(`fixtures not written: ${run.stderr}`);
  const file = (name: string) => path.join(dir, name);
  return {
    dir, png16: file("png16-interlaced-6324.png"), webp: file("webp-lossless-6324.webp"), png8Interlaced: file("png8-interlaced-6324.png"), png8: file("png8-6324.png"), png16Inside: file("png16-interlaced-2000.png"),
    webpInside: file("webp-lossless-2890.webp"), gifOver: file("gif-2890.gif"), gifInside: file("gif-1670.gif"), avifInside: file("avif-2890.avif"),
  };
}
