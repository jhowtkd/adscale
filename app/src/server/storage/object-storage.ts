export interface StorageMetadata {
  contentType?: string;
  contentLength?: number;
}

import type { Readable } from "stream";

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  putStream(
    key: string,
    data: Readable,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void>;
  get(key: string, signal?: AbortSignal): Promise<Buffer>;
  getStream?(key: string, signal?: AbortSignal): Promise<Readable>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<StorageMetadata | null>;
  signedUploadUrl(key: string, contentType: string, contentLength: number): Promise<string>;
  signedDownloadUrl(key: string): Promise<string>;
  publicUrl(key: string): string;
}
