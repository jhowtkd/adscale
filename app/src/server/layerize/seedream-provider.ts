import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import pLimit from "p-limit";
import type { LayerizationLayer } from "./contracts";

export const SEEDREAM_LAYERIZE_MODEL_ID = "bytedance/seedream/v5/pro/edit";
export const SEEDREAM_QUEUE_URL = `https://queue.fal.run/${SEEDREAM_LAYERIZE_MODEL_ID}`;
export const SEEDREAM_PROVIDER_ENDPOINT = SEEDREAM_QUEUE_URL;
export const SEEDREAM_PROVIDER_DOCS_URL = `https://fal.ai/models/${SEEDREAM_LAYERIZE_MODEL_ID}/api`;
export const SEEDREAM_LIFECYCLE_SECONDS = 3600;
export const SEEDREAM_MEDIA_HOSTS = ["fal.media", "v3.fal.media", "v3b.fal.media"] as const;
export const SEEDREAM_MAX_LAYERS = 17;
export const SEEDREAM_MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const SEEDREAM_MAX_TOTAL_ASSET_BYTES = 200 * 1024 * 1024;
export const SEEDREAM_MAX_CANVAS_PIXELS = 40_000_000;
export const SEEDREAM_MAX_RESPONSE_BYTES = 256 * 1024;

export type SeedreamProviderStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export class SeedreamProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_configuration"
      | "provider_error"
      | "invalid_provider_response"
      | "unsafe_media" = "provider_error",
  ) {
    super(message);
    this.name = "SeedreamProviderError";
  }
}

type FetchLike = typeof fetch;

type SeedreamRequest = {
  prompt: string;
  imageUrl: string;
  callbackUrl?: string;
};

export type SeedreamProvider = {
  submit(input: SeedreamRequest): Promise<{ requestId: string }>;
  status(requestId: string): Promise<SeedreamProviderStatus>;
  result(requestId: string): Promise<unknown>;
};

function apiKeyOrThrow(apiKey = process.env.FAL_KEY): string {
  if (!apiKey?.trim()) {
    throw new SeedreamProviderError("FAL_KEY is not configured", "missing_configuration");
  }
  return apiKey.trim();
}

function providerHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
    "X-Fal-Store-IO": "0",
    "X-Fal-No-Retry": "1",
    "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
      expiration_duration_seconds: SEEDREAM_LIFECYCLE_SECONDS,
    }),
    "x-app-fal-disable-fallback": "true",
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  if (!response.body) {
    throw new SeedreamProviderError("Seedream response has no body", "invalid_provider_response");
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > SEEDREAM_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new SeedreamProviderError("Seedream response is too large", "invalid_provider_response");
    }
    chunks.push(Buffer.from(next.value));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SeedreamProviderError("Seedream returned invalid JSON", "invalid_provider_response");
  }
}

function requestIdFrom(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new SeedreamProviderError("Seedream response has no request id", "invalid_provider_response");
  }
  const requestId = (payload as { request_id?: unknown }).request_id;
  if (typeof requestId !== "string" || requestId.trim().length < 1 || requestId.length > 256) {
    throw new SeedreamProviderError("Seedream response has no request id", "invalid_provider_response");
  }
  return requestId.trim();
}

function normalizeStatus(payload: unknown): SeedreamProviderStatus {
  const status = payload && typeof payload === "object"
    ? (payload as { status?: unknown }).status
    : undefined;
  if (status === "IN_QUEUE" || status === "IN_PROGRESS" || status === "COMPLETED" || status === "FAILED") {
    return status;
  }
  throw new SeedreamProviderError("Seedream returned an unknown status", "invalid_provider_response");
}

