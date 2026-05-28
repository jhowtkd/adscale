export interface StorageMetadata {
  contentType?: string;
  contentLength?: number;
}

export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<StorageMetadata | null>;
  signedUploadUrl(key: string, contentType: string, contentLength: number): Promise<string>;
  signedDownloadUrl(key: string): Promise<string>;
  publicUrl(key: string): string;
}
