import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { MAX_SVG_BYTES, SvgLogoError, looksLikeSvg } from "./svg-sanitize";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const blocked = new BlockList();
for (const [ip, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blocked.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked.addSubnet(ip, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
export type ResolvedAddress = { address: string; family: number };
export type ImageResponse = { statusCode: number; headers: IncomingHttpHeaders; body: AsyncIterable<Uint8Array>; destroy(): void };
export type SafeImageDownloadOptions = {
  lookup?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: (url: URL, address: ResolvedAddress, signal: AbortSignal) => Promise<ImageResponse>;
  timeoutMs?: number; maxBytes?: number; signal?: AbortSignal;
  /** Takes an SVG (up to `MAX_SVG_BYTES`, by its type or, when the server says nothing useful, by its first bytes) and returns it as `image/svg+xml`. Only a logo asks for it: the caller draws it as a PNG and never keeps the SVG. */
  allowSvg?: boolean;
};
export async function resolvePublicUrl(value: string, resolve = (host: string) => lookup(host, { all: true })) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || /(^|\.)(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(host)) throw new Error("unsafe_image_url");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host);
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address) || a.family !== isIP(a.address))) throw new Error("unsafe_image_address");
  return { url, address: addresses[0]! };
}
/** Fresh connection with the validated address; original Host/SNI and TLS verification remain intact. */
export function pinnedImageRequest(url: URL, address: ResolvedAddress, signal: AbortSignal): Promise<ImageResponse> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false, signal,
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      headers: { Accept: "image/*", "Accept-Encoding": "identity" },
    }, res => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: res, destroy: () => res.destroy() }));
    req.on("error", reject);
    req.end();
  });
}
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
/** Thrown for an SVG, a vector file this reader does not take as an image. Told apart from any other unsupported type: a logo that is only an SVG is not found, it did not fail to download. */
export const IMAGE_SVG_UNSUPPORTED = "image_svg_unsupported";
/** Types an SVG is sometimes served with by mistake (or with none): only then do the first bytes decide. */
const SNIFFED_TYPES = new Set(["text/xml", "application/xml", "text/plain", "application/octet-stream", "binary/octet-stream"]);
const SNIFF_BYTES = 4096;
/** Why the response is not an image: an SVG by its type, or by its first bytes when the type says nothing; any other type is just unsupported. */
async function whyNotAnImage(response: ImageResponse, contentType: string | undefined) {
  if (contentType === "image/svg+xml") return IMAGE_SVG_UNSUPPORTED;
  if (contentType && !SNIFFED_TYPES.has(contentType)) return "image_type_unsupported";
  try {
    let head = Buffer.alloc(0);
    for await (const chunk of response.body) {
      head = Buffer.concat([head, Buffer.from(chunk)]);
      if (head.length >= SNIFF_BYTES) break;
    }
    return /<svg[\s>]/i.test(head.subarray(0, SNIFF_BYTES).toString("utf8")) ? IMAGE_SVG_UNSUPPORTED : "image_type_unsupported";
  } catch { return "image_type_unsupported"; }
}
export async function downloadSafeImage(value: string, options: SafeImageDownloadOptions = {}) {
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 15_000), ...(options.signal ? [options.signal] : [])]);
  const maxBytes = Math.min(options.maxBytes ?? MAX_IMAGE_BYTES, MAX_IMAGE_BYTES);
  let current = value;
  for (let hop = 0; hop <= 3; hop++) {
    const { url, address } = await abortable(resolvePublicUrl(current, options.lookup), signal);
    const response = await abortable((options.request ?? pinnedImageRequest)(url, address, signal), signal);
    try {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        if (!location || hop === 3) throw new Error("image_redirect_limit");
        current = new URL(location, url).toString();
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("image_http_error");
      const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
      const raster = !!contentType && IMAGE_TYPES.includes(contentType);
      // A type that says nothing useful (or none) may still be an SVG: with `allowSvg` the body decides, otherwise it is refused by what it is (see `whyNotAnImage`).
      const maybeSvg = options.allowSvg === true && !raster && (contentType === "image/svg+xml" || !contentType || SNIFFED_TYPES.has(contentType));
      if (!raster && !maybeSvg) throw new Error(await abortable(whyNotAnImage(response, contentType), signal));
      const limit = maybeSvg ? Math.min(maxBytes, MAX_SVG_BYTES) : maxBytes;
      // A file past the SVG limit is not a logo this reader can use, which retrying would not change: it is told apart from a download that failed (`SvgLogoError`, like any SVG that cannot be drawn).
      const tooLarge = () => maybeSvg ? new SvgLogoError("svg_too_large") : new Error("image_too_large");
      if (Number(response.headers["content-length"]) > limit) throw tooLarge();
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") throw new Error("image_too_large");
      const consume = async () => {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > limit) throw tooLarge();
          chunks.push(Buffer.from(chunk));
        }
        if (!size) throw new Error("image_empty");
        const bytes = Buffer.concat(chunks);
        if (!maybeSvg) return { bytes, contentType: contentType! };
        if (contentType !== "image/svg+xml" && !looksLikeSvg(bytes)) throw new Error("image_type_unsupported");
        return { bytes, contentType: "image/svg+xml" };
      };
      return await abortable(consume(), signal);
    } finally { response.destroy(); }
  }
  throw new Error("image_redirect_limit");
}
