import sharp from "sharp";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { recordDualEngineCandidates } from "./generation-log";
import { OpenAIImageProvider } from "./providers/openai-image-provider";
import {
  E2EControlledImageProvider,
  isE2EControlledProviderEnabled,
} from "./providers/e2e-controlled-provider";
import type {
  ImageCandidate,
  ImageGenerationProvider,
  ImageReference,
  ProviderGenerateInput,
} from "./providers/image-provider";

// Re-export ImageReference under the legacy name for backward compatibility —
// derivation-pipeline.ts and downstream callers still import
// `GenerateAndStoreImageReference` from this module.
export type GenerateAndStoreImageReference = ImageReference;

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

/**
 * Provider-agnostic candidate summary persisted on derivation rows so the UI,
 * QA, and analytics can see which providers ran and which won.
 */
export type GenerationCandidateMeta = {
  provider: "openai";
  routeId?: string;
  model: string;
  outputKey: string;
  durationMs: number;
  score?: number;
  quality?: "invalid" | "improvable" | "acceptable";
  costCredits?: number;
  rawRequestId?: string;
  revisedPrompt?: string;
  selectionReason?: string;
};

export interface GenerateAndStoreImageInput {
  prompt: string;
  dimensions: { width: number; height: number };
  outputPrefix: string;
  referenceImages: ImageReference[];
  /**
   * Optional normalization mode applied after decoding the provider response.
   * Defaults to `"art_variation"`. Derivation callers may pass
   * `"format_adaptation"` or `"restyling"` to preserve existing behavior.
   */
  generationMode?: GenerationMode;
  /** Rendering quality. Exploratory routes use medium; final assets default to high. */
  quality?: "medium" | "high";
  /** Distinct route prompts. When present they are generated in parallel at medium quality. */
  routes?: Array<{ id: string; prompt: string }>;
  /** Returns the winning index from the successfully stored raw candidates. */
  selectCandidate?: (candidates: Array<{
    routeId: string;
    buffer: Buffer;
    mimeType: string;
  }>) => Promise<number | {
    winnerIndex: number;
    refinementPrompt?: string;
    reason?: string;
  }>;
  /** Optional suffix appended to the output key (e.g. `-retry`). */
  outputSuffix?: string;
}

export interface GenerateAndStoreImageResult {
  outputKey: string;
  revisedPrompt: string;
  /**
   * The narrow helper-level operation kind (`generate` vs `edit`). The wider
   * campaign `ImageOperation` union (which adds `generation_fallback`) is
   * applied by the derivation wrapper after the fallback retry.
   */
  imageOperation: "generate" | "edit";
  buffer: Buffer;
  /** Raw route candidates plus an optional refined candidate. */
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
}

/**
 * Lazily build the image provider so tests that mock the OpenAI SDK
 * before first import still work.
 */
let cachedProvider: ImageGenerationProvider | null = null;
function getImageProvider(): ImageGenerationProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = isE2EControlledProviderEnabled()
    ? new E2EControlledImageProvider()
    : new OpenAIImageProvider();
  return cachedProvider;
}

/**
 * Test seam: allow callers to inject a deterministic OpenAI-compatible provider.
 */
export function __setImageProviderForTests(provider: ImageGenerationProvider | null) {
  cachedProvider = provider;
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
  generationMode: GenerationMode
) {
  void generationMode;
  return sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position: "attention",
    })
    .png()
    .toBuffer();
}

