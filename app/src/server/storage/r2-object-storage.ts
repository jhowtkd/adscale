import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { ObjectStorage, StorageMetadata } from "./object-storage";
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
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
}

export class R2ObjectStorage implements ObjectStorage {
  private client: S3Client;
  private downloadUrlCache: LRUCache<
    string,
    { url: string; expiresAt: number }
  >;

  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    this.downloadUrlCache = new LRUCache(DOWNLOAD_URL_CACHE_MAX_ENTRIES);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
    });
    await this.client.send(command);
  }

  async get(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    const response = await this.client.send(command);
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

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    await this.client.send(command);
  }

  async head(key: string): Promise<StorageMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
      });
      const result = await this.client.send(command);
      return {
        contentType: result.ContentType ?? undefined,
        contentLength: result.ContentLength ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async signedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type"]),
    });
  }

  async signedDownloadUrl(key: string): Promise<string> {
    const now = Date.now();
    const cached = this.downloadUrlCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }

    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 300 });
    this.downloadUrlCache.set(key, {
      url,
      expiresAt: now + DOWNLOAD_URL_CACHE_TTL_MS,
    });
    return url;
  }

  publicUrl(key: string): string {
    return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
}
