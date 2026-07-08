import "server-only";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { generateAndStoreImage } from "@/server/ai/image-generation";
import { analyzeDerivationCreative, type ScoreResult } from "@/server/ai/creative-score";
import { getClientProfile } from "@/server/repositories/client-reference";
import { refundCredits } from "@/server/billing/credits";
import {
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  completeCreativeWorkOutput,
  failCreativeWorkOutput,
  refreshCreativeWorkStatus,
} from "@/server/repositories/creative-work";
import {
  buildSocialPostPrompt,
  type SocialPostFormat,
} from "@/server/creative-work/prompt";
import {
  composeExactBrandAssets,
  type BrandAssetGravity,
} from "@/server/creative-work/composite";
import { getTargetDimensions } from "@/lib/formats";
import type {
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "@/server/creative-work/contracts";
import { inngest } from "./client";

interface CreativeWorkGenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  creativeLevel: "conservative" | "balanced" | "bold";
}

const OUTPUT_COST = 5;
const MAX_REFERENCE_IMAGES = 4;
/**
 * Outputs scoring below this threshold are treated as `low_quality` failures
 * — the row is marked failed, the user is refunded, and the UI surfaces the
 * failure as a retryable proposition. Tuned conservatively: the brief
 * scoring rubric uses `MEAN_QUALITY_THRESHOLD = 75` for batch validation, so
 * a per-output cutoff of 60 only rejects clear misses.
 */
const OUTPUT_MIN_QUALITY_SCORE = 60;

/**
 * Sanitize arbitrary error messages into a short, user-safe slug. The slug is
 * persisted on the output row so retry routes / UI can group failures without
 * leaking provider internals.
 */
export function sanitizeCreativeWorkFailureCode(message: string): string {
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (slug.length === 0) return "provider_failed";
  return slug;
}

