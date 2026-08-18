import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import pLimit from "p-limit";
import sharp from "sharp";
import { env } from "@/server/validation/env";
import { type LayerizationLayer } from "./contracts";

export const SEEDREAM_LAYERIZE_MODEL_ID = "bytedance/seedream-v5.0-pro/layer-decomposition";
export const ATLASCLOUD_GENERATE_URL = "https://api.atlascloud.ai/api/v1/model/generateImage";
export const ATLASCLOUD_PREDICTION_URL = "https://api.atlascloud.ai/api/v1/model/prediction";
export const SEEDREAM_PROVIDER_ENDPOINT = ATLASCLOUD_GENERATE_URL;
export const SEEDREAM_PROVIDER_DOCS_URL = "https://www.atlascloud.ai/models/seedream-5.0-pro";
export const SEEDREAM_MEDIA_HOSTS = [
  "fal.media",
  "v3.fal.media",
  "v3b.fal.media",
  "static.atlascloud.ai",
  "storage.atlascloud.ai",
  "atlas-media.oss-us-west-1.aliyuncs.com",
  "ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com",
] as const;
export const SEEDREAM_MAX_LAYERS = 17;
export const SEEDREAM_MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const SEEDREAM_MAX_TOTAL_ASSET_BYTES = 200 * 1024 * 1024;
export const SEEDREAM_MAX_CANVAS_PIXELS = 40_000_000;
export const SEEDREAM_MAX_RESPONSE_BYTES = 256 * 1024;
// ponytail: billed 2026-08-17 1:1 smoke was $0.1575/image; catalog $0.022 is stale. Split by size if invoices diverge.
const ATLASCLOUD_IMAGE_PRICE_USD = 0.1575;

export type SeedreamProviderStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export class SeedreamProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_configuration"
      | "provider_error"
      | "invalid_provider_response"
      | "unsafe_media" = "provider_error",
    readonly httpStatus?: number,
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

export function estimateSeedreamLayerizationCostUsd(_width: number, _height: number, _layerCount: number): number {
  return ATLASCLOUD_IMAGE_PRICE_USD;
}

function apiKeyOrThrow(apiKey = env.ATLASCLOUD_API_KEY): string {
  if (!apiKey?.trim()) {
    throw new SeedreamProviderError("ATLASCLOUD_API_KEY is not configured", "missing_configuration");
  }
  return apiKey.trim();
}

function providerHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  if (!response.body) {
    throw new SeedreamProviderError("Atlas response has no body", "invalid_provider_response");
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
      throw new SeedreamProviderError("Atlas response is too large", "invalid_provider_response");
    }
    chunks.push(Buffer.from(next.value));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SeedreamProviderError("Atlas returned invalid JSON", "invalid_provider_response");
  }
}

function providerData(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new SeedreamProviderError("Atlas response is not an object", "invalid_provider_response");
  }
  return isRecord(payload.data) ? payload.data : payload;
}

function requestIdFrom(payload: unknown): string {
  const data = providerData(payload);
  const requestId = stringValue(data.id, data.request_id, data.prediction_id);
  if (typeof requestId !== "string" || requestId.trim().length < 1 || requestId.length > 256) {
    throw new SeedreamProviderError("Atlas response has no request id", "invalid_provider_response");
  }
  return requestId.trim();
}

function normalizeStatus(payload: unknown): SeedreamProviderStatus {
  const status = providerData(payload).status;
  if (typeof status !== "string") {
    throw new SeedreamProviderError("Atlas response has an unknown status", "invalid_provider_response");
  }
  switch (status.toLowerCase()) {
    case "created":
    case "queued":
    case "in_queue":
      return "IN_QUEUE";
    case "processing":
    case "in_progress":
      return "IN_PROGRESS";
    case "completed":
    case "succeeded":
      return "COMPLETED";
    case "failed":
    case "timeout":
      return "FAILED";
    default:
      throw new SeedreamProviderError("Atlas response has an unknown status", "invalid_provider_response");
  }
}

