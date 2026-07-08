import sharp from "sharp";

const MAX_TRAINING_ASSET_BYTES = 10 * 1024 * 1024;
const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const MAX_SANITIZED_FILENAME_LENGTH = 80;

/**
 * Normalize a user-uploaded training asset.
 *
 * Rules:
 * - File must be between 1 byte and {@link MAX_TRAINING_ASSET_BYTES}.
 * - SVG input is rasterized to PNG so downstream code never deals with SVG.
 * - Raster input must report as one of the supported formats to sharp.
 * - Returns `{ buffer, type, extension, hasAlpha }` for the storage layer.
 */
export async function normalizeTrainingUpload(file: File) {
  if (file.size <= 0 || file.size > MAX_TRAINING_ASSET_BYTES) {
    throw new Error("invalid_size");
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (file.type === "image/svg+xml") {
    const buffer = await sharp(input, { limitInputPixels: 40_000_000 })
      .png()
      .toBuffer();
    const metadata = await sharp(buffer).metadata();
    return {
      buffer,
      type: "image/png" as const,
      extension: "png" as const,
      hasAlpha: metadata.hasAlpha === true,
    };
  }

  if (!RASTER_TYPES.has(file.type)) throw new Error("invalid_type");
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  if (
    metadata.format !== "png" &&
    metadata.format !== "jpeg" &&
    metadata.format !== "webp"
  ) {
    throw new Error("invalid_type");
  }
  const extension =
    metadata.format === "jpeg"
      ? "jpg"
      : metadata.format === "webp"
        ? "webp"
        : "png";
  return {
    buffer: input,
    type: file.type as "image/png" | "image/jpeg" | "image/webp",
    extension,
    hasAlpha: metadata.hasAlpha === true,
  };
}

/**
 * Sanitize a user-supplied filename before embedding it in a storage key.
 *
 * Lowercases the input, strips any character outside `[a-z0-9._-]`,
 * collapses runs of `.` or `-` to a single character, trims leading/trailing
 * dots and dashes, caps the result at 80 characters, and falls back to
 * `"file"` if nothing safe remains. Always combine the result with a
 * server-generated uuid prefix and a fixed key structure.
 */
export function sanitizeStorageFilename(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[.\-]{2,}/g, (match) => match[0])
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .slice(0, MAX_SANITIZED_FILENAME_LENGTH);

  return cleaned.length > 0 ? cleaned : "file";
}