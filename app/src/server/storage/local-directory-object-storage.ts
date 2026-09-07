import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "stream";
import type { ObjectStorage, StorageMetadata } from "./object-storage";

export function e2eStorageRoot(): string {
  const configured = process.env.E2E_STORAGE_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(os.tmpdir(), "adscale-e2e-storage");
}

function fileFor(key: string): string {
  const normalized = key.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..");
  if (normalized.length === 0) {
    throw new Error("Object key is empty");
  }
  return path.join(e2eStorageRoot(), ...normalized);
}

/**
 * Shared-disk object store for the localhost E2E seam (seed process + Next
 * + Inngest serve). Never used when the E2E controlled provider is off.
 */
export class LocalDirectoryObjectStorage implements ObjectStorage {
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const file = fileFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType, contentLength: data.length }));
  }

  async putStream(
    key: string,
    data: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const file = fileFor(key);
    await mkdir(path.dirname(file), { recursive: true });
    await pipeline(data, createWriteStream(file), { signal });
    const info = await stat(file);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType, contentLength: info.size }));
  }

  async get(key: string, signal?: AbortSignal): Promise<Buffer> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await readFile(fileFor(key), { signal });
    } catch {
      throw new Error(`Object not found: ${key}`);
    }
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(fileFor(key));
  }

  async delete(key: string): Promise<void> {
    const file = fileFor(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }

  async head(key: string): Promise<StorageMetadata | null> {
    try {
      const raw = await readFile(`${fileFor(key)}.meta.json`, "utf8");
      return JSON.parse(raw) as StorageMetadata;
    } catch {
      return null;
    }
  }

  async signedUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
  ): Promise<string> {
    void contentType;
    void contentLength;
    return `e2e-storage://upload/${key}`;
  }

  async signedDownloadUrl(key: string): Promise<string> {
    return `e2e-storage://download/${key}`;
  }

  publicUrl(key: string): string {
    return `e2e-storage://public/${key}`;
  }
}
