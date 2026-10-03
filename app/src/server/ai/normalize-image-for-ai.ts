import { processRaster, rethrowRasterRetry } from "@/server/equipe/handoff/raster-image";
import type { ImageReference } from "./providers/image-provider";


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

/** Exact composition requires at least one non-opaque alpha pixel. */
export function hasUsableAlphaValue(alpha: number): boolean {
  return alpha < 255;
}

/**
 * Explicit pixel-level alpha inspection for exact-composition trust
 * boundaries. It is intentionally separate from generic AI normalization so
 * legacy callers only need Sharp's established metadata/resize pipeline.
 */
export async function inspectUsableTransparency(buffer: Buffer, accountKey?: string): Promise<boolean> {
  const result = await processRaster(buffer, "transparency", { accountKey });
  return result.info.usableTransparency === true;
}

/**
 * Normalize a buffer for AI model input only. Does not replace stored originals.
 * Applies EXIF orientation, caps the long edge at 2048 without enlarging,
 * encodes opaque images as WebP q85 and transparent images as PNG.
 */
export async function normalizeImageForAi(input: {
  buffer: Buffer;
  mimeType?: string;
  accountKey?: string;
}): Promise<NormalizedImageForAi> {
  const originalBytes = input.buffer.byteLength;
  if (originalBytes <= 0) {
    throw new InvalidImageInputError("Image buffer is empty");
  }

  try {
    const { data: buffer, info } = await processRaster(input.buffer, "ai-normalize", { accountKey: input.accountKey });
    return {
      buffer,
      mimeType: info.hasAlpha ? "image/png" : "image/webp",
      width: info.width,
      height: info.height,
      originalBytes,
      finalBytes: buffer.byteLength,
      hasTransparency: info.hasAlpha === true,
    };
  } catch (error) {
    rethrowRasterRetry(error);
    throw new InvalidImageInputError("Unable to normalize image for AI", { cause: error });
  }
}

export async function normalizeReferenceBuffers(
  refs: Array<{ buffer: Buffer; mimeType: string; name: string }>,
  accountKey?: string,
): Promise<ImageReference[]> {
  const normalized: ImageReference[] = [];
  for (let index = 0; index < refs.length; index += 2) {
    const batch = await Promise.allSettled(refs.slice(index, index + 2).map(async (ref) => {
      const result = await normalizeImageForAi({
        buffer: ref.buffer,
        mimeType: ref.mimeType,
        accountKey,
      });
      const ext = result.mimeType === "image/png" ? "png" : "webp";
      const baseName = ref.name.replace(/\.[^.]+$/, "") || "reference";
      // Drop the caller's raw buffer reference as soon as the normalized copy exists.
      (ref as { buffer?: Buffer }).buffer = undefined;
      return { buffer: result.buffer, mimeType: result.mimeType, name: `${baseName}.${ext}` };
    }));
    for (const result of batch) {
      if (result.status === "rejected") throw result.reason;
      normalized.push(result.value);
    }
  }
  return normalized;
}
