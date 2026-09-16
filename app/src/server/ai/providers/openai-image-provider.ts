import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import {
  dimensionsToGptImage2Size,
  toOpenAISdkImageSize,
  type OpenAIImageSize,
} from "@/lib/formats";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import {
  observeImageCall,
  type ImageCallObservation,
} from "@/server/ai/image-call-observation";
import { resolveImageRenderPolicy } from "@/server/ai/image-render-policy";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

/**
 * Timeout sits above OpenAI's documented "up to 2 minutes" worst case so a
 * legitimately slow prompt is not aborted at the ceiling.
 *
 * maxRetries stays 0 on purpose: the OpenAI SDK retries the HTTP request on
 * timeout/408/429/5xx, and a server-side image generation that finishes after
 * the client timed out can still be billed. Spec budget is max 2 provider
 * image calls per output (creative correction is the second). SDK retries
 * would silently multiply billed calls without the upstream counter seeing them.
 */
const REQUEST_OPTIONS = { timeout: 180_000, maxRetries: 0 } as const;

function resolveOpenAISize(input: ProviderGenerateInput, model: string): OpenAIImageSize {
  const isGptImage2 = model.startsWith("gpt-image-2");
  if (isGptImage2) {
    return dimensionsToGptImage2Size(input.dimensions);
  }
  // Legacy models: square / portrait / landscape SDK enum only.
  // (Unreachable for 3:4 — the render policy schema only admits gpt-image-2
  // models, and the format-id path throws explicitly in formatToOpenAIImageSize.)
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
    const policy = input.renderPolicy !== undefined
      ? resolveImageRenderPolicy(input.renderPolicy)
      : resolveImageRenderPolicy({ version: 1, model: env.OPENAI_IMAGE_MODEL, quality: input.quality ?? "medium" });
    const openaiSize = toOpenAISdkImageSize(resolveOpenAISize(input, policy.model));
    let result: OpenAI.Images.Image;
    let requestId: string | undefined;
    let observation: ImageCallObservation;

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const observed = await observeImageCall(policy, { key: input.outputPrefix, operation: "edit", size: openaiSize }, () =>
        openai.images.edit({
          model: policy.model,
          image: files,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
          quality: policy.quality as OpenAI.Images.ImageEditParams["quality"],
        }, REQUEST_OPTIONS),
      );
      const response = observed.response;
      observation = observed.observation;
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      requestId = response._request_id ?? undefined;
      logger.info(
        `[OpenAIImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
    } else {
      const observed = await observeImageCall(policy, { key: input.outputPrefix, operation: "generate", size: openaiSize }, () =>
        openai.images.generate({
          model: policy.model,
          prompt: input.prompt,
          n: 1,
          size: openaiSize,
          quality: policy.quality as OpenAI.Images.ImageGenerateParams["quality"],
        }, REQUEST_OPTIONS),
      );
      const response = observed.response;
      observation = observed.observation;
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from OpenAI");
      requestId = response._request_id ?? undefined;
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
        model: policy.model,
        durationMs: Date.now() - start,
        rawRequestId: requestId,
        revisedPrompt: result.revised_prompt || undefined,
        observation,
      },
    };
  }
}

