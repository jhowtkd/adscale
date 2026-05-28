import { objectStorage } from "./index";

/**
 * @deprecated Use `objectStorage` from `@/server/storage` instead.
 * This module is kept for backward compatibility with existing consumers.
 * New code should import `objectStorage` directly.
 */

/** @deprecated Use `objectStorage.put` */
export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  return objectStorage.put(key, buffer, contentType);
}

/** @deprecated Use `objectStorage.get` */
export async function downloadBuffer(key: string): Promise<Buffer> {
  return objectStorage.get(key);
}

/** @deprecated Use `objectStorage.delete` */
export async function deleteObject(key: string) {
  return objectStorage.delete(key);
}

/** @deprecated Use `objectStorage.head` */
export async function headObject(key: string) {
  return objectStorage.head(key);
}

/** @deprecated Use `objectStorage.signedUploadUrl` */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number
) {
  return objectStorage.signedUploadUrl(key, contentType, contentLength);
}

/** @deprecated Use `objectStorage.signedDownloadUrl` */
export async function getPresignedDownloadUrl(key: string) {
  return objectStorage.signedDownloadUrl(key);
}

/** @deprecated Use `objectStorage.publicUrl` */
export function getPublicUrl(key: string) {
  return objectStorage.publicUrl(key);
}
