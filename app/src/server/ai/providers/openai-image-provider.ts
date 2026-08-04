import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import {
  dimensionsToGptImage2Size,
  toOpenAISdkImageSize,
  type OpenAIImageSize,
} from "@/lib/formats";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

/**
 * Transport reliability only — NOT a second creative call.
 * Creative correction budget (max 2 image calls) is enforced upstream.
 * Timeout sits above OpenAI's documented "up to 2 minutes" worst case so a
 * legitimately slow prompt is not aborted at the ceiling.
 */
const REQUEST_OPTIONS = { timeout: 180_000, maxRetries: 1 } as const;

function resolveOpenAISize(input: ProviderGenerateInput): OpenAIImageSize {
  const isGptImage2 = env.OPENAI_IMAGE_MODEL.startsWith("gpt-image-2");
  if (isGptImage2) {
    return dimensionsToGptImage2Size(input.dimensions);
  }
  // Legacy models: square / portrait / landscape SDK enum only.
  const ratio = input.dimensions.width / input.dimensions.height;
  if (Math.abs(ratio - 1) < 0.05) return "1024x1024";
  if (ratio < 1) return "1024x1536";
  return "1536x1024";
}

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: REQUEST_OPTIONS.timeout,
  maxRetries: REQUEST_OPTIONS.maxRetries,
});

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai" as const;

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    const start = Date.now();
    const openaiSize = toOpenAISdkImageSize(resolveOpenAISize(input));
    let result: OpenAI.Images.Image;

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const response = await openai.images.edit(
        {
          model: env.OPENAI_IMAGE_MODEL,
          image: files,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
          quality: input.quality ?? "medium",
        },
        REQUEST_OPTIONS
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(
        `[OpenAIImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
    } else {
      const response = await openai.images.generate(
        {
          model: env.OPENAI_IMAGE_MODEL,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
          quality: input.quality ?? "medium",
        },
        REQUEST_OPTIONS
      );
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(`[OpenAIImageProvider] generate success`);
      result = first;
    }

    let buffer: Buffer;
    if (result.b64_json) {
      buffer = Buffer.from(result.b64_json, "base64");
    } else if (result.url) {
      buffer = await fetchProviderUrlSafe(result.url);
    } else {
      throw new Error("No image data returned from OpenAI");
    }

    return {
      buffer,
      mimeType: "image/png",
      providerMeta: {
        provider: "openai",
        model: env.OPENAI_IMAGE_MODEL,
        durationMs: Date.now() - start,
        revisedPrompt: result.revised_prompt || undefined,
      },
    };
  }
}


