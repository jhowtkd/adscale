import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

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
      if (!contentType || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(contentType)) throw new Error("image_type_unsupported");
      if (Number(response.headers["content-length"]) > maxBytes || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) throw new Error("image_too_large");
      const consume = async () => {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new Error("image_too_large");
          chunks.push(Buffer.from(chunk));
        }
        if (!size) throw new Error("image_empty");
        return { bytes: Buffer.concat(chunks), contentType };
      };
      return await abortable(consume(), signal);
    } finally { response.destroy(); }
  }
  throw new Error("image_redirect_limit");
}
