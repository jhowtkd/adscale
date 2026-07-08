import OpenAI, { toFile } from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ProviderGenerateInput,
} from "./image-provider";

const SEEDREAM_TIMEOUT_MS = 5 * 60 * 1000;

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

function dimensionsToSeedreamSize(dimensions: { width: number; height: number }): string {
  // ModelArk accepts a "size" string in WxH format for Seedream.
  return `${dimensions.width}x${dimensions.height}`;
}

/**
 * Provider implementation for BytePlus ModelArk Seedream 5 Pro.
 *
 * Talks to the OpenAI-compatible endpoint at SEEDREAM_BASE_URL.
 * The exact request shape is the same as the OpenAI SDK (model, prompt,
 * image[], n, size) so we reuse the same client structure.
 */
export class SeedreamImageProvider implements ImageGenerationProvider {
  readonly name = "seedream" as const;

  private client: OpenAI;
  private model: string;

  constructor(opts?: { client?: OpenAI; model?: string }) {
    if (opts?.client) {
      this.client = opts.client;
    } else {
      this.client = new OpenAI({
        apiKey: env.BYTEPLUS_API_KEY,
        baseURL: env.SEEDREAM_BASE_URL,
        timeout: 120_000,
      });
    }
    this.model = opts?.model ?? env.SEEDREAM_MODEL_NAME ?? "unknown";
  }

  async generate(input: ProviderGenerateInput): Promise<ImageCandidate> {
    if (!env.BYTEPLUS_API_KEY) {
      throw new Error("BYTEPLUS_API_KEY is not set; cannot run Seedream provider");
    }
    if (!env.SEEDREAM_MODEL_NAME) {
      throw new Error(
        "SEEDREAM_MODEL_NAME is not set; cannot run Seedream provider"
      );
    }

    const start = Date.now();
    const size = dimensionsToSeedreamSize(input.dimensions);
    let result: OpenAI.Images.Image;

    if (input.referenceImages.length > 0) {
      const files = await Promise.all(
        input.referenceImages.map((ref) =>
          toFile(ref.buffer, ref.name, { type: ref.mimeType })
        )
      );
      const response = (await withTimeout(
        this.client.images.edit({
          model: this.model,
          image: files,
          prompt: input.prompt,
          n: 1,
          // ModelArk accepts arbitrary WxH strings; SDK's strict size union doesn't include them.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          size: size as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
        SEEDREAM_TIMEOUT_MS,
        "Seedream image edit"
      )) as OpenAI.Images.ImagesResponse;
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from Seedream");
      logger.info(
        `[SeedreamImageProvider] edit success references=${input.referenceImages.length}`
      );
      result = first;
    } else {
      const response = (await withTimeout(
        this.client.images.generate({
          model: this.model,
          prompt: input.prompt,
          n: 1,
          // ModelArk accepts arbitrary WxH strings; SDK's strict size union doesn't include them.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          size: size as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
        SEEDREAM_TIMEOUT_MS,
        "Seedream image generation"
      )) as OpenAI.Images.ImagesResponse;
      const first = response.data?.[0];
      if (!first) throw new Error("No image data returned from Seedream");
      logger.info(`[SeedreamImageProvider] generate success`);
      result = first;
    }

    let buffer: Buffer;
    if (result.b64_json) {
      buffer = Buffer.from(result.b64_json, "base64");
    } else if (result.url) {
      buffer = await fetchProviderUrlSafe(result.url);
    } else {
      throw new Error("No image data returned from Seedream");
    }

    return {
      buffer,
      mimeType: "image/png",
      providerMeta: {
        provider: "seedream",
        model: this.model,
        durationMs: Date.now() - start,
      },
    };
  }
}
