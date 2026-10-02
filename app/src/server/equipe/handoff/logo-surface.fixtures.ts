// Synthetic logos for the tests of ticket 16: built pixel by pixel (or drawn from a tiny inline SVG), never a hostile drawing, never the network.
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
