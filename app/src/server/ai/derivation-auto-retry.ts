import OpenAI, { toFile } from "openai";
import { env } from "../validation/env";
import { downloadBuffer, uploadBuffer } from "../storage/r2";
import { buildDerivationPrompt } from "./prompt-builder";
import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailure } from "./creative-quality-gate";
import { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";
import { getDerivationById, updateDerivationPromptProvenance } from "../repositories/derivation";
import { normalizeGeneratedImage } from "../jobs/derivation";
import { formatToOpenAIImageSize, getTargetDimensions, toOpenAISdkImageSize } from "@/lib/formats";
import { logger } from "@/lib/logger";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

export { shouldAutoRetryDerivation } from "./derivation-auto-retry-policy";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout!));
}

export interface AutoRetryDerivationInput {
  derivationId: string;
  workspaceId: string;
  campaignId: string;
  referenceKey: string;
  referenceMimeType: string;
  correctionFeedback: string;
  promptContext: Parameters<typeof buildDerivationPrompt>[0];
  contract: CreativeContract;
  targetFormat: string;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  isPreview?: boolean;
}

export async function runDerivationAutoRetry(
  input: AutoRetryDerivationInput
): Promise<{ outputKey: string; revisedPrompt: string } | null> {
  const row = await getDerivationById(input.derivationId, input.workspaceId);
  if (!row) return null;

  const hardFailures = Array.isArray(row.hardFailures)
    ? (row.hardFailures as CreativeHardFailure[])
    : [];
  const generationLog = row.generationLog as { autoRetryAttempted?: boolean } | null;
  if (
    !shouldAutoRetryDerivation(
      input.generationMode,
      hardFailures,
      generationLog?.autoRetryAttempted
    )
  ) {
    return null;
  }

  logger.info(`[auto-retry] derivationId=${input.derivationId} failures=${hardFailures.map((f) => f.code).join(",")}`);

  const referenceBuffer = await downloadBuffer(input.referenceKey);
  const openaiSize = toOpenAISdkImageSize(
    formatToOpenAIImageSize(input.targetFormat, {
      isPreview: input.isPreview,
      modelName: env.OPENAI_IMAGE_MODEL,
    })
  );

  const prompt = `${buildDerivationPrompt({
    ...input.promptContext,
    feedback: input.correctionFeedback,
  })}\n\nAUTO-RETRY CORRECTION:\nThe previous output failed QA. Fix these issues exactly:\n${input.correctionFeedback}`;

  const referenceImage = await toFile(referenceBuffer, "reference-image", {
    type: input.referenceMimeType,
  });

  const response = await withTimeout(
    openai.images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: referenceImage,
      prompt,
      n: 1,
      size: openaiSize,
    }),
    IMAGE_GENERATION_TIMEOUT_MS,
    "OpenAI image edit (auto-retry)"
  );

  const first = response.data?.[0];
  if (!first) throw new Error("No image data returned from OpenAI auto-retry");

  let buffer: Buffer;
  if (first.b64_json) {
    buffer = Buffer.from(first.b64_json, "base64");
  } else if (first.url) {
    const imageResponse = await fetch(first.url, { signal: AbortSignal.timeout(30_000) });
    if (!imageResponse.ok) {
      throw new Error(`Failed to download auto-retry image: ${imageResponse.status}`);
    }
    buffer = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error("No image data returned from auto-retry");
  }

  const dimensions = getTargetDimensions(input.targetFormat, input.isPreview);
  if (dimensions) {
    buffer = await normalizeGeneratedImage(buffer, dimensions, input.generationMode);
  }

  const key = `derivations/${input.derivationId}/${Date.now()}-retry.png`;
  await uploadBuffer(key, buffer, "image/png");

  const revisedPrompt = first.revised_prompt ?? "";
  await updateDerivationPromptProvenance(input.derivationId, input.workspaceId, {
    creativeContract: input.contract,
    promptProvenance: {
      ...(row.promptProvenance ?? {
        schemaVersion: 1,
        inputPrompt: prompt,
        model: env.OPENAI_IMAGE_MODEL,
        requestedSize: openaiSize,
        sourcePackage: "campaign_asset",
        source: null,
        generationMode: input.generationMode,
        targetFormat: input.targetFormat,
      }),
      inputPrompt: prompt,
      revisedPrompt,
      imageOperation: "edit",
      outputKey: key,
    },
    inputPrompt: prompt,
    prompt: revisedPrompt,
  });

  return { outputKey: key, revisedPrompt };
}