export function createSeedreamProvider(options: {
  apiKey?: string;
  fetchImpl?: FetchLike;
} = {}): SeedreamProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchImpl(url, {
      ...init,
      headers: providerHeaders(apiKeyOrThrow(options.apiKey)),
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new SeedreamProviderError(
        `Atlas request failed with ${response.status}`,
        "provider_error",
        response.status,
      );
    }
    return readProviderJson(response);
  }

  return {
    async submit(input) {
      const payload = await request(ATLASCLOUD_GENERATE_URL, {
        method: "POST",
        body: JSON.stringify({
          model: SEEDREAM_LAYERIZE_MODEL_ID,
          prompt: input.prompt,
          image: input.imageUrl,
          size: "1K",
          output_format: "png",
          enable_sync_mode: false,
          enable_base64_output: false,
        }),
      });
      return { requestId: requestIdFrom(payload) };
    },
    async status(requestId) {
      const payload = await request(`${ATLASCLOUD_PREDICTION_URL}/${encodeURIComponent(requestId)}`, { method: "GET" });
      return normalizeStatus(payload);
    },
    async result(requestId) {
      return request(`${ATLASCLOUD_PREDICTION_URL}/${encodeURIComponent(requestId)}`, { method: "GET" });
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

function bboxFrom(value: Record<string, unknown>, width: number, height: number, isBase: boolean) {
  if (isBase) {
    return {
      x: 0,
      y: 0,
      width,
      height,
      normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
    };
  }
  const bbox = firstRecord(value.bounding_box);
  const absolute = bbox?.absolute;
  const normalized = bbox?.normalized;
  if (!Array.isArray(absolute) || absolute.length !== 4 || !absolute.every(Number.isInteger)) return null;
  if (!Array.isArray(normalized) || normalized.length !== 4 || !normalized.every((part) => Number.isInteger(part) && part >= 0 && part <= 1000)) return null;
  const [absoluteLeft, absoluteTop, absoluteRight, absoluteBottom] = absolute as number[];
  if (absoluteLeft < 0 || absoluteTop < 0 || absoluteRight <= absoluteLeft || absoluteBottom <= absoluteTop) return null;
  const [normalizedLeft, normalizedTop, normalizedRight, normalizedBottom] = normalized as number[];
  const left = Math.floor(normalizedLeft * width / 1000);
  const top = Math.floor(normalizedTop * height / 1000);
  const right = Math.ceil(normalizedRight * width / 1000);
  const bottom = Math.ceil(normalizedBottom * height / 1000);
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  if (left < 0 || top < 0 || boxWidth <= 0 || boxHeight <= 0 || right > width || bottom > height) return null;
  return {
    x: left,
    y: top,
    width: boxWidth,
    height: boxHeight,
    normalizedBoundingBox: {
      x: left / width,
      y: top / height,
      width: boxWidth / width,
      height: boxHeight / height,
    },
  };
}

/**
 * Converts only the documented layer contract into our durable shape. The
 * provider may return other image fields, but it cannot bypass this gate.
 */
export function normalizeSeedreamLayerResponse(
  payload: unknown,
  canvas?: { width: number; height: number },
): {
  width: number;
  height: number;
  layers: Array<Omit<LayerizationLayer, "storageKey" | "sourceBytes"> & { sourceUrl: string }>;
} {
  const root = providerData(payload);
  const declaredLayers = Array.isArray(root.layers) ? root.layers : [];
  const outputs = Array.isArray(root.outputs) ? root.outputs : [];
  const base = declaredLayers[0];
  const baseImage = isRecord(base) && isRecord(base.image) ? base.image : null;
  const width = canvas?.width ?? numberValue(baseImage?.width);
  const height = canvas?.height ?? numberValue(baseImage?.height);
  if (width === null || height === null || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > SEEDREAM_MAX_CANVAS_PIXELS) {
    throw new SeedreamProviderError("Atlas layer payload has invalid canvas dimensions", "invalid_provider_response");
  }

  if (declaredLayers.length < 2 || declaredLayers.length > SEEDREAM_MAX_LAYERS || outputs.length !== declaredLayers.length) {
    throw new SeedreamProviderError("Atlas must return between 2 and 17 aligned outputs", "invalid_provider_response");
  }

  const seenOrders = new Set<number>();
  let baseCount = 0;
  const layers = declaredLayers.map((value, index) => {
    if (!isRecord(value)) {
      throw new SeedreamProviderError("Atlas returned a non-object layer", "invalid_provider_response");
    }
    const order = numberValue(value.z_index, index === 0 ? 0 : null);
    const isBase = index === 0 && order === 0 && value.bounding_box == null;
    if (isBase) baseCount += 1;
    const name = stringValue(value.name, isBase ? "Base" : null);
    const description = stringValue(value.description, isBase ? "Base layer" : null);
    const sourceUrl = stringValue(outputs[index]);
    const bbox = bboxFrom(value, width, height, isBase);
    if (order === null || !Number.isInteger(order) || order < 0 || order >= SEEDREAM_MAX_LAYERS || seenOrders.has(order) || !name || name.length > 128 || !description || description.length > 1000 || !sourceUrl || sourceUrl.length > 2048 || !bbox) {
      throw new SeedreamProviderError("Atlas layer is missing an ordered name, description, bbox, or output", "invalid_provider_response");
    }
    seenOrders.add(order);
    return { order, isBase, name, description, sourceUrl, ...bbox };
  });
  if (baseCount !== 1) {
    throw new SeedreamProviderError("Atlas response must contain exactly one base layer", "invalid_provider_response");
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
  const maxBytes = options.maxBytes ?? SEEDREAM_MAX_ASSET_BYTES;
  const response = await fetchSeedreamMediaResponse(value, options);
  const chunks: Buffer[] = [];
  await consumeSeedreamMedia(response, maxBytes, async (chunk) => {
    chunks.push(chunk);
  });
  return Buffer.concat(chunks);
}

type SharedByteBudget = { remaining: number };

async function fetchSeedreamMediaResponse(
  value: string,
  options: NonNullable<Parameters<typeof downloadSeedreamMedia>[1]> & { budget?: SharedByteBudget } = {},
): Promise<Response> {
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
    if (Number.isFinite(advertised) && options.budget && advertised > options.budget.remaining) {
      throw new SeedreamProviderError("Seedream layers exceed total size limit", "unsafe_media");
    }
    if (!response.body) throw new SeedreamProviderError("Seedream media has no body", "unsafe_media");
    return response;
  }
  throw new SeedreamProviderError("Seedream media redirect failed", "unsafe_media");
}

async function consumeSeedreamMedia(
  response: Response,
  maxBytes: number,
  onChunk: (chunk: Buffer) => Promise<void>,
  budget?: SharedByteBudget,
): Promise<number> {
  if (!response.body) throw new SeedreamProviderError("Seedream media has no body", "unsafe_media");
  const reader = response.body.getReader();
  const signature = Buffer.alloc(8);
  let signatureBytes = 0;
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    total += chunk.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SeedreamProviderError("Seedream media is too large", "unsafe_media");
    }
    if (budget) {
      budget.remaining -= chunk.length;
      if (budget.remaining < 0) {
        await reader.cancel();
        throw new SeedreamProviderError("Seedream layers exceed total size limit", "unsafe_media");
      }
    }
    if (signatureBytes < signature.length) {
      const copyBytes = Math.min(signature.length - signatureBytes, chunk.length);
      chunk.copy(signature, signatureBytes, 0, copyBytes);
      signatureBytes += copyBytes;
    }
    await onChunk(chunk);
  }
  if (signatureBytes < signature.length || !signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new SeedreamProviderError("Seedream media has invalid PNG bytes", "unsafe_media");
  }
  return total;
}

