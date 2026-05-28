import { ObjectStorage, StorageMetadata } from "./object-storage";

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
