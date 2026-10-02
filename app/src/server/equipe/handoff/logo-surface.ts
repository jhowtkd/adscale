import pLimit from "p-limit";
import sharp from "sharp";
import { LOGO_PLATES, type LogoSurface } from "../domain/logo-surface";

/**
 * Which plate a logo is shown on, judged from its pixels, once, when it is stored (ticket 16).
 *
 * The question is not "is the logo light or dark" but "on which plate is more of its ink still there": a logo with a white word and a colored one (the owner's)
 * is neither, and the plate that keeps both is the dark one. Every opaque pixel is the ink, weighted by its opacity; it is LOST on a plate when its contrast with
 * the plate is under `lostBelowContrast` (it would be a ghost). The plate that loses less ink wins, and the light one, the plate the mesa always had, is
 * only given up when the dark one saves at least `darkMustSave` of the ink. So a logo that has always looked right stays as it is, and one
 * that has no plate that keeps all of it (white ink and black ink in the same measure) also stays on the light one: no flat plate holds it.
 */
export const LOGO_SURFACE_RULE = {
  /** A pixel less opaque than this (about 6%) is no ink: the exporters leave arbitrary colors in the transparent part of a PNG. */
  minInkAlpha: 16,
  /** A pixel at or above this is opaque. */
  opaqueAlpha: 250,
  /** A logo with fewer see-through pixels than this share brings its own background (a photo, a badge with a square frame): it needs no plate of ours. */
  minSeeThroughShare: 0.005,
  /** Below this contrast (WCAG ratio) ink counts as lost on a plate: a ghost. At 2:1 a gold or an orange logo, which has always looked right on the light plate, would be sent to the dark one. */
  lostBelowContrast: 1.5,
  /** The dark plate wins only when it keeps this much more of the ink (share of the whole) than the light one. */
  darkMustSave: 0.25,
  /** The logo is measured at this size on its longest side, never larger: the weight of each pixel is its share of the area, so the answer does not depend on the file's size. */
  measureSide: 128,
  /**
   * What decoding may hold in memory, read from the header (width x height x channels x 1 byte, or 2 for 16 bits): past it the logo is not measured (it is stored all the
   * same, without the datum, like a logo from before the measurement). `limitInputPixels` bounds pixels, not memory: an interlaced 16-bit PNG of 490 KB or a lossless WebP of
   * 1.7 KB, both 40 MP, take 170 to 350 MB of the process to open; at this size the worst format measured takes about 45 MB (an interlaced 16-bit PNG of 2000 x 2000).
   * A logo does not need more: 32 MiB is 8 MP of 8-bit RGBA (4000 x 2000) or 4 MP of 16-bit RGBA.
   */
  maxDecodedBytes: 32 * 1024 * 1024,
  /** Measures that may wait for their turn behind the one in progress (one runs at a time in the process): past it the logo is not measured. */
  maxWaiting: 4,
} as const;

/** The logo was left unmeasured on purpose: too big to decode here, or the queue is full. Never a failure: it is stored all the same, without the datum. */
export class LogoSurfaceSkipped extends Error {
  constructor(readonly code: "too_large" | "busy") {
    super(`logo_surface_skipped:${code}`);
    this.name = "LogoSurfaceSkipped";
  }
}

// The bytes of one sample of a decoded image, by the depth its header names. An unknown depth counts as 4: an unusual file is never taken for cheaper than it is.
const SAMPLE_BYTES: Record<string, number> = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, complex: 8, double: 8, dpcomplex: 16 };
/** What the image takes in memory once decoded, from its header alone (`metadata()` allocates no pixel). */
export const decodedBytes = (header: Pick<sharp.Metadata, "width" | "height" | "channels" | "depth">) =>
  (header.width ?? 0) * (header.height ?? 0) * (header.channels ?? 4) * (SAMPLE_BYTES[header.depth ?? "uchar"] ?? 4);

// One measure at a time in the process, like the drawing of an SVG: each decode holds up to `maxDecodedBytes` (and a little more), and the upload route and the reading job share the process.
const oneAtATime = pLimit(1);

