import { ObjectStorage, StorageMetadata } from "./object-storage";
import type { Readable } from "stream";

interface StoredObject {
  data: Buffer;
  contentType: string;
  metadata: StorageMetadata;
}

export class InMemoryObjectStorage implements ObjectStorage {
  private store = new Map<string, StoredObject>();

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.store.set(key, {
      data,
      contentType,
      metadata: {
        contentType,
        contentLength: data.length,
      },
    });
  }

  async putStream(
    key: string,
    data: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        data.destroy(new DOMException("Aborted", "AbortError"));
        reject(new DOMException("Aborted", "AbortError"));
      };
      data.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      data.once("end", () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
      data.once("error", reject);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
    await this.put(key, Buffer.concat(chunks), contentType);
  }

  async get(key: string): Promise<Buffer> {
    const obj = this.store.get(key);
    if (!obj) {
      throw new Error(`Object not found: ${key}`);
    }
    return obj.data;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async head(key: string): Promise<StorageMetadata | null> {
    const obj = this.store.get(key);
    if (!obj) {
      return null;
    }
    return obj.metadata;
  }

  async signedUploadUrl(key: string): Promise<string> {
    return `memory://upload/${key}`;
  }

  async signedDownloadUrl(key: string): Promise<string> {
    return `memory://download/${key}`;
  }

  publicUrl(key: string): string {
    return `memory://public/${key}`;
  }

  clear(): void {
    this.store.clear();
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}