export async function downloadSeedreamLayers(
  layers: Array<{ sourceUrl: string; isBase: boolean }>,
  options: Parameters<typeof downloadSeedreamMedia>[1] & {
    store: (layer: { sourceUrl: string; isBase: boolean }, index: number, stream: Readable) => Promise<void>;
    maxTotalBytes?: number;
  },
): Promise<number[]> {
  const limit = pLimit(3);
  const directory = await mkdtemp(join(tmpdir(), "adscale-layerize-"));
  const budget: SharedByteBudget = { remaining: options.maxTotalBytes ?? SEEDREAM_MAX_TOTAL_ASSET_BYTES };
  try {
    const downloaded = await Promise.all(layers.map((layer, index) => limit(async () => {
      const filePath = join(directory, `${String(index).padStart(2, "0")}.png`);
      const file = await open(filePath, "w");
      let bytes: number;
      try {
        const response = await fetchSeedreamMediaResponse(layer.sourceUrl, { ...options, budget });
        bytes = await consumeSeedreamMedia(response, options.maxBytes ?? SEEDREAM_MAX_ASSET_BYTES, async (chunk) => {
          await file.write(chunk);
        }, budget);
      } finally {
        await file.close();
      }
      if (!layer.isBase) {
        const alpha = (await sharp(filePath).ensureAlpha().stats()).channels[3];
        if (!alpha || alpha.max === 0) {
          throw new SeedreamProviderError("Seedream returned a fully transparent layer", "invalid_provider_response");
        }
      }
      return { layer, index, filePath, bytes };
    })));
    if (downloaded.reduce((sum, item) => sum + item.bytes, 0) > (options.maxTotalBytes ?? SEEDREAM_MAX_TOTAL_ASSET_BYTES)) {
      throw new SeedreamProviderError("Seedream layers exceed total size limit", "unsafe_media");
    }
    await Promise.all(downloaded.map((item) => limit(() => options.store(
      item.layer,
      item.index,
      createReadStream(item.filePath),
    ))));
    return downloaded.map((item) => item.bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
