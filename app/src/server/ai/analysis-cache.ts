import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = "/Users/jhonatan/Desktop/Outputs/test-results/.cache";
const CACHE_FILE = path.join(CACHE_DIR, "analyses.json");
const CACHE_VERSION = "v1";

interface CacheEntry {
  hash: string;
  functionName: string;
  promptVersion: string;
  result: unknown;
  timestamp: number;
}

type CacheStore = Record<string, CacheEntry>;

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache(): CacheStore {
  ensureCacheDir();
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function saveCache(cache: CacheStore): void {
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export interface CacheContext {
  prompt?: string;
  model?: string;
  campaignId?: string;
  locale?: string;
}

function makeHash(imageBuffer: Buffer, functionName: string, context?: CacheContext): string {
  const hash = crypto
    .createHash("sha256")
    .update(imageBuffer)
    .update(functionName)
    .update(CACHE_VERSION);
  if (context?.prompt) hash.update(context.prompt);
  if (context?.model) hash.update(context.model);
  if (context?.campaignId) hash.update(context.campaignId);
  if (context?.locale) hash.update(context.locale);
  return hash.digest("hex");
}

function makeKey(hash: string, functionName: string): string {
  return `${functionName}:${hash}`;
}

export async function getCachedAnalysis<T>(
  imageBuffer: Buffer,
  functionName: string,
  compute: () => Promise<T>,
  context?: CacheContext
): Promise<T> {
  const cache = loadCache();
  const hash = makeHash(imageBuffer, functionName, context);
  const key = makeKey(hash, functionName);

  const entry = cache[key];
  if (entry && entry.promptVersion === CACHE_VERSION) {
    return entry.result as T;
  }

  const result = await compute();

  cache[key] = {
    hash,
    functionName,
    promptVersion: CACHE_VERSION,
    result,
    timestamp: Date.now(),
  };

  saveCache(cache);
  return result;
}

export function invalidateCache(): void {
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
  }
}
