import "server-only";
import sharp from "sharp";

// R-007 / spec 12.1: the Sharp cache stays disabled on the Creative Work path
// — decoded megapixel buffers must not outlive the upload on the web starter.
// Importing this module (the v1 job path does) applies it process-wide.
sharp.cache(false);

/**
 * R-007 / spec 12.1 — reference normalization for the v1 Creative Work path.
 *
 * References are validated/normalized to safe dimension and pixel limits
 * BEFORE they pressure the provider, preserving alpha when the source needs
 * it. Opaque images are re-encoded as WebP q85; transparent ones stay PNG.
 * The raw downloaded buffer is released as soon as the normalized copy
 * exists so megapixel originals never outlive the upload on the web starter.
 *
 * Reimplemented from the `normalize-image-for-ai` pattern on
 * `codex/imagegen-stabilize-accelerate` (diff-consulted only, never merged).
 */

const MAX_REFERENCE_DIMENSION = 2048;
const LIMIT_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 85;

/** Typed rejection for references that cannot be normalized safely. */
export class CreativeWorkReferenceNormalizationError extends Error {
  readonly code = "invalid_reference_image" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CreativeWorkReferenceNormalizationError";
  }
}

export interface NormalizedCreativeWorkReference {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  originalBytes: number;
  finalBytes: number;
  hasTransparency: boolean;
}

/**
 * Normalize one reference buffer for provider/QA input only — the stored
 * original in object storage is never replaced. Applies EXIF orientation,
 * caps the long edge at 2048 without enlarging and re-encodes to a
 * memory-safe format.
 */
export async function normalizeCreativeWorkReferenceImage(input: {
  buffer: Buffer;
  mimeType?: string;
}): Promise<NormalizedCreativeWorkReference> {
  const originalBytes = input.buffer.byteLength;
  if (originalBytes <= 0) {
    throw new CreativeWorkReferenceNormalizationError("reference image buffer is empty");
  }

  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(input.buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate();
  } catch (error) {
    throw new CreativeWorkReferenceNormalizationError("unable to decode reference image", { cause: error });
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (error) {
    throw new CreativeWorkReferenceNormalizationError("unable to read reference image metadata", { cause: error });
  }

  if (!metadata.width || !metadata.height) {
    throw new CreativeWorkReferenceNormalizationError("reference image has invalid dimensions");
  }

  const hasTransparency = metadata.hasAlpha === true;
  const resized = pipeline.resize(MAX_REFERENCE_DIMENSION, MAX_REFERENCE_DIMENSION, {
    fit: "inside",
    withoutEnlargement: true,
  });

  try {
    // resolveWithObject returns the output dimensions in the same pass —
    // no second sharp decode just to read width/height.
    if (hasTransparency) {
      const { data, info } = await resized.png().toBuffer({ resolveWithObject: true });
      return {
        buffer: data,
        mimeType: "image/png",
        width: info.width,
        height: info.height,
        originalBytes,
        finalBytes: data.byteLength,
        hasTransparency: true,
      };
    }

    const { data, info } = await resized.webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      originalBytes,
      finalBytes: data.byteLength,
      hasTransparency: false,
    };
  } catch (error) {
    if (error instanceof CreativeWorkReferenceNormalizationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/Input image exceeds pixel limit|limitInputPixels|too large/i.test(message)) {
      throw new CreativeWorkReferenceNormalizationError("reference image exceeds safe pixel limit", { cause: error });
    }
    throw new CreativeWorkReferenceNormalizationError("unable to normalize reference image", { cause: error });
  }
}

/** Provider-safe file name for a normalized reference (extension matches the re-encode). */
export function normalizedCreativeWorkReferenceName(name: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : "webp";
  const baseName = name.replace(/\.[^.]+$/, "") || "reference";
  return `${baseName}.${extension}`;
}