export const creativeWorkOutputJob = inngest.createFunction(
  {
    id: "generate-creative-work-output",
    retries: 0,
    triggers: [{ event: "creative-work.generate" }],
  },
  async ({ event, step }) => {
    const data = event.data as CreativeWorkGenerateEvent;
    const { workspaceId, workItemId, outputId, creativeLevel } = data;
    logger.info(
      `[creativeWorkOutputJob] START workspaceId=${workspaceId} workItemId=${workItemId} outputId=${outputId} level=${creativeLevel}`,
    );

    try {
      const scopeRaw = (await step.run("load-scope", async () => {
        const result = await getCreativeWork(workspaceId, workItemId);
        if (!result) return null;
        const output = result.outputs.find((o) => o.id === outputId) ?? null;
        return {
          work: result.work,
          output,
        };
      })) as unknown as {
        work: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { work: infer W }
            ? W
            : never
          : never;
        output: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { outputs: infer O }
            ? O extends Array<infer Item>
              ? Item | null
              : never
            : never
          : never;
      } | null;

      if (
        !scopeRaw ||
        !scopeRaw.output ||
        !scopeRaw.work.identitySnapshot ||
        !scopeRaw.work.copy
      ) {
        logger.warn(
          `[creativeWorkOutputJob] SKIP missing scope workspaceId=${workspaceId} outputId=${outputId}`,
        );
        return { success: false, skipped: true, outputId };
      }

      const work = scopeRaw.work;
      const output = scopeRaw.output;
      const identitySnapshot = work.identitySnapshot as CreativeWorkIdentitySnapshot;
      const copy = work.copy as SocialPostCopy;

      // Idempotency: if a duplicate event arrives after the row already
      // completed, skip provider invocation entirely.
      if (output.status === "completed") {
        logger.info(
          `[creativeWorkOutputJob] SKIP duplicate event outputId=${outputId} status=completed`,
        );
        return { success: true, skipped: true, outputId, outputKey: output.outputKey };
      }

      await step.run("mark-processing", async () => {
        await markCreativeWorkOutputProcessing(workspaceId, workItemId, outputId);
      });

      const targetFormat = work.format as SocialPostFormat;
      const dimensions = getTargetDimensions(targetFormat) ?? {
        width: 1024,
        height: 1280,
      };

      // Pre-generator block: prompt assembly + reference image load. Any
      // failure here happens before the upstream provider is invoked, so
      // we refund the per-output credit and let the outer catch mark the
      // output failed. Failures inside `generate-base` and after are
      // intentionally NOT refunded — the charge covers the dispatch slot.
      let prompt: string;
      let referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
      try {
        prompt = buildSocialPostPrompt({
          format: targetFormat,
          copy,
          identitySnapshot,
          creativeLevel,
        });

        const referenceAssets = identitySnapshot.assets
          .filter((asset) => asset.usageMode === "reference")
          .slice(0, MAX_REFERENCE_IMAGES);

        referenceImages = (await step.run("load-reference-images", async () => {
          const buffers = await Promise.all(
            referenceAssets.map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              mimeType: asset.mimeType,
              name: asset.label,
            })),
          );
          return buffers;
        })) as unknown as Array<{ buffer: Buffer; mimeType: string; name: string }>;
      } catch (error) {
        await refundPreGeneratorOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      const generated = await step.run("generate-base", async () => {
        return generateAndStoreImage({
          prompt,
          dimensions,
          outputPrefix: `creative-work/${outputId}`,
          referenceImages,
          generationMode: "art_variation",
        });
      });
      const generatedBuffer = (generated as unknown as { buffer: Buffer }).buffer;
      const generatedOutputKey = (generated as unknown as { outputKey: string }).outputKey;

      const exactAssets = identitySnapshot.assets.filter(
        (asset) => asset.usageMode === "exact" && asset.placement,
      );

      if (exactAssets.length > 0) {
        await step.run("compose-exact-layers", async () => {
          const layers = await Promise.all(
            exactAssets.map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              gravity: asset.placement!.gravity as BrandAssetGravity,
              widthRatio: asset.placement!.widthRatio,
            })),
          );
          const composed = await composeExactBrandAssets(
            generatedBuffer,
            layers,
            dimensions,
          );
          await objectStorage.put(generatedOutputKey, composed, "image/png");
        });
      }

      const finalBuffer = (await step.run("load-final-buffer", async () => {
        return objectStorage.get(generatedOutputKey);
      })) as unknown as Buffer;

      const clientProfile = (await step.run("load-client-profile", async () => {
        return getClientProfile(workspaceId, work.clientProfileId);
      })) as unknown as { id: string; name: string } | null;

      const qualityResult = (await step.run("analyze-quality", async () => {
        try {
          return await analyzeDerivationCreative({
            imageBuffer: finalBuffer,
            mimeType: "image/png",
            // R5 mapping: brief fields → AnalyzeInput.campaign
            campaign: {
              name: work.brief.theme,
              client: clientProfile?.name ?? "",
              product: work.brief.theme,
              offer: work.brief.offer,
              objective: work.brief.objective,
              audience: work.brief.audience,
            },
            // R5 mapping: copy + format → AnalyzeInput.derivation
            derivation: {
              ctaText: copy.cta,
              format: targetFormat,
              generationMode: "art_variation",
              feedback: null,
              creativeLevel,
              creativeDiagnosis: null,
            },
            locale: "pt-BR",
            contract: null,
          });
        } catch (error) {
          // Quality analysis is best-effort: never fail the output for it
          // if the scorer itself crashes — but still persist `null` so the
          // UI can distinguish "not measured" from "scored below threshold".
          const message = error instanceof Error ? error.message : "Unknown error";
          logger.warn(
            `[creativeWorkOutputJob] analyzeDerivationCreative failed outputId=${outputId}: ${message}`,
          );
          return null;
        }
      })) as unknown as ScoreResult | null;

      // Apply the minimum-quality gate. The result is captured (not
      // discarded) and persisted on the output row so downstream consumers
      // can surface breakdown / issues / regeneration suggestions.
      if (
        qualityResult &&
        (qualityResult.scoreStatus === "failed" ||
          qualityResult.qualityScore < OUTPUT_MIN_QUALITY_SCORE)
      ) {
        await refundPreGeneratorOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: `low_quality score=${qualityResult.qualityScore}`,
        });
        await failCreativeWorkOutput(workspaceId, workItemId, outputId, "low_quality");
        logger.warn(
          `[creativeWorkOutputJob] low-quality outputId=${outputId} score=${qualityResult.qualityScore} threshold=${OUTPUT_MIN_QUALITY_SCORE}`,
        );
        return {
          success: false,
          outputId,
          failureCode: "low_quality",
        };
      }

      await step.run("mark-completed", async () => {
        await completeCreativeWorkOutput(workspaceId, workItemId, outputId, {
          outputKey: generatedOutputKey,
          cost: OUTPUT_COST,
          // Persist the score when the scorer succeeded; `null` when it
          // crashed (so the UI can tell "not measured" apart from "scored
          // and passed").
          quality: (qualityResult as unknown as Record<string, unknown> | null) ?? null,
        });
      });

      logger.info(
        `[creativeWorkOutputJob] DONE outputId=${outputId} outputKey=${generatedOutputKey}`,
      );
      return { success: true, outputId, outputKey: generatedOutputKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = sanitizeCreativeWorkFailureCode(message);
      logger.error(
        `[creativeWorkOutputJob] FAIL outputId=${outputId} code=${code} message=${message}`,
      );
      try {
        await step.run("mark-failed", async () => {
          await failCreativeWorkOutput(workspaceId, workItemId, outputId, code);
        });
      } catch (markError) {
        const detail =
          markError instanceof Error ? markError.message : "Unknown error";
        logger.error(
          `[creativeWorkOutputJob] mark-failed error outputId=${outputId}: ${detail}`,
        );
      }
      return { success: false, outputId, failureCode: code };
    } finally {
      try {
        await step.run("refresh-aggregate-status", async () => {
          await refreshCreativeWorkStatus(workspaceId, workItemId);
        });
      } catch (statusError) {
        const detail =
          statusError instanceof Error
            ? statusError.message
            : "Unknown error";
        logger.warn(
          `[creativeWorkOutputJob] refresh-status failed outputId=${outputId}: ${detail}`,
        );
      }
    }
  },
);

/**
 * Refund the per-output credit when a failure happens BEFORE the upstream
 * generator was invoked — prompt assembly or reference image load. The
 * idempotency key is per-output so retries don't double-refund.
 */
async function refundPreGeneratorOutput({
  workspaceId,
  workItemId,
  outputId,
  reason,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
}): Promise<void> {
  try {
    const result = await refundCredits({
      workspaceId,
      action: "image_derivation",
      idempotencyKey: `creative-work:${workItemId}:output:${outputId}:pregen-refund`,
      amount: OUTPUT_COST,
      metadata: {
        creativeWorkId: workItemId,
        outputId,
        reason,
        description: "creative_work_output_pregen_refund",
      },
    });
    logger.info(
      `[creativeWorkOutputJob] refundCredits pregen outputId=${outputId} status=${result.status} reason=${reason}`,
    );
  } catch (refundError) {
    const detail =
      refundError instanceof Error ? refundError.message : "Unknown error";
    logger.error(
      `[creativeWorkOutputJob] refundCredits pregen FAILED outputId=${outputId}: ${detail}`,
    );
  }
}