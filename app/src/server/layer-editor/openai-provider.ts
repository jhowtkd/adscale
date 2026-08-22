import "server-only";

import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { dimensionsToGptImage2Size, toOpenAISdkImageSize } from "@/lib/formats";
import { fetchProviderUrlSafe } from "@/server/ai/safe-fetch";
import { env } from "@/server/validation/env";

export const LAYER_REGENERATION_MODEL = "gpt-image-2" as const;
export const LAYER_REGENERATION_MAX_BYTES = 25 * 1024 * 1024;
export const LAYER_REGENERATION_MAX_PIXELS = 40_000_000;

export type LayerRegenerationProvider = { regenerate(input: { instruction: string; selectedLayer: Buffer; composite: Buffer; bounds: { width: number; height: number } }): Promise<{ buffer: Buffer; requestId: string | null }> };

export class OpenAILayerRegenerationProvider implements LayerRegenerationProvider {
  private readonly client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 0 });
  async regenerate(input: { instruction: string; selectedLayer: Buffer; composite: Buffer; bounds: { width: number; height: number } }) {
    const [selected, composite] = await Promise.all([
      toFile(input.selectedLayer, "selected-layer.png", { type: "image/png" }),
      toFile(input.composite, "composition-context.png", { type: "image/png" }),
    ]);
    const response = await this.client.images.edit({
      model: LAYER_REGENERATION_MODEL, image: [selected, composite],
      prompt: `Revise somente o elemento isolado solicitado: ${input.instruction}. Retorne somente esse elemento em PNG transparente; sem fundo, moldura, texto extra ou composição completa.`,
      n: 1, size: toOpenAISdkImageSize(dimensionsToGptImage2Size(input.bounds)), quality: "medium", background: "transparent", output_format: "png",
    }, { timeout: 180_000, maxRetries: 0 });
    const result = response.data?.[0];
    if (!result) throw new Error("OpenAI returned no layer candidate");
    const buffer = result.b64_json ? Buffer.from(result.b64_json, "base64") : result.url ? await fetchProviderUrlSafe(result.url) : null;
    if (!buffer) throw new Error("OpenAI returned no layer candidate");
    return { buffer, requestId: response._request_id ?? null };
  }
}

export async function normalizeLayerCandidate(buffer: Buffer, bounds: { width: number; height: number }): Promise<Buffer> {
  if (buffer.length === 0 || buffer.length > LAYER_REGENERATION_MAX_BYTES || buffer.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) throw new Error("Invalid PNG candidate");
  const image = sharp(buffer, { limitInputPixels: LAYER_REGENERATION_MAX_PIXELS });
  const metadata = await image.metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) throw new Error("Candidate must be transparent PNG");
  const raw = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let hasAlpha = false; for (let index = 3; index < raw.data.length; index += raw.info.channels) if (raw.data[index]! > 0) { hasAlpha = true; break; }
  if (!hasAlpha) throw new Error("Candidate alpha is empty");
  return sharp(buffer).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(bounds.width, bounds.height, { fit: "contain" }).extend({ top: 0, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
