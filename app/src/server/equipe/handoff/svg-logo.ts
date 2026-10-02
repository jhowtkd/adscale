import pLimit from "p-limit";
import sharp from "sharp";
import { SvgLogoError, sanitizeSvg } from "./svg-sanitize";

export { MAX_SVG_BYTES, SVG_LOGO_LONG_SIDE_PX, SvgLogoError, looksLikeSvg, type SvgRejection } from "./svg-sanitize";

/** The most a caller waits for the drawing, the wait for its turn included (a hostile file can still be slow to draw while being small). */
export const SVG_RENDER_TIMEOUT_MS = 8_000;
/** The output is at most 1024 px on its longest side; this is the ceiling the renderer is told to honor, with room for rounding. */
const MAX_RENDER_PIXELS = 1_100_000;
/**
 * One SVG at a time in this process. The renderer runs in the thread pool the server also uses for DNS lookups and files, and a slow one cannot be interrupted:
 * with a single place, a file that takes long delays the next logo, and never takes the pool.
 */
const oneAtATime = pLimit(1);
/**
 * Drawings that may wait for their turn behind the one in progress. Each waiting one holds its file in memory and a drawing that went past its deadline keeps its place
 * until it ends, so past this a flood is refused at once (`svg_busy`) instead of queued without limit.
 */
const MAX_WAITING = 6;

export type RasterizedSvg = { png: Buffer; width: number; height: number };

function withDeadline<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SvgLogoError("svg_timeout")), timeoutMs);
    const abort = () => reject(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", abort); });
  });
}

/**
 * Sanitizes an untrusted SVG logo (see `svg-sanitize.ts`) and draws it as a PNG with a transparent background, at most 1024 px on its longest side. This is the
 * ONLY thing kept of the file: the SVG itself is never stored, so it can never be served to a browser. A file that cannot be turned into a logo (too big,
 * not well formed, nothing to draw, too slow) throws `SvgLogoError`; the caller treats it as a logo that was not found, or a file that cannot be read.
 */
export async function rasterizeSvgLogo(source: Uint8Array, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<RasterizedSvg> {
  const clean = sanitizeSvg(source);
  options.signal?.throwIfAborted();
  if (oneAtATime.pendingCount >= MAX_WAITING) throw new SvgLogoError("svg_busy");
  let expired = false;
  const render = oneAtATime(async () => {
    if (expired) throw new SvgLogoError("svg_timeout"); // Waited its turn past its own deadline: nobody is listening any more.
    try {
      const { data, info } = await sharp(Buffer.from(clean.svg, "utf8"), { density: 72, limitInputPixels: MAX_RENDER_PIXELS, failOn: "error" })
        .png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
      // A file whose every shape was left out (or never drew anything) is not a logo: a blank picture would be taken for one.
      const alpha = (await sharp(data).stats()).channels[3];
      if (info.channels === 4 && alpha && alpha.max === 0) throw new SvgLogoError("svg_empty");
      return { png: data, width: info.width, height: info.height };
    } catch (error) {
      throw error instanceof SvgLogoError ? error : new SvgLogoError("svg_render_failed");
    }
  });
  try { return await withDeadline(render, options.timeoutMs ?? SVG_RENDER_TIMEOUT_MS, options.signal); }
  finally { expired = true; }
}
