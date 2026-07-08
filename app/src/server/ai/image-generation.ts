import sharp from "sharp";
import { objectStorage } from "@/server/storage";
import { logger } from "@/lib/logger";
import { recordDualEngineCandidates } from "./generation-log";
import { OpenAIImageProvider } from "./providers/openai-image-provider";
import { SeedreamImageProvider } from "./providers/seedream-image-provider";
import { CompositeImageProvider } from "./providers/composite-image-provider";
import type { ImageCandidate, ImageReference, ProviderGenerateInput } from "./providers/image-provider";

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
  provider: "openai" | "seedream";
  model: string;
  outputKey: string;
  durationMs: number;
  score?: number;
  quality?: "invalid" | "improvable" | "acceptable";
  costCredits?: number;
  rawRequestId?: string;
  revisedPrompt?: string;
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
  /**
   * Per-provider candidate summary. Always present; has 1 or 2 entries
   * depending on how many providers succeeded. The `winner` flag marks the
   * candidate whose `outputKey` matches the result's top-level `outputKey`.
   */
  candidates: (GenerationCandidateMeta & { winner: boolean })[];
}

/**
 * Lazily build the composite provider so tests that mock the OpenAI SDK
 * before first import still work.
 */
let cachedComposite: CompositeImageProvider | null = null;
function getCompositeProvider(): CompositeImageProvider {
  if (cachedComposite) return cachedComposite;
  cachedComposite = new CompositeImageProvider([
    new OpenAIImageProvider(),
    new SeedreamImageProvider(),
  ]);
  return cachedComposite;
}

/**
 * Test seam: allow callers (especially tests) to inject a custom composite.
 */
export function __setCompositeProviderForTests(provider: CompositeImageProvider | null) {
  cachedComposite = provider;
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

export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput
): Promise<GenerateAndStoreImageResult> {
  const {
    prompt,
    dimensions,
    outputPrefix,
    referenceImages,
    generationMode = "art_variation",
    outputSuffix = "",
  } = input;

  const composite = getCompositeProvider();
  const providerInput: ProviderGenerateInput = {
    prompt,
    dimensions,
    referenceImages,
    generationMode,
    outputPrefix,
  };

  const { candidates: rawCandidates } = await composite.generate(providerInput);

  // Normalize every candidate and upload to R2. Use `Promise.allSettled` so a
  // transient R2 failure on one candidate's per-candidate upload does not
  // fail the entire derivation — the upstream provider has already paid for
  // the generation. Candidates whose R2 upload failed are kept in memory
  // (their normalized buffer is still available) and a successful candidate
  // becomes the winner.
  const normalizedCandidates = await Promise.all(
    rawCandidates.map(async (candidate) => {
      const normalized = await normalizeGeneratedImage(
        candidate.buffer,
        dimensions,
        generationMode
      );
      return { candidate, normalized };
    })
  );

  const uploadResults = await Promise.allSettled(
    normalizedCandidates.map(async ({ candidate, normalized }) => {
      const outputKey = `${outputPrefix}/candidates/${candidate.providerMeta.provider}${outputSuffix}.png`;
      await objectStorage.put(outputKey, normalized, "image/png");
      return { candidate, normalized, outputKey };
    })
  );

  const candidates: { candidate: ImageCandidate; normalized: Buffer; outputKey: string }[] =
    uploadResults
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((v): v is { candidate: ImageCandidate; normalized: Buffer; outputKey: string } => v !== null);

  type FailedUpload = { provider: "openai" | "seedream"; reason: unknown };
  const failedUploads: FailedUpload[] = [];
  uploadResults.forEach((r, idx) => {
    if (r.status === "rejected") {
      failedUploads.push({
        provider: normalizedCandidates[idx].candidate.providerMeta.provider,
        reason: r.reason,
      });
    }
  });

  if (failedUploads.length > 0) {
    logger.warn(
      `[generateAndStoreImage] ${failedUploads.length}/${normalizedCandidates.length} per-candidate R2 upload(s) failed; continuing with successful candidates`,
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

  // Pick the winner. Today this is the first candidate (provider order).
  // A future task wires in creative-score per candidate and picks the
  // highest-scoring one. For the rollout, the order is: openai first,
  // seedream second; OpenAI wins on tie so behavior is identical to
  // pre-change when only OpenAI is enabled.
  const winnerIndex = 0;
  const winner = candidates[winnerIndex];

  // Upload the winner to its expected location so downstream code
  // (which reads `outputKey`) keeps working unchanged.
  const finalKey = `${outputPrefix}/${Date.now()}${outputSuffix}.png`;
  await objectStorage.put(finalKey, winner.normalized, "image/png");

  const candidateMeta: (GenerationCandidateMeta & { winner: boolean })[] =
    candidates.map((c, idx) => ({
      provider: c.candidate.providerMeta.provider,
      model: c.candidate.providerMeta.model,
      outputKey: c.outputKey,
      durationMs: c.candidate.providerMeta.durationMs,
      costCredits: c.candidate.providerMeta.costCredits,
      rawRequestId: c.candidate.providerMeta.rawRequestId,
      revisedPrompt: c.candidate.providerMeta.revisedPrompt,
      winner: idx === winnerIndex,
    }));

  logger.info(
    `[generateAndStoreImage] dual-engine produced ${candidates.length} candidate(s); winner=${winner.candidate.providerMeta.provider}`
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
    // (downstream reads `result.revisedPrompt`) is preserved. Empty string
    // when the winner provider doesn't supply one (e.g. Seedream).
    revisedPrompt: winner.candidate.providerMeta.revisedPrompt ?? "",
    imageOperation:
      referenceImages.length > 0 ? "edit" : "generate",
    buffer: winner.normalized,
    candidates: candidateMeta,
  };
}
