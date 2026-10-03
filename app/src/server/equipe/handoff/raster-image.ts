import { readRasterHeader } from "./image-header";
import { ImageChildUnavailable, runImageChild } from "./svg-draw-child";

/** One decoder; byte-bounded waiting list, round-robin between workspace/account scopes. */
export const RASTER_LIMITS = { maxPixels: 40_000_000, maxSide: 30_000, maxBytes: 10 * 1024 * 1024, maxQueuedBytes: 128 * 1024 * 1024, maxAccountQueuedBytes: 50 * 1024 * 1024, maxRssMb: 384, timeoutMs: 8_000, waitMs: 45_000 } as const;
export class RasterImageRejected extends Error {
  constructor(readonly reason: "too_large" | "unreadable") { super(`image_rejected:${reason}`); }
}
/** Capacity and local infrastructure failures must retry the durable step, never become not_found. */
export class RasterRetryError extends Error {
  constructor(readonly reason: "capacity" | "wait_timeout" | "unavailable") { super(`raster_retry:${reason}`); }
}
type Pending = { bytes: number; run: () => Promise<void>; cancel: () => void };
const accounts = new Map<string, Pending[]>();
let running = false, queuedBytes = 0, lastAccount: string | undefined;
function drain() {
  if (running || !accounts.size) return;
  const keys = [...accounts.keys()];
  const key = keys.find(k => k !== lastAccount) ?? keys[0]!;
  const list = accounts.get(key)!, item = list.shift()!;
  accounts.delete(key);
  if (list.length) accounts.set(key, list); // Rotate this account behind every other waiting account.
  queuedBytes -= item.bytes; lastAccount = key; running = true;
  item.cancel();
  void item.run().finally(() => { running = false; drain(); });
}
function enqueue<T>(bytes: number, account: string, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  if (queuedBytes + bytes > RASTER_LIMITS.maxQueuedBytes || (accounts.get(account) ?? []).reduce((total, item) => total + item.bytes, 0) + bytes > RASTER_LIMITS.maxAccountQueuedBytes) return Promise.reject(new RasterRetryError("capacity"));
  return new Promise<T>((resolve, reject) => {
    const remove = (reason: unknown) => {
      const list = accounts.get(account); if (!list) return;
      const at = list.indexOf(item); if (at < 0) return;
      list.splice(at, 1); queuedBytes -= bytes; if (!list.length) accounts.delete(account);
      item.cancel(); reject(reason);
    };
    const aborted = () => remove(new RasterRetryError("wait_timeout"));
    const timer = setTimeout(aborted, RASTER_LIMITS.waitMs);
    const item: Pending = { bytes, cancel: () => { clearTimeout(timer); signal?.removeEventListener("abort", aborted); },
      run: async () => { try { resolve(await run()); } catch (e) { reject(e); } } };
    signal?.addEventListener("abort", aborted, { once: true });
    const list = accounts.get(account) ?? []; list.push(item); accounts.set(account, list); queuedBytes += bytes;
    drain();
  });
}
export function isRasterRetry(error: unknown): boolean {
  // Inngest replays rejected steps as StepError, preserving the message, not our prototype.
  return error instanceof RasterRetryError || (error instanceof Error && error.message.startsWith("raster_retry:"));
}
export function rethrowRasterRetry(error: unknown, signal?: AbortSignal): void {
  if (isRasterRetry(error)) throw error;
  if (signal?.aborted) throw new RasterRetryError("wait_timeout");
}
export type RasterOperation = "validate" | "normalize" | "measure";
export type RasterResult = { data: Buffer; info: { width: number; height: number; format: string } };

/** The existing hand-read header is admission only. Unknown accepted formats (AVIF) are opened only in the child. */
export function admitRaster(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > RASTER_LIMITS.maxBytes) throw new RasterImageRejected("too_large");
  const header = readRasterHeader(bytes, { firstFrame: true, jpegDimensions: true });
  if (header === "unreadable") throw new RasterImageRejected("unreadable");
  if (header !== "unsupported" && header.width && header.height &&
      (header.width * header.height > RASTER_LIMITS.maxPixels || Math.max(header.width, header.height) > RASTER_LIMITS.maxSide)) throw new RasterImageRejected("too_large");
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
    if (m.width * m.height > ${RASTER_LIMITS.maxPixels} || Math.max(m.width, m.height) > ${RASTER_LIMITS.maxSide}) throw Error("image_too_large");
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
export async function processRaster(bytes: Uint8Array, operation: RasterOperation, options: { signal?: AbortSignal; background?: string; contentType?: string; accountKey?: string } = {}): Promise<RasterResult> {
  options.signal?.throwIfAborted();
  const header = admitRaster(bytes);
  const background = options.background ?? "#ffffff";
  if (!/^#[0-9a-f]{6}$/i.test(background)) throw new Error("image_background_invalid");
  return enqueue(bytes.length, options.accountKey ?? "upload", options.signal, async () => {
    try {
      const pixels = typeof header !== "string" && header.width && header.height ? header.width * header.height : RASTER_LIMITS.maxPixels;
      const output = await runImageChild(bytes, { timeoutMs: RASTER_LIMITS.timeoutMs, signal: options.signal, maxRssMb: RASTER_LIMITS.maxRssMb,
        maxOutputBytes: 10 * 1024 * 1024, workerSource: workerSource(operation, pixels, background, options.contentType) });
      const length = output.readUInt32BE(0);
      if (length > 1024 || output.length < 4 + length) throw new RasterImageRejected("unreadable");
      const info = JSON.parse(output.subarray(4, 4 + length).toString("utf8")) as RasterResult["info"];
      if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1) throw new RasterImageRejected("unreadable");
      return { data: output.subarray(4 + length), info };
    } catch (error) {
      if (error instanceof ImageChildUnavailable) throw new RasterRetryError("unavailable");
      // A step deadline after obtaining the slot is still local contention, not a corrupt file.
      if (options.signal?.aborted) throw new RasterRetryError("wait_timeout");
      if (error instanceof RasterImageRejected) throw error;
      throw new RasterImageRejected("unreadable");
    }
  });
}
