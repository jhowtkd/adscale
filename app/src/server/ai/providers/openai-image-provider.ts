import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import { toOpenAISdkImageSize } from "@/lib/formats";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function dimensionsToOpenAISdkSize(dimensions: { width: number; height: number }) {
  const ratio = dimensions.width / dimensions.height;
  const isGptImage2 = env.OPENAI_IMAGE_MODEL.startsWith("gpt-image-2");
  if (Math.abs(ratio - 1) < 0.05) {
    return toOpenAISdkImageSize("1024x1024");
  }
  if (ratio < 1) {
    if (isGptImage2) {
      return ratio < 0.7
        ? toOpenAISdkImageSize("1152x2048")
        : toOpenAISdkImageSize("1024x1280");
    }
    return toOpenAISdkImageSize("1024x1536");
  }
  return toOpenAISdkImageSize("1536x1024");
}

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  // R-007: the SDK timeout is the SINGLE timeout authority — it aborts the
  // underlying HTTP request, unlike an external Promise.race that would leave
  // the request running. Durable job retries already own transient recovery.
  timeout: IMAGE_GENERATION_TIMEOUT_MS,
  maxRetries: 0,
});

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai" as const;

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    const start = Date.now();
    const openaiSize = dimensionsToOpenAISdkSize(input.dimensions);
    let result: OpenAI.Images.Image;

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const response = await openai.images.edit({
        model: env.OPENAI_IMAGE_MODEL,
        image: files,
        prompt: input.prompt,
        n: 1,
        size: openaiSize,
        quality: input.quality ?? "high",
      });
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      logger.info(
        `[OpenAIImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
    } else {
      const response = await openai.images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt: input.prompt,
        n: 1,
        size: openaiSize,
        quality: input.quality ?? "high",
      });
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
