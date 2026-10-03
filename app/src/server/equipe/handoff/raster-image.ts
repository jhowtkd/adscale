import pLimit from "p-limit";
import { readRasterHeader } from "./image-header";
import { runImageChild } from "./svg-draw-child";

/** One native decoder per server, including upload logo measurements. Queued files are bounded too. */
const oneAtATime = pLimit(1);
export const RASTER_LIMITS = { maxDecodedBytes: 32 * 1024 * 1024, maxSide: 8192, maxBytes: 10 * 1024 * 1024, maxWaiting: 6, maxRssMb: 384, timeoutMs: 8_000 } as const;
export class RasterImageRejected extends Error {
  constructor(readonly reason: "too_large" | "busy" | "unreadable") { super(`image_rejected:${reason}`); }
}
export type RasterOperation = "validate" | "normalize" | "measure";
export type RasterResult = { data: Buffer; info: { width: number; height: number; format: string } };

/** The existing hand-read header is admission only. Unknown accepted formats (AVIF) are opened only in the child. */
export function admitRaster(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > RASTER_LIMITS.maxBytes) throw new RasterImageRejected("too_large");
  const header = readRasterHeader(bytes, { firstFrame: true, jpegDimensions: true });
  if (header === "unreadable") throw new RasterImageRejected("unreadable");
  if (header !== "unsupported" && header.width && header.height &&
      (header.width > RASTER_LIMITS.maxSide || header.height > RASTER_LIMITS.maxSide || (header.decodedBytes ?? 0) > RASTER_LIMITS.maxDecodedBytes)) throw new RasterImageRejected("too_large");
  return header;
}

// Uses the SVG worker's transport, allowlisted environment, SIGKILL deadline and orphan handling. No webpack module id crosses the process boundary.
function workerSource(operation: RasterOperation, pixels: number, background: string, contentType?: string) {
  return String.raw`
const fs = require("fs");
const die = why => { try { fs.writeSync(2, why); } catch {} process.kill(process.pid, "SIGKILL"); };
const parent = process.ppid;
setInterval(() => { if (process.memoryUsage.rss() > Number(process.env.SVG_DRAW_MAX_RSS_MB) * 1048576) die("M"); if (process.ppid !== parent) die("O"); }, 10);
setTimeout(() => die("T"), Number(process.env.SVG_DRAW_TIMEOUT_MS));
let sharp;
try { sharp = require("sharp"); sharp.cache(false); sharp.concurrency(1); } catch { process.exit(14); }
const chunks = []; let size = 0;
process.stdin.on("data", chunk => { size += chunk.length; if (size > ${RASTER_LIMITS.maxBytes}) die("I"); chunks.push(chunk); });
process.stdin.on("end", async () => {
  try {
    const image = sharp(Buffer.concat(chunks), { limitInputPixels: ${pixels}, animated: false });
    const m = await image.metadata();
    const types = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", heif: "image/avif" };
    if (!m.width || !m.height || !types[m.format] || (m.format === "heif" && m.compression !== "av1") || (${JSON.stringify(contentType ?? null)} && types[m.format] !== ${JSON.stringify(contentType ?? null)})) throw Error("image_bytes_invalid");
    if (m.width > ${RASTER_LIMITS.maxSide} || m.height > ${RASTER_LIMITS.maxSide} || m.width * m.height * (m.channels || 4) * (m.depth === "ushort" ? 2 : 1) > ${RASTER_LIMITS.maxDecodedBytes}) throw Error("image_too_large");
    let data = Buffer.alloc(0), info = { width: m.width, height: m.height, format: m.format };
    if (${JSON.stringify(operation)} === "normalize") {
      const out = await image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: ${JSON.stringify(background)} }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      data = out.data; info = { width: out.info.width, height: out.info.height, format: "jpeg" };
    } else if (${JSON.stringify(operation)} === "measure") {
      const out = await image.resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: "mitchell" }).ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
      data = out.data; info = { width: out.info.width, height: out.info.height, format: "raw" };
    // A full decode with a small bounded output; reducing PNGs all the way to 1px makes libvips allocate expensive shrink strips.
    } else { await image.resize(128, 128, { fit: "inside", withoutEnlargement: true }).raw().toBuffer(); }
    const header = Buffer.from(JSON.stringify(info)), length = Buffer.alloc(4); length.writeUInt32BE(header.length);
    process.stdout.write(Buffer.concat([length, header, data]), () => process.exit(0));
  } catch { die("D"); }
});
`;
}

/** Original pixels never open in the server, including metadata(). Rejection belongs to this image, not its reading. */
export async function processRaster(bytes: Uint8Array, operation: RasterOperation, options: { signal?: AbortSignal; background?: string; contentType?: string } = {}): Promise<RasterResult> {
  options.signal?.throwIfAborted();
  const header = admitRaster(bytes);
  if (oneAtATime.pendingCount >= RASTER_LIMITS.maxWaiting) throw new RasterImageRejected("busy");
  const background = options.background ?? "#ffffff";
  if (!/^#[0-9a-f]{6}$/i.test(background)) throw new Error("image_background_invalid");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new RasterImageRejected("unreadable")), RASTER_LIMITS.timeoutMs);
  const forward = () => controller.abort(options.signal!.reason);
  options.signal?.addEventListener("abort", forward, { once: true });
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
  aborted.catch(() => undefined);
  try {
    const work = oneAtATime(async () => {
      controller.signal.throwIfAborted();
      const pixels = typeof header !== "string" && header.width && header.height ? header.width * header.height : 40_000_000;
      const output = await runImageChild(bytes, { timeoutMs: RASTER_LIMITS.timeoutMs, signal: controller.signal, maxRssMb: RASTER_LIMITS.maxRssMb,
        maxOutputBytes: 10 * 1024 * 1024, workerSource: workerSource(operation, pixels, background, options.contentType) });
      const length = output.readUInt32BE(0);
      if (length > 1024 || output.length < 4 + length) throw new RasterImageRejected("unreadable");
      const info = JSON.parse(output.subarray(4, 4 + length).toString("utf8")) as RasterResult["info"];
      if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1) throw new RasterImageRejected("unreadable");
      return { data: output.subarray(4 + length), info };
    });
    work.catch(() => undefined);
    return await Promise.race([work, aborted]);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof RasterImageRejected) throw error;
    throw new RasterImageRejected("unreadable");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  }
}
