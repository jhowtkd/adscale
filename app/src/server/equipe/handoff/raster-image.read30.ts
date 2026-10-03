// A whole reading of a site that returns 30 images (3 logo candidates, the screenshot and 26 page images), for the tests of ticket 17: the real `createSiteEnrichment` and the real importer,
// with the network, the storage and the database replaced by memory. No route, no provider, no secret. It imports neither `sharp` nor `raster-image` (the files it reads are written by `raster-image.hostile.ts`, which does), so the SAME file can drive a clean
// process on `main` (where every image is decoded inside the server and the memory blows up) and on the ticket's branch (where it is not).
import { readFileSync } from "node:fs";
import path from "node:path";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { createSiteEnrichment, type SiteReadingContext } from "./site-enrichment";
import type { SiteReadResult } from "./readers";

export const READ30_CONTEXT: SiteReadingContext = { workspaceId: "ws-1", accountId: "acc-1", handoffId: "handoff-1", readingId: "reading-1", taskIntentId: "intent-1" };

const TYPES: Record<string, string> = { png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", jpg: "image/jpeg" };

export type Read30Files = { logos: string[]; screenshot: string; images: string[] };
/** Spreads `files` (cycled, each URL distinct so each one is downloaded and decoded on its own) over the 3 + 1 + 26 slots of a reading. */
export function read30Slots(files: string[]): Read30Files {
  const at = (index: number) => files[index % files.length]!;
  return { logos: [0, 1, 2].map(at), screenshot: at(3), images: Array.from({ length: 26 }, (_, index) => at(4 + index)) };
}

export type Read30Result = {
  identity: Awaited<ReturnType<ReturnType<typeof createSiteEnrichment>["identity"]>>;
  images: Awaited<ReturnType<ReturnType<typeof createSiteEnrichment>["images"]>>;
  /** Every object written to storage and every asset saved: a refused image leaves nothing behind. */
  puts: string[];
  saved: Array<{ name: string; key: string }>;
  downloads: number;
  ms: number;
};

export async function runRead30(slots: Read30Files): Promise<Read30Result> {
  const bytesOf = new Map<string, Buffer>();
  const url = (file: string, index: number) => { const address = `https://site.example/${index}-${path.basename(file)}`; bytesOf.set(address, readFileSync(file)); return address; };
  const logoUrls = slots.logos.map((file, index) => url(file, index));
  const screenshotUrl = url(slots.screenshot, 100);
  const imageUrls = slots.images.map((file, index) => url(file, 200 + index));
  const storage = new InMemoryObjectStorage();
  const puts: string[] = [];
  const put = storage.put.bind(storage);
  storage.put = async (key, data, contentType) => { puts.push(key); return put(key, data, contentType); };
  const rows = new Map<string, { id: string; key: string; width: number | null; height: number | null; metadata?: unknown }>();
  const saved: Read30Result["saved"] = [];
  let downloads = 0;
  const enrichment = createSiteEnrichment({
    storage,
    download: (async (address: string) => {
      downloads++;
      const bytes = bytesOf.get(address);
      if (!bytes) throw new Error("404");
      return { bytes, contentType: TYPES[path.extname(address).slice(1)] ?? "image/png" };
    }) as never,
    saveAsset: async data => { saved.push({ name: data.name, key: data.key }); const row = { id: `a-${rows.size + 1}`, key: data.key, width: data.width ?? null, height: data.height ?? null, metadata: data.metadata }; rows.set(`${data.workspaceId}:${data.key}`, row); return row; },
    findAsset: async (workspaceId, key) => rows.get(`${workspaceId}:${key}`) ?? null,
    updateAssetMetadata: async () => undefined,
    vision: () => async () => ({ logoConfirmed: null, colors: ["#111111"], fonts: [] }),
    timeoutMs: 120_000,
  });
  const data: SiteReadResult = {
    title: "T", siteName: "Marca", markdown: "m", links: [], statusCode: 200, screenshotUrl,
    images: imageUrls.map(address => ({ url: address })) as SiteReadResult["images"],
    branding: { logo: { url: logoUrls[0]! }, colors: [], fonts: [] }, logoCandidates: logoUrls.slice(1),
  };
  const started = Date.now();
  const identity = await enrichment.identity(data, READ30_CONTEXT);
  const images = await enrichment.images(data, READ30_CONTEXT);
  return { identity, images, puts, saved, downloads, ms: Date.now() - started };
}
