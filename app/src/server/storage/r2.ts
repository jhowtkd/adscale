import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { env } from "../validation/env";

const DOWNLOAD_URL_CACHE_TTL_MS = 4 * 60 * 1000;
const DOWNLOAD_URL_CACHE_MAX_ENTRIES = 1000;

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to front (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

const downloadUrlCache = new LRUCache<
  string,
  { url: string; expiresAt: number }
>(DOWNLOAD_URL_CACHE_MAX_ENTRIES);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number
) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(r2, command, {
    expiresIn: 300,
    signableHeaders: new Set(["content-type"]),
  });
}

export async function getPresignedDownloadUrl(key: string) {
  const now = Date.now();
  const cached = downloadUrlCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(r2, command, { expiresIn: 300 });
  downloadUrlCache.set(key, {
    url,
    expiresAt: now + DOWNLOAD_URL_CACHE_TTL_MS,
  });
  return url;
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  await r2.send(command);
}

export function getPublicUrl(key: string) {
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await r2.send(command);
  return key;
}

export async function headObject(key: string) {
  try {
    const command = new HeadObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    return await r2.send(command);
  } catch {
    return null;
  }
}

export async function downloadBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  const response = await r2.send(command);
  if (!response.Body) {
    throw new Error("Empty response body");
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
