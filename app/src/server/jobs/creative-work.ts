import "server-only";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { isRetryableProviderError } from "@/server/ai/image-generation";
import { executeCanonicalGeneration } from "@/server/generation/pipeline/execute";
import { runCreativeWorkPostGeneration } from "@/server/generation/pipeline/post-generation";
import {
  GENERATION_CREDIT_COSTS,
  creativeWorkUnitBillingKey,
  type GenerationRequest,
  type RefundDecision,
} from "@/server/generation/canonical/types";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { refundCredits } from "@/server/billing/credits";
import {
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  completeCreativeWorkOutput,
  failCreativeWorkOutput,
  failQueuedCreativeWorkOutput,
  refreshCreativeWorkStatus,
  requeueCreativeWorkOutputOnce,
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
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { inngest } from "./client";
import {
  decideCreativeWorkRefund,
  decideJobIdempotency,
} from "@/server/generation/canonical/policies";

interface CreativeWorkGenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}

const OUTPUT_COST = GENERATION_CREDIT_COSTS.creativeWorkOutput;
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
    concurrency: [
      // ponytail: the production web instance has 512 MB; keep every OpenAI
      // image job account-wide serial until generation has a dedicated worker.
      { limit: 1, scope: "account", key: `"openai"` },
    ],
    onFailure: async ({ event, error, step }) => {
      const originalEvent = event.data.event;
      const { workspaceId, workItemId, outputId } = originalEvent.data as CreativeWorkGenerateEvent;
      const recovered = await step.run("recover-interrupted-output", async () => {
        const failed = await failCreativeWorkOutput(
          workspaceId,
          workItemId,
          outputId,
          "generation_interrupted",
        ) ?? await failQueuedCreativeWorkOutput(
          workspaceId,
          workItemId,
          outputId,
          "generation_interrupted",
        );
        if (failed) await refreshCreativeWorkStatus(workspaceId, workItemId);
        return Boolean(failed);
      });
      if (!recovered) return;

      await step.run("refund-interrupted-output", async () => {
        await applyRefundDecision({
          workspaceId,
          workItemId,
          outputId,
          reason: error instanceof Error ? error.message : String(error),
          decision: decideCreativeWorkRefund({
            surface: "quick_tool",
            failurePhase: "job_failure",
            workItemId,
            outputId,
          }),
        });
      });
      logger.error(
        `[creativeWorkOutputJob] INTERRUPTED outputId=${outputId} recovered=true`,
      );
    },
    triggers: [{ event: "creative-work.generate" }],
  },
  async ({ event, step }) => {
    const data = event.data as CreativeWorkGenerateEvent;
    const { workspaceId, workItemId, outputId } = data;
    logger.info(
      `[creativeWorkOutputJob] START workspaceId=${workspaceId} workItemId=${workItemId} outputId=${outputId}`,
    );

    try {
      const scopeRaw = (await step.run("load-scope", async () => {
        const result = await getCreativeWork(workspaceId, workItemId);
        if (!result) return null;
        const output = result.outputs.find((o) => o.id === outputId) ?? null;
        return {
          work: result.work,
          output,
          parentOutput: output?.parentOutputId
            ? result.outputs.find((candidate) => candidate.id === output.parentOutputId) ?? null
            : null,
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
        parentOutput: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
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
        !scopeRaw.work.brief ||
        !scopeRaw.work.identitySnapshot ||
        !scopeRaw.work.copy
      ) {
        logger.warn(
          `[creativeWorkOutputJob] SKIP missing scope workspaceId=${workspaceId} outputId=${outputId}`,
        );
        return { success: false, skipped: true, outputId };
      }

      const work = scopeRaw.work;
      const brief = work.brief;
      if (!brief) return { success: false, skipped: true, outputId };
      const output = scopeRaw.output;
      const creativeLevel = output.creativeLevel;
      const parentOutput = scopeRaw.parentOutput;
      const identitySnapshot = work.identitySnapshot as CreativeWorkIdentitySnapshot;
      const copy = work.copy as SocialPostCopy;

      // Idempotency: if a duplicate event arrives after the row already
      // completed, skip provider invocation entirely.
      const idempotency = decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: output.status,
      });
      if (idempotency.skip) {
        logger.info(
          `[creativeWorkOutputJob] SKIP duplicate event outputId=${outputId} status=completed (${idempotency.reason})`,
        );
        return { success: true, skipped: true, outputId, outputKey: output.outputKey };
      }

      const claimed = await step.run("mark-processing", async () =>
        Boolean(await markCreativeWorkOutputProcessing(workspaceId, workItemId, outputId))
      );
      if (!claimed) {
        return { success: true, skipped: true, outputId };
      }

      const targetFormat = output.targetFormat as SocialPostFormat;
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
          brief,
          copy,
          identitySnapshot,
          inputSnapshot: work.inputSnapshot ?? { request: work.request, settings: work.settings, sources: [] },
          revisionInstruction: output.revisionInstruction,
          creativeLevel,
        });

        const referenceAssets = identitySnapshot.assets
          .filter((asset) => asset.usageMode === "reference")
          .slice(0, MAX_REFERENCE_IMAGES);

        const sourceReferences = (work.inputSnapshot?.sources ?? [])
          .filter((source) => (
            work.toolKind === "restyle" || source.usage === "style" || source.usage === "both"
          ) && source.assetKey && source.mimeType)
          .map((source) => ({ assetKey: source.assetKey!, mimeType: source.mimeType!, label: `Source ${source.sourceId}` }));

        if (output.parentOutputId && (!parentOutput?.outputKey || parentOutput.status !== "completed")) {
          throw new Error("creative_work_revision_parent_missing");
        }
        const revisionAsset = output.revisionAssetId
          ? await getWorkspaceAssetById(output.revisionAssetId, workspaceId)
          : null;
        if (output.revisionAssetId && (!revisionAsset || !revisionAsset.type.startsWith("image/"))) {
          throw new Error("creative_work_revision_asset_missing");
        }
        const revisionReferences = [
          ...(parentOutput?.outputKey ? [{
            assetKey: parentOutput.outputKey,
            mimeType: "image/png",
            label: `Versão ${parentOutput.versionNumber}`,
          }] : []),
          ...(revisionAsset ? [{
            assetKey: revisionAsset.key,
            mimeType: revisionAsset.type,
            label: revisionAsset.name,
          }] : []),
        ];

        // Binary payloads cannot cross an Inngest step boundary. The durable
        // asset keys live in the identity snapshot; buffers stay local to this
        // invocation and are consumed immediately by the provider.
        const orderedReferences = work.toolKind === "restyle"
          ? [...revisionReferences, ...sourceReferences, ...referenceAssets]
          : [...revisionReferences, ...referenceAssets, ...sourceReferences];
        referenceImages = await Promise.all(
          orderedReferences.slice(0, MAX_REFERENCE_IMAGES).map(async (asset) => ({
            buffer: await objectStorage.get(asset.assetKey),
            mimeType: asset.mimeType,
            name: asset.label,
          })),
        );
      } catch (error) {
        await refundPreGeneratorOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: error instanceof Error ? error.message : String(error),
          failurePhase: "pre_provider",
        });
        throw error;
      }

      const generationRequest: GenerationRequest = {
        authorship: {
          workspaceId,
          userId: work.createdByUserId ?? null,
        },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: {
          mode: parentOutput ? "creative_revision" : "social_post",
          objective: brief.objective ?? null,
        },
        identity: {
          clientProfileId: work.clientProfileId,
          referenceImages,
          brandConstraints: null,
        },
        format: {
          targetFormat,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: parentOutput?.id ?? null,
          sourceVersionId: parentOutput?.id ?? null,
          lineageId: parentOutput ? `${workItemId}:${output.creativeLevel}:${output.targetFormat}` : null,
          packageSource: parentOutput ? "creative_work_output" : "creative_work_brief",
        },
        prompt: { text: prompt },
        cost: {
          chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey: parentOutput
            ? `creative-work:${workItemId}:revision:${outputId}`
            : creativeWorkUnitBillingKey(workItemId, outputId),
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "creative_work_output",
          id: outputId,
          storagePrefix: `creative-work/${outputId}`,
          workItemId,
        },
        attempt: output.retryCount,
      };

      const generated = await step.run("generate-base", async () => {
        // Same canonical executor as campaign/assistant (Gate 3 / item 25).
        const result = await executeCanonicalGeneration(generationRequest);
        return { outputKey: result.outputKey };
      });
      const generatedOutputKey = (generated as unknown as { outputKey: string }).outputKey;

      const exactAssets = identitySnapshot.assets.filter(
        (asset) => asset.usageMode === "exact" && asset.placement,
      );

      if (exactAssets.length > 0) {
        await step.run("compose-exact-layers", async () => {
          const [baseBuffer, layers] = await Promise.all([
            objectStorage.get(generatedOutputKey),
            Promise.all(exactAssets.map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              gravity: asset.placement!.gravity as BrandAssetGravity,
              widthRatio: asset.placement!.widthRatio,
            }))),
          ]);
          const composed = await composeExactBrandAssets(
            baseBuffer,
            layers,
            dimensions,
          );
          await objectStorage.put(generatedOutputKey, composed, "image/png");
        });
      }

      // Keep the image buffer out of step results; only its storage key is
      // durable/serializable across Inngest boundaries.
      const finalBuffer = await objectStorage.get(generatedOutputKey);

      const clientProfile = (await step.run("load-client-profile", async () => {
        return getClientProfile(workspaceId, work.clientProfileId);
      })) as unknown as { id: string; name: string } | null;

      const postGen = (await step.run("analyze-quality", async () => {
        return runCreativeWorkPostGeneration({
          workItemId,
          outputId,
          analyze: {
            imageBuffer: finalBuffer,
            mimeType: "image/png",
            // R5 mapping: brief fields → AnalyzeInput.campaign
            campaign: {
              name: brief.theme,
              client: clientProfile?.name ?? "",
              product: brief.theme,
              offer: brief.offer,
              objective: brief.objective,
              audience: brief.audience,
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
          },
        });
      })) as unknown as Awaited<ReturnType<typeof runCreativeWorkPostGeneration>>;

      if (postGen.decision === "reject_low_quality") {
        // Adapter applies shared post-gen refund decision — does not re-decide policy.
        await applyRefundDecision({
          workspaceId,
          workItemId,
          outputId,
          reason: postGen.reason,
          decision: postGen.refund,
        });
        await failCreativeWorkOutput(workspaceId, workItemId, outputId, "low_quality");
        logger.warn(
          `[creativeWorkOutputJob] low-quality outputId=${outputId} reason=${postGen.reason}`,
        );
        return {
          success: false,
          outputId,
          failureCode: "low_quality",
        };
      }

      const completed = await step.run("mark-completed", async () =>
        Boolean(await completeCreativeWorkOutput(workspaceId, workItemId, outputId, {
          outputKey: generatedOutputKey,
          cost: OUTPUT_COST,
          quality: (postGen.quality as unknown as Record<string, unknown> | null) ?? null,
        }))
      );
      if (!completed) return { success: true, skipped: true, outputId };

      // Phase 5 / item 37: library on complete (not only on select).
      // Isolated from generation success: a library/storage failure must never
      // reclassify a completed output as failed (retries: 0).
      try {
        await step.run("ensure-library", async () => {
          await ensureCreativeWorkOutputInLibrary({
            workspaceId,
            outputKey: generatedOutputKey,
            theme: brief.theme,
            creativeLevel,
          });
        });
      } catch (libraryError) {
        const detail =
          libraryError instanceof Error ? libraryError.message : String(libraryError);
        logger.warn(
          `[creativeWorkOutputJob] ensure-library failed outputId=${outputId} (output stays completed): ${detail}`,
        );
      }

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
      if (isRetryableProviderError(error)) {
        try {
          const retried = await requeueCreativeWorkOutputOnce(workspaceId, workItemId, outputId);
          if (retried) {
            try {
              await inngest.send({ name: "creative-work.generate", data: { workspaceId, workItemId, outputId } });
              return { success: false, retrying: true, outputId, failureCode: code };
            } catch (dispatchError) {
              await failQueuedCreativeWorkOutput(workspaceId, workItemId, outputId, "auto_retry_dispatch_failed");
              logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, dispatchError);
              return { success: false, outputId, failureCode: "auto_retry_dispatch_failed" };
            }
          }
        } catch (retryError) {
          logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, retryError);
        }
      }
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
 * Apply a shared RefundDecision (from policies / post-gen). Adapter-only:
 * does not re-decide policy.
 */
