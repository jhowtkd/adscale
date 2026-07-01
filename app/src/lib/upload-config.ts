/**
 * Centralized upload configuration to prevent duplication across handlers.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function isAllowedImageType(type: string): type is AllowedImageType {
  return ALLOWED_IMAGE_TYPES.includes(type as AllowedImageType);
}

/**
 * Sanitize a user-supplied filename before embedding it in a storage key.
 *
 * Strips path separators and anything that isn't a safe filename character,
 * and collapses `..` sequences. This prevents key-injection / path traversal
 * (e.g. a filename of `../../workspaces/<other>/x` writing into another
 * workspace's key prefix). Always combine the result with a server-generated
 * uuid prefix and a fixed key structure.
 */
export function sanitizeStorageFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/\.{2,}/g, ".");
}

// Magic bytes for image validation (prevents spoofing file.type)
const MAGIC_BYTES: Record<AllowedImageType, number[][]> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // WEBP starts with RIFF
};

/**
 * Validates file magic bytes to ensure the file content matches the claimed type.
 * This prevents clients from spoofing file.type with malicious files.
 */
export async function validateImageMagicBytes(
  file: File,
  expectedType: AllowedImageType
): Promise<boolean> {
  const signatures = MAGIC_BYTES[expectedType];
  if (!signatures) return false;

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  for (const sig of signatures) {
    if (header.length < sig.length) continue;

    let matches = true;
    for (let i = 0; i < sig.length; i += 1) {
      if (header[i] !== sig[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}
