import pLimit from "p-limit";
import { drawInChild } from "./svg-draw-child";
import { SvgLogoError, sanitizeSvg } from "./svg-sanitize";

export { MAX_SVG_BYTES, SVG_LOGO_LONG_SIDE_PX, SvgLogoError, looksLikeSvg, type SvgRejection } from "./svg-sanitize";

/** The most a caller waits for the drawing, the wait for its turn included. Past it the drawing is killed (it runs in a process of its own: `svg-draw-child.ts`). */
export const SVG_RENDER_TIMEOUT_MS = 8_000;
/**
 * One SVG at a time per server process: each drawing is a process of its own and the instance is small. A drawing that goes past its deadline is killed, so it never
 * keeps its place.
 */
const oneAtATime = pLimit(1);
/**
 * Drawings that may wait for their turn behind the one in progress. Each waiting one holds its file in memory, so past this a flood is refused at once (`svg_busy`) instead of
 * queued without limit.
 */
const MAX_WAITING = 6;

export type RasterizedSvg = { png: Buffer; width: number; height: number };

/** The size of a PNG, read from its header (the first 24 bytes), so what the drawing process says is not taken on trust. */
function pngSize(png: Buffer): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((byte, index) => png[index] !== byte) || png.toString("ascii", 12, 16) !== "IHDR") throw new SvgLogoError("svg_render_failed");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Sanitizes an untrusted SVG logo (see `svg-sanitize.ts`) and draws it as a PNG with a transparent background, at most 1024 px on its longest side. This is the
 * ONLY thing kept of the file: the SVG itself is never stored, so it can never be served to a browser. A file that cannot be turned into a logo (too big,
 * not well formed, too complex, nothing to draw, too slow) throws `SvgLogoError`; the caller treats it as a logo that was not found, or a file that cannot be read.
 * The drawing happens in a disposable process that is killed at the deadline, so nothing a file does to the renderer can touch the server.
 */
export async function rasterizeSvgLogo(source: Uint8Array, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<RasterizedSvg> {
  const clean = sanitizeSvg(source);
  options.signal?.throwIfAborted();
  if (oneAtATime.pendingCount >= MAX_WAITING) throw new SvgLogoError("svg_busy");
  const timeoutMs = options.timeoutMs ?? SVG_RENDER_TIMEOUT_MS;
  // One controller for the caller's signal and the deadline: aborting it kills the process if the drawing started, and keeps it from starting if it has not.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new SvgLogoError("svg_timeout")), timeoutMs);
  const forward = () => controller.abort(options.signal!.reason);
  options.signal?.addEventListener("abort", forward, { once: true });
  const aborted = new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
  aborted.catch(() => undefined);
  try {
    const drawing = oneAtATime(() => { controller.signal.throwIfAborted(); return drawInChild(clean.svg, { timeoutMs, signal: controller.signal }); });
    drawing.catch(() => undefined); // When the caller stopped waiting its rejection has no one to go to.
    const png = await Promise.race([drawing, aborted]);
    return { png, ...pngSize(png) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  }
}
