import "server-only";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { generateAndStoreImage } from "@/server/ai/image-generation";
import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import { getClientProfile } from "@/server/repositories/client-reference";
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

      const prompt = buildSocialPostPrompt({
        format: targetFormat,
        copy,
        identitySnapshot,
        creativeLevel,
      });

      const referenceAssets = identitySnapshot.assets
        .filter((asset) => asset.usageMode === "reference")
        .slice(0, MAX_REFERENCE_IMAGES);

      const referenceImages = (await step.run("load-reference-images", async () => {
        const buffers = await Promise.all(
          referenceAssets.map(async (asset) => ({
            buffer: await objectStorage.get(asset.assetKey),
            mimeType: asset.mimeType,
            name: asset.label,
          })),
        );
        return buffers;
      })) as unknown as Array<{ buffer: Buffer; mimeType: string; name: string }>;

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

      await step.run("analyze-quality", async () => {
        try {
          await analyzeDerivationCreative({
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
          // Quality analysis is best-effort: never fail the output for it.
          const message = error instanceof Error ? error.message : "Unknown error";
          logger.warn(
            `[creativeWorkOutputJob] analyzeDerivationCreative failed outputId=${outputId}: ${message}`,
          );
        }
      });

      await step.run("mark-completed", async () => {
        await completeCreativeWorkOutput(workspaceId, workItemId, outputId, {
          outputKey: generatedOutputKey,
          cost: OUTPUT_COST,
          quality: null,
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