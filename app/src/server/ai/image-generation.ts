import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { env } from "../validation/env";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { fetchProviderUrlSafe } from "./safe-fetch";
import {
  formatToOpenAIImageSize,
  getTargetDimensions,
  toOpenAISdkImageSize,
} from "@/lib/formats";
import type { ImageOperation } from "./creative-contract";

// R6: keep the SDK client at 120s; withTimeout is the real barrier.
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}

/**
 * Resize/normalize a generated image to the target format dimensions.
 *
 * Originally lived in derivation-pipeline.ts (and jobs/derivation.ts) as the
 * post-processing step for the derivation pipeline. Relocated here as part of
 * Task 4 (Create Post plan) so the campaign-neutral image helper can apply
 * the same normalization to creative-work outputs. Re-exported from
 * `derivation-pipeline.ts` and `jobs/derivation.ts` so existing callers keep
 * working unchanged.
 */
export async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: "art_variation" | "format_adaptation" | "restyling",
) {
  if (generationMode === "format_adaptation") {
    return sharp(buffer)
      .resize(dimensions.width, dimensions.height, {
        fit: "cover",
        position: "attention",
      })
      .png()
      .toBuffer();
  }

  const backgroundPosition = "centre";

  const background = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position: backgroundPosition,
    })
    .blur(24)
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .png()
    .toBuffer();

  const foreground = await sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

export interface GenerateAndStoreImageReference {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

export interface GenerateAndStoreImageInput {
  prompt: string;
  targetFormat: "1:1" | "4:5" | "9:16";
  outputPrefix: string;
  referenceImages: GenerateAndStoreImageReference[];
  /**
   * Optional normalization mode applied after decoding the provider response.
   * Defaults to `"art_variation"`. Derivation callers may pass
   * `"format_adaptation"` or `"restyling"` to preserve existing behavior.
   */
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  /** Optional suffix appended to the output key (e.g. `-retry`). */
  outputSuffix?: string;
}

export interface GenerateAndStoreImageResult {
  outputKey: string;
  revisedPrompt: string;
  imageOperation: ImageOperation;
  buffer: Buffer;
}

/**
 * Campaign-neutral image generation helper. Calls the OpenAI images API
 * (`generate` for zero references, `edit` for one or more), downloads the
 * result via the safe provider fetcher, normalizes the buffer to the target
 * dimensions, and persists it under `outputPrefix`. Used by the derivation
 * pipeline and the creative-work generation flow.
 *
 * Timeout: SDK client 120s; overall `withTimeout` barrier 5 minutes (R6).
 */
export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput
): Promise<GenerateAndStoreImageResult> {
  const {
    prompt,
    targetFormat,
    outputPrefix,
    referenceImages,
    generationMode = "art_variation",
    outputSuffix = "",
  } = input;

  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(targetFormat, { modelName: env.OPENAI_IMAGE_MODEL })
  );

  let result: OpenAI.Images.Image;
  let imageOperation: ImageOperation;

  if (referenceImages.length > 0) {
    const files = await Promise.all(
      referenceImages.map((ref) =>
        toFile(ref.buffer, ref.name, { type: ref.mimeType })
      )
    );

    const response = await withTimeout(
      openai.images.edit({
        model: env.OPENAI_IMAGE_MODEL,
        image: files,
        prompt,
        n: 1,
        size: openaiSize,
      }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "OpenAI image edit"
    );
    const first = response.data?.[0];
    if (!first) throw new Error("No image data returned from OpenAI");
    logger.info(`[generateAndStoreImage] edit success references=${referenceImages.length}`);
    result = first;
    imageOperation = "edit";
  } else {
    const response = await withTimeout(
      openai.images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: openaiSize,
      }),
      IMAGE_GENERATION_TIMEOUT_MS,
      "OpenAI image generation"
    );
    const first = response.data?.[0];
    if (!first) throw new Error("No image data returned from OpenAI");
    logger.info(`[generateAndStoreImage] generate success`);
    result = first;
    imageOperation = "generate";
  }

  let buffer: Buffer;
  if (result.b64_json) {
    buffer = Buffer.from(result.b64_json, "base64");
  } else if (result.url) {
    buffer = await fetchProviderUrlSafe(result.url);
  } else {
    throw new Error("No image data returned");
  }

  const dimensions = getTargetDimensions(targetFormat, false);
  if (dimensions) {
    buffer = await normalizeGeneratedImage(buffer, dimensions, generationMode);
  }

  const key = `${outputPrefix}/${Date.now()}${outputSuffix}.png`;
  await objectStorage.put(key, buffer, "image/png");

  const revisedPrompt = result.revised_prompt || "";

  return {
    outputKey: key,
    revisedPrompt,
    imageOperation,
    buffer,
  };
}