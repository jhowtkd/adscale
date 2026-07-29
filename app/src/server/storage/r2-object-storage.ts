import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { logger } from "@/lib/logger";
import { ObjectStorage, StorageMetadata } from "./object-storage";
import { env } from "../validation/env";

const R2_GET_STREAM_TIMEOUT_MS = 30_000;

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
      // Force download rather than inline rendering when a user navigates
      // directly to the object URL. <img> tags still render images normally
      // (they ignore Content-Disposition), but this prevents uploaded
      // HTML/SVG/SVG-with-script from executing in a browser on the public
      // bucket origin — defense against stored XSS via content-type spoofing.
      ContentDisposition: "attachment",
    });
    await this.client.send(command);
  }

  async putStream(
    key: string,
    data: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      ContentDisposition: "attachment",
    });
    await this.client.send(command, { abortSignal: signal });
  }

  async get(key: string, signal?: AbortSignal): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    const response = await this.client.send(command, { abortSignal: signal });
    if (!response.Body) {
      throw new Error("Empty response body");
    }

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      let settled = false;
      const watchdog = setTimeout(() => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(new Error(`R2 download stream timed out after ${R2_GET_STREAM_TIMEOUT_MS}ms (key=${key})`));
      }, R2_GET_STREAM_TIMEOUT_MS);

      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        stream.destroy();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        signal?.removeEventListener("abort", onAbort);
        stream.removeAllListeners();
        resolve(Buffer.concat(chunks));
      });
      stream.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        signal?.removeEventListener("abort", onAbort);
        stream.destroy();
        reject(err);
      });
    });
  }

  async getStream(key: string, signal?: AbortSignal): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
    const response = await this.client.send(command, { abortSignal: signal });
    if (!response.Body) throw new Error("Empty response body");
    const stream = response.Body as Readable;
    if (!signal) return stream;

    const onAbort = () => stream.destroy(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
      stream.once("close", () => signal.removeEventListener("abort", onAbort));
    }
    return stream;
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
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (err instanceof NoSuchKey || status === 404) return null;
      logger.error("[r2] head failed", { key, error: err });
      throw err;
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
      // Same defense as put(): force attachment disposition so a spoofed
      // Content-Type (e.g. text/html via presign) can't render inline.
      ContentDisposition: "attachment",
    });
    return getSignedUrl(this.client, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-disposition"]),
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