async function applyRefundDecision({
  workspaceId,
  workItemId,
  outputId,
  reason,
  decision,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  decision: RefundDecision;
}): Promise<void> {
  if (!decision.refund) {
    logger.info(
      `[creativeWorkOutputJob] skip refund outputId=${outputId} reason=${decision.reason}`,
    );
    return;
  }
  try {
    const result = await refundCredits({
      workspaceId,
      action: "image_derivation",
      idempotencyKey: decision.idempotencyKey,
      amount: decision.amount,
      metadata: {
        creativeWorkId: workItemId,
        outputId,
        reason,
        policyReason: decision.reason,
        description: "creative_work_output_refund",
      },
    });
    logger.info(
      `[creativeWorkOutputJob] refundCredits outputId=${outputId} status=${result.status} reason=${reason}`,
    );
  } catch (refundError) {
    const detail =
      refundError instanceof Error ? refundError.message : "Unknown error";
    logger.error(
      `[creativeWorkOutputJob] refundCredits FAILED outputId=${outputId}: ${detail}`,
    );
  }
}

/**
 * Refund the per-output credit when a failure happens BEFORE the upstream
 * generator was invoked — prompt assembly or reference image load. Policy
 * decision comes from decideCreativeWorkRefund; this only applies it.
 */
async function refundPreGeneratorOutput({
  workspaceId,
  workItemId,
  outputId,
  reason,
  failurePhase,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  failurePhase: "pre_provider" | "low_quality";
}): Promise<void> {
  const decision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase,
    workItemId,
    outputId,
  });
  await applyRefundDecision({
    workspaceId,
    workItemId,
    outputId,
    reason,
    decision,
  });
}