export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput
): Promise<GenerateAndStoreImageResult> {
  const {
    prompt,
    dimensions,
    outputPrefix,
    referenceImages,
    generationMode = "art_variation",
    quality = "high",
    routes,
    selectCandidate,
    outputSuffix = "",
  } = input;

  const provider = getImageProvider();
  const requestedRoutes = routes?.length
    ? routes
    : [{ id: "openai", prompt }];
  const generationResults = await Promise.allSettled(
    requestedRoutes.map(async (route) => {
      const providerInput: ProviderGenerateInput = {
        prompt: route.prompt,
        dimensions,
        referenceImages,
        generationMode,
        outputPrefix,
        quality: routes?.length ? "medium" : quality,
      };
      return { routeId: route.id, candidate: await provider.generate(providerInput) };
    })
  );
  const generatedCandidates = generationResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter((result): result is { routeId: string; candidate: ImageCandidate } => result !== null);

  if (generatedCandidates.length === 0) {
    const reason = generationResults
      .map((result) => result.status === "rejected" ? String(result.reason) : "")
      .filter(Boolean)
      .join("; ");
    throw new Error(`All image candidates failed: ${reason}`);
  }

  const uploadResults = await Promise.allSettled(
    generatedCandidates.map(async ({ routeId, candidate }) => {
      const outputKey = `${outputPrefix}/candidates/${routeId}${outputSuffix}.png`;
      await objectStorage.put(outputKey, candidate.buffer, candidate.mimeType);
      return { routeId, candidate, outputKey };
    })
  );

  const candidates: { routeId: string; candidate: ImageCandidate; outputKey: string }[] =
    uploadResults
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((v): v is { routeId: string; candidate: ImageCandidate; outputKey: string } => v !== null);

  type FailedUpload = { provider: "openai"; reason: unknown };
  const failedUploads: FailedUpload[] = [];
  uploadResults.forEach((r, idx) => {
    if (r.status === "rejected") {
      failedUploads.push({
        provider: generatedCandidates[idx].candidate.providerMeta.provider,
        reason: r.reason,
      });
    }
  });

  if (failedUploads.length > 0) {
    logger.warn(
      `[generateAndStoreImage] ${failedUploads.length}/${generatedCandidates.length} per-candidate R2 upload(s) failed; continuing with successful candidates`,
      failedUploads.map((f) => ({ provider: f.provider, reason: f.reason instanceof Error ? f.reason.message : String(f.reason) }))
    );
  }

  if (candidates.length === 0) {
    // All R2 uploads failed. Throw so the derivation is marked failed and
    // the upstream retry/refund flow takes over.
    const summary = failedUploads
      .map((f) => `${f.provider}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`)
      .join("; ");
    throw new Error(`All per-candidate R2 uploads failed: ${summary}`);
  }

  const selection = selectCandidate
    ? await selectCandidate(candidates.map(({ routeId, candidate }) => ({
        routeId,
        buffer: candidate.buffer,
        mimeType: candidate.mimeType,
      })))
    : 0;
  let winnerIndex = typeof selection === "number" ? selection : selection.winnerIndex;
  let selectionReason = typeof selection === "number" ? undefined : selection.reason;
  if (!Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= candidates.length) {
    throw new Error(`Candidate selector returned invalid index ${winnerIndex}`);
  }
  const refinementPrompt = typeof selection === "number" ? undefined : selection.refinementPrompt;
  if (selectCandidate && refinementPrompt) {
    const selected = candidates[winnerIndex];
    try {
      const refinedCandidate = await provider.generate({
        prompt: `${refinementPrompt}\nPreserve all correct facts, product geometry, brand identity, and composition unless explicitly requested otherwise.`,
        dimensions,
        referenceImages: [
          {
            buffer: selected.candidate.buffer,
            mimeType: selected.candidate.mimeType,
            name: "selected-candidate.png",
          },
          ...referenceImages,
        ],
        generationMode,
        outputPrefix,
        quality: "high",
      });
      const refinedOutputKey = `${outputPrefix}/candidates/refined${outputSuffix}.png`;
      await objectStorage.put(
        refinedOutputKey,
        refinedCandidate.buffer,
        refinedCandidate.mimeType
      );
      const refined = {
        routeId: "refined",
        candidate: refinedCandidate,
        outputKey: refinedOutputKey,
      };
      const comparison = await selectCandidate([
        {
          routeId: selected.routeId,
          buffer: selected.candidate.buffer,
          mimeType: selected.candidate.mimeType,
        },
        {
          routeId: refined.routeId,
          buffer: refined.candidate.buffer,
          mimeType: refined.candidate.mimeType,
        },
      ]);
      const comparisonIndex = typeof comparison === "number"
        ? comparison
        : comparison.winnerIndex;
      if (comparisonIndex !== 0 && comparisonIndex !== 1) {
        throw new Error(`Refinement selector returned invalid index ${comparisonIndex}`);
      }
      candidates.push(refined);
      if (comparisonIndex === 1) {
        winnerIndex = candidates.length - 1;
        if (typeof comparison !== "number" && comparison.reason) {
          selectionReason = [selectionReason, comparison.reason].filter(Boolean).join(" | ");
        }
      }
    } catch (error) {
      logger.warn("[generateAndStoreImage] winner refinement failed; keeping original", error);
    }
  }

  const winner = candidates[winnerIndex];
  const normalizedWinner = await normalizeGeneratedImage(
    winner.candidate.buffer,
    dimensions,
    generationMode
  );

  // Upload the winner to its expected location so downstream code
  // (which reads `outputKey`) keeps working unchanged.
  const finalKey = `${outputPrefix}/${Date.now()}${outputSuffix}.png`;
  await objectStorage.put(finalKey, normalizedWinner, "image/png");

  const candidateMeta: (GenerationCandidateMeta & { winner: boolean })[] =
    candidates.map((c, idx) => ({
      provider: c.candidate.providerMeta.provider,
      routeId: c.routeId,
      model: c.candidate.providerMeta.model,
      outputKey: c.outputKey,
      durationMs: c.candidate.providerMeta.durationMs,
      costCredits: c.candidate.providerMeta.costCredits,
      rawRequestId: c.candidate.providerMeta.rawRequestId,
      revisedPrompt: c.candidate.providerMeta.revisedPrompt,
      selectionReason: idx === winnerIndex ? selectionReason : undefined,
      winner: idx === winnerIndex,
    }));

  logger.info(
    `[generateAndStoreImage] produced ${candidates.length} candidate(s); winner=${winner.candidate.providerMeta.provider}`
  );

  // Emit the telemetry event before returning. `campaignId`/`workspaceId`/
  // `jobType` are not threaded through this helper yet; we emit with the
  // metadata we have so analytics can index runs by derivationId even before
  // the signature extension lands. Follow-up: accept a `telemetry` block.
  await recordDualEngineCandidates({
    campaignId: "",
    derivationId: outputPrefix,
    workspaceId: "",
    jobType: "derivation",
    candidates: candidateMeta.map((c) => ({
      provider: c.provider,
      model: c.model,
      outputKey: c.outputKey,
      durationMs: c.durationMs,
      costCredits: c.costCredits,
      rawRequestId: c.rawRequestId,
    })),
    winnerProvider: winner.candidate.providerMeta.provider,
    aggregateLatencyMs:
      candidates.length > 0
        ? Math.max(
            ...candidates.map((c) => c.candidate.providerMeta.durationMs)
          )
        : 0,
  });

  return {
    outputKey: finalKey,
    // Surface the winner's revised prompt so the helper-level contract
    // (downstream reads `result.revisedPrompt`) is preserved.
    revisedPrompt: winner.candidate.providerMeta.revisedPrompt ?? "",
    imageOperation:
      referenceImages.length > 0 ? "edit" : "generate",
    buffer: normalizedWinner,
    candidates: candidateMeta,
  };
}