// sRGB to relative luminance (WCAG): a table, since every pixel of the measure goes through it.
const LINEAR = Float64Array.from({ length: 256 }, (_, value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
const luminance = (r: number, g: number, b: number) => 0.2126 * LINEAR[r]! + 0.7152 * LINEAR[g]! + 0.0722 * LINEAR[b]!;
const hexLuminance = (hex: string) => luminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const plateLuminance = (surface: LogoSurface) => (hexLuminance(LOGO_PLATES[surface].from) + hexLuminance(LOGO_PLATES[surface].to)) / 2;
const LIGHT = plateLuminance("light");
const DARK = plateLuminance("dark");

export type LogoSurfaceReading = {
  surface: LogoSurface;
  /** Share of the ink (0 to 1) that would be lost on each plate. */
  lostOnLight: number;
  lostOnDark: number;
  /** Share of the pixels that are see-through. */
  seeThrough: number;
};

/**
 * The plate for a logo given as 8-bit RGBA pixels (not premultiplied), or `null` when there is nothing to judge: no pixel is see-through (the logo carries its own
 * background) or none is opaque enough to be ink (an empty image). Pure: the same pixels always give the same answer.
 */
export function readLogoSurface(rgba: Uint8Array): LogoSurfaceReading | null {
  const rule = LOGO_SURFACE_RULE;
  const pixels = Math.floor(rgba.length / 4);
  let seeThrough = 0, ink = 0, lostOnLight = 0, lostOnDark = 0;
  for (let index = 0; index < pixels; index++) {
    const alpha = rgba[index * 4 + 3]!;
    if (alpha < rule.opaqueAlpha) seeThrough++;
    if (alpha < rule.minInkAlpha) continue;
    const weight = alpha / 255;
    const own = luminance(rgba[index * 4]!, rgba[index * 4 + 1]!, rgba[index * 4 + 2]!);
    ink += weight;
    if (contrast(own, LIGHT) < rule.lostBelowContrast) lostOnLight += weight;
    if (contrast(own, DARK) < rule.lostBelowContrast) lostOnDark += weight;
  }
  if (pixels === 0 || ink === 0 || seeThrough / pixels < rule.minSeeThroughShare) return null;
  const light = lostOnLight / ink, dark = lostOnDark / ink;
  return { surface: light - dark >= rule.darkMustSave ? "dark" : "light", lostOnLight: light, lostOnDark: dark, seeThrough: seeThrough / pixels };
}

/**
 * Measures the stored bytes of a logo (a decoded raster: PNG, JPEG, WebP, GIF, AVIF; the SVG of a logo is already the PNG it was drawn as). `null` when the logo
 * needs no plate of ours (no alpha channel, or nothing see-through) or when there is nothing to judge. It throws `LogoSurfaceSkipped` when the logo is not measured on
 * purpose (decoding it would hold more than `maxDecodedBytes`, or `maxWaiting` measures already wait) and an `Error` when the bytes cannot be decoded: callers treat both
 * as "not measured", never as a reason to refuse the logo.
 */
export async function measureLogoSurface(bytes: Uint8Array): Promise<LogoSurface | null> {
  const rule = LOGO_SURFACE_RULE;
  // The header says what the decoding would cost, and what is in it, without decoding: `metadata()` allocates no pixel (the limit is lifted here because it applies to pixels that are not read).
  const header = await sharp(bytes, { limitInputPixels: false, animated: false }).metadata();
  // A format without an alpha channel (a JPEG, an opaque PNG) needs nothing: no pixel is decoded.
  if (!header.hasAlpha) return null;
  const cost = decodedBytes(header);
  if (!(cost > 0)) throw new Error("logo_header_unreadable");
  if (cost > rule.maxDecodedBytes) throw new LogoSurfaceSkipped("too_large");
  if (oneAtATime.pendingCount >= rule.maxWaiting) throw new LogoSurfaceSkipped("busy");
  return oneAtATime(async () => {
    // `mitchell` on purpose: the default (lanczos3) overshoots at every edge, and the overshoot is a light pixel that was never in the logo (measured: 12% of a flat lime logo "lost" on the light plate).
    const { data } = await sharp(bytes, { limitInputPixels: Math.floor(rule.maxDecodedBytes / 2), animated: false })
      .resize({ width: rule.measureSide, height: rule.measureSide, fit: "inside", withoutEnlargement: true, kernel: "mitchell" })
      .ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    return readLogoSurface(data)?.surface ?? null;
  });
}