export function createSeedreamProvider(options: {
  apiKey?: string;
  fetchImpl?: FetchLike;
} = {}): SeedreamProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchImpl(`${SEEDREAM_QUEUE_URL}${path}`, {
      ...init,
      headers: providerHeaders(apiKeyOrThrow(options.apiKey)),
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new SeedreamProviderError(
        `Seedream request failed with ${response.status}`,
        "provider_error",
      );
    }
    return readProviderJson(response);
  }

  return {
    async submit(input) {
      const payload = await request("", {
        method: "POST",
        body: JSON.stringify({
          prompt: input.prompt,
          image_urls: [input.imageUrl],
          enable_safety_checker: true,
          ...(input.callbackUrl ? { webhook_url: input.callbackUrl } : {}),
        }),
      });
      return { requestId: requestIdFrom(payload) };
    },
    async status(requestId) {
      const payload = await request(`/requests/${encodeURIComponent(requestId)}/status`, { method: "GET" });
      return normalizeStatus(payload);
    },
    async result(requestId) {
      return request(`/requests/${encodeURIComponent(requestId)}/response`, { method: "GET" });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  return values.find(isRecord) ?? null;
}

function stringValue(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function numberValue(...values: unknown[]): number | null {
  const value = values.find((candidate) => typeof candidate === "number" && Number.isFinite(candidate));
  return typeof value === "number" ? value : null;
}

function imageUrlFrom(value: Record<string, unknown>): string | null {
  const image = firstRecord(value.image, value.asset, value.output);
  return stringValue(value.image_url, value.url, image?.url, image?.image_url);
}

function bboxFrom(value: Record<string, unknown>, width: number, height: number) {
  const bbox = firstRecord(value.bounding_box, value.boundingBox, value.bbox) ?? value;
  const x = numberValue(bbox.x, bbox.left);
  const y = numberValue(bbox.y, bbox.top);
  const boxWidth = numberValue(bbox.width, bbox.w);
  const boxHeight = numberValue(bbox.height, bbox.h);
  if (x === null || y === null || boxWidth === null || boxHeight === null) return null;
  if (![x, y, boxWidth, boxHeight].every(Number.isInteger) || boxWidth <= 0 || boxHeight <= 0) return null;
  if (x < 0 || y < 0 || x + boxWidth > width || y + boxHeight > height) return null;
  return {
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    normalizedBoundingBox: {
      x: x / width,
      y: y / height,
      width: boxWidth / width,
      height: boxHeight / height,
    },
  };
}

/**
 * Converts only the documented layer contract into our durable shape. The
 * provider may return other image fields, but it cannot bypass this gate.
 */
export function normalizeSeedreamLayerResponse(payload: unknown): {
  width: number;
  height: number;
  layers: Array<Omit<LayerizationLayer, "storageKey" | "sourceBytes"> & { sourceUrl: string }>;
} {
  const root = isRecord(payload) && isRecord(payload.output) ? payload.output : payload;
  if (!isRecord(root)) {
    throw new SeedreamProviderError("Seedream layer payload is not an object", "invalid_provider_response");
  }
  const canvas = firstRecord(root.canvas, root.base, root.base_layer);
  const width = numberValue(root.width, canvas?.width, canvas?.dimensions && isRecord(canvas.dimensions) ? canvas.dimensions.width : null);
  const height = numberValue(root.height, canvas?.height, canvas?.dimensions && isRecord(canvas.dimensions) ? canvas.dimensions.height : null);
  if (width === null || height === null || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > SEEDREAM_MAX_CANVAS_PIXELS) {
    throw new SeedreamProviderError("Seedream layer payload has invalid canvas dimensions", "invalid_provider_response");
  }

  const declaredLayers = Array.isArray(root.layers)
    ? root.layers
    : Array.isArray(root.image_layers)
      ? root.image_layers
      : [];
  const hasDeclaredBase = declaredLayers.some((value) => isRecord(value) && (
    value.base === true || value.is_base === true || value.role === "base"
  ));
  const baseUrl = canvas ? imageUrlFrom(canvas) : null;
  const values = baseUrl && !hasDeclaredBase
    ? [{ ...canvas, base: true, order: 0, name: "Base", description: "Base layer", bounding_box: { x: 0, y: 0, width, height } }, ...declaredLayers]
    : declaredLayers;
  if (values.length < 2 || values.length > SEEDREAM_MAX_LAYERS) {
    throw new SeedreamProviderError("Seedream must return between 2 and 17 layers", "invalid_provider_response");
  }

  const seenOrders = new Set<number>();
  let baseCount = 0;
  const layers = values.map((value, index) => {
    if (!isRecord(value)) {
      throw new SeedreamProviderError("Seedream returned a non-object layer", "invalid_provider_response");
    }
    const isBase = value.base === true || value.is_base === true || value.role === "base";
    if (isBase) baseCount += 1;
    const order = numberValue(value.order, value.z_index, value.index, index);
    const name = stringValue(value.name, value.label, isBase ? "Base" : null);
    const description = stringValue(value.description, value.prompt, isBase ? "Base layer" : null);
    const sourceUrl = imageUrlFrom(value) ?? (isBase ? baseUrl : null);
    const bbox = bboxFrom(value, width, height) ?? (isBase ? {
      x: 0, y: 0, width, height,
      normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
    } : null);
    if (order === null || !Number.isInteger(order) || order < 0 || order >= SEEDREAM_MAX_LAYERS || seenOrders.has(order) || !name || name.length > 128 || !description || description.length > 1000 || !sourceUrl || sourceUrl.length > 2048 || !bbox) {
      throw new SeedreamProviderError("Seedream layer is missing an ordered name, description, bbox, or image", "invalid_provider_response");
    }
    seenOrders.add(order);
    return { order, isBase, name, description, sourceUrl, ...bbox };
  });
  if (baseCount !== 1) {
    throw new SeedreamProviderError("Seedream response must contain exactly one base layer", "invalid_provider_response");
  }
  return { width, height, layers: layers.sort((left, right) => left.order - right.order) };
}

function allowedMediaHosts(): Set<string> {
  return new Set(SEEDREAM_MEDIA_HOSTS);
}

function isPrivateIpv4(host: string): boolean {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function embeddedIpv4FromIpv6(host: string): string | null {
  const sections = host.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections[1] ? sections[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sections.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  const mapped = numbers.slice(0, 5).every((group) => group === 0) && numbers[5] === 0xffff;
  const compatible = numbers.slice(0, 6).every((group) => group === 0);
  if (!mapped && !compatible) return null;
  const high = numbers[6];
  const low = numbers[7];
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function isPrivateIp(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized === "metadata.google.internal") return true;
  if (isPrivateIpv4(normalized)) return true;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) return true;
  if (isIP(normalized) !== 6) return false;
  const embeddedIpv4 = embeddedIpv4FromIpv6(normalized);
  if (embeddedIpv4 && isPrivateIpv4(embeddedIpv4)) return true;
  if (normalized === "::" || normalized === "::1") return true;
  const firstHextet = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  return (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) || (firstHextet >= 0xfe80 && firstHextet <= 0xfebf);
}

export async function validateSeedreamMediaUrl(
  value: string,
  options: { allowedHosts?: Set<string>; lookup?: (hostname: string) => Promise<Array<{ address: string }>> } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SeedreamProviderError("Seedream media URL is malformed", "unsafe_media");
  }
  const hosts = options.allowedHosts ?? allowedMediaHosts();
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !hosts.has(host) || isPrivateIp(host)) {
    throw new SeedreamProviderError("Seedream media URL is not allowlisted", "unsafe_media");
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await (options.lookup ?? (async (hostname) => {
      return (await dnsLookup(hostname, { all: true })).map(({ address }) => ({ address }));
    }))(host);
  } catch {
    throw new SeedreamProviderError("Seedream media hostname could not be resolved", "unsafe_media");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new SeedreamProviderError("Seedream media URL resolves to a private address", "unsafe_media");
  }
  return url;
}

export async function downloadSeedreamMedia(
  value: string,
  options: {
    fetchImpl?: FetchLike;
    allowedHosts?: Set<string>;
    lookup?: (hostname: string) => Promise<Array<{ address: string }>>;
    maxBytes?: number;
  } = {},
): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? SEEDREAM_MAX_ASSET_BYTES;
  let current = value;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const url = await validateSeedreamMediaUrl(current, options);
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new SeedreamProviderError("Too many Seedream media redirects", "unsafe_media");
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new SeedreamProviderError("Seedream media redirect is malformed", "unsafe_media");
      }
      continue;
    }
    if (!response.ok) throw new SeedreamProviderError(`Seedream media returned ${response.status}`, "unsafe_media");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "image/png") throw new SeedreamProviderError("Seedream media is not a PNG", "unsafe_media");
    const advertised = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertised) && advertised > maxBytes) throw new SeedreamProviderError("Seedream media is too large", "unsafe_media");
    if (!response.body) throw new SeedreamProviderError("Seedream media has no body", "unsafe_media");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SeedreamProviderError("Seedream media is too large", "unsafe_media");
      }
      chunks.push(Buffer.from(next.value));
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new SeedreamProviderError("Seedream media has invalid PNG bytes", "unsafe_media");
    }
    return buffer;
  }
  throw new SeedreamProviderError("Seedream media redirect failed", "unsafe_media");
}

export async function downloadSeedreamLayers(
  layers: Array<{ sourceUrl: string }>,
  options: Parameters<typeof downloadSeedreamMedia>[1] = {},
): Promise<Buffer[]> {
  const limit = pLimit(3);
  let total = 0;
  const buffers = await Promise.all(layers.map((layer) => limit(async () => {
    const buffer = await downloadSeedreamMedia(layer.sourceUrl, options);
    total += buffer.length;
    if (total > SEEDREAM_MAX_TOTAL_ASSET_BYTES) {
      throw new SeedreamProviderError("Seedream layers exceed total size limit", "unsafe_media");
    }
    return buffer;
  })));
  return buffers;
}
