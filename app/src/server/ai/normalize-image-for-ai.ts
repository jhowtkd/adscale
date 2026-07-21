import sharp from "sharp";
import type { ImageReference } from "./providers/image-provider";

const MAX_DIMENSION = 2048;
const LIMIT_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 85;

export class InvalidImageInputError extends Error {
  readonly code = "invalid_image_input";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidImageInputError";
  }
}

export type NormalizedImageForAi = {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  originalBytes: number;
  finalBytes: number;
  hasTransparency: boolean;
};

/**
 * Normalize a buffer for AI model input only. Does not replace stored originals.
 * Applies EXIF orientation, caps the long edge at 2048 without enlarging,
 * encodes opaque images as WebP q85 and transparent images as PNG.
 */
export async function normalizeImageForAi(input: {
  buffer: Buffer;
  mimeType?: string;
}): Promise<NormalizedImageForAi> {
  const originalBytes = input.buffer.byteLength;
  if (originalBytes <= 0) {
    throw new InvalidImageInputError("Image buffer is empty");
  }

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(input.buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate();
  } catch (error) {
    throw new InvalidImageInputError("Unable to decode image", { cause: error });
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (error) {
    throw new InvalidImageInputError("Unable to read image metadata", { cause: error });
  }

  if (!metadata.width || !metadata.height) {
    throw new InvalidImageInputError("Image has invalid dimensions");
  }

  const hasTransparency = metadata.hasAlpha === true;
  const resized = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
    fit: "inside",
    withoutEnlargement: true,
  });

  try {
    if (hasTransparency) {
      const buffer = await resized.png().toBuffer();
      const outMeta = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
      return {
        buffer,
        mimeType: "image/png",
        width: outMeta.width ?? metadata.width,
        height: outMeta.height ?? metadata.height,
        originalBytes,
        finalBytes: buffer.byteLength,
        hasTransparency: true,
      };
    }

    const buffer = await resized.webp({ quality: WEBP_QUALITY }).toBuffer();
    const outMeta = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
    return {
      buffer,
      mimeType: "image/webp",
      width: outMeta.width ?? metadata.width,
      height: outMeta.height ?? metadata.height,
      originalBytes,
      finalBytes: buffer.byteLength,
      hasTransparency: false,
    };
  } catch (error) {
    if (error instanceof InvalidImageInputError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/Input image exceeds pixel limit|limitInputPixels|too large/i.test(message)) {
      throw new InvalidImageInputError("Image exceeds safe pixel limit", { cause: error });
    }
    throw new InvalidImageInputError("Unable to normalize image for AI", { cause: error });
  }
}

export async function normalizeReferenceBuffers(
  refs: Array<{ buffer: Buffer; mimeType: string; name: string }>
): Promise<ImageReference[]> {
  const normalized: ImageReference[] = [];
  for (const ref of refs) {
    const result = await normalizeImageForAi({
      buffer: ref.buffer,
      mimeType: ref.mimeType,
    });
    const ext = result.mimeType === "image/png" ? "png" : "webp";
    const baseName = ref.name.replace(/\.[^.]+$/, "") || "reference";
    normalized.push({
      buffer: result.buffer,
      mimeType: result.mimeType,
      name: `${baseName}.${ext}`,
    });
    // Drop the caller's raw buffer reference as soon as the normalized copy exists.
    (ref as { buffer?: Buffer }).buffer = undefined;
  }
  return normalized;
}
