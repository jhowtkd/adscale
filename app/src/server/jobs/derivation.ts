import { inngest } from "./client";
import { derivationChannel } from "./channels";
import { logger } from "@/lib/logger";
import { db } from "../db";
import { derivations } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  shouldSendToUser,
  getUserLocale,
  sendDerivationCompleteEmail,
} from "@/server/services/notifications";
import { objectStorage } from "@/server/storage";
import { buildDerivationPrompt } from "../ai/prompt-builder";
import {
  FACTUAL_SOURCE_RULES,
  resolveCreativeFidelityLevel,
  resolveCtaSemantics,
} from "../ai/creative-contract";
import {
  resolveCanonicalCreative,
  resolveCanonicalCreativePolicy,
} from "../ai/canonical-creative-contract";
import { resolveInputSourceClassification, assertParentFactualLineage } from "../ai/factual-visual-separation";
import type {
  CreativeContract,
  CreativeFidelityLevel,
  PromptProvenance,
  SourceDescriptor,
  SourcePackage,
} from "../ai/creative-contract";

import { getCampaignById } from "../repositories/campaign";
import { createNotification } from "../repositories/notification";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import {
  getDerivationById,
  updateDerivationGenerationLog,
  updateDerivationPromptProvenance,
} from "../repositories/derivation";
import {
  appendGenerationLogStep,
  createGenerationLog,
  finalizeGenerationLog,
  type DerivationGenerationLog,
} from "../ai/generation-log";
import { runDerivationAutoRetry, shouldAutoRetryDerivation } from "../ai/derivation-auto-retry";
import {
  emitDerivationAutoRetryOutcome,
  emitDerivationAutoRetryTriggered,
} from "../beta-analytics/derivation-auto-retry-telemetry";
import { buildHardFailureRegenerationSuggestion } from "../ai/creative-score";
import type { CreativeHardFailure } from "../ai/creative-quality-gate";
import {
  getCampaignMemoryPromptBlock,
  recordCampaignMemoryEntry,
} from "../memory/campaign-memory-context";
import { runCompletedDerivationQualityGate } from "../ai/creative-quality-gate";
import {
  getClientProfile,
  getClientReferencesByIdsForProfile,
} from "../repositories/client-reference";
import { getWorkspaceAssetByKey } from "../repositories/workspace-asset";
import { trackUsage } from "../repositories/usage";
import { getBrandKit } from "../repositories/brand-kit";
import { resolveCampaignClientProfileId } from "../repositories/client-reference";
import { getCompetitorAnalysesByCampaign } from "../repositories/competitor-analysis";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { env } from "../validation/env";
import { normalizeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { formatToOpenAIImageSize, getTargetDimensions, toOpenAISdkImageSize } from "@/lib/formats";
import { composeExactBrandAssets } from "@/server/creative-work/composite";
import { buildIdentityOptions, DEFAULT_EXACT_PLACEMENT } from "@/server/creative-work/identity";
import {
  buildGenerationPromptContext,
  executeGenerationStep,
  type BuildGenerationPromptContextInput,
  type GenerationReferenceInput,
} from "../ai/derivation-pipeline";
import { captureCorpusCandidateFromDerivation } from "../human-quality/candidate-capture";
import { loadPromptCalibrationContext } from "../brand-taste/prompt-calibration-loader";
import { getAssistantActionById } from "../repositories/assistant-action";
import { getAssistantThreadById } from "../repositories/assistant-thread";
import { emitArtifactIterationTelemetry } from "@/server/assistant/artifact-iteration-telemetry";
import { refundCredits } from "../billing/credits";
import {
  createArtifactVersion,
  getArtifactHead,
  getArtifactLineage,
  listArtifactVersions,
  updateArtifactHead,
} from "../repositories/artifact-version";
import { sanitizeDerivationFailureError } from "./derivation-error-sanitizer";
import * as Sentry from "@sentry/nextjs";
import { finalizeGoalDerivation } from "@/server/assistant/goal/finalize-derivation";
import { decideAutoRetry, decideDerivationRefund, decideJobIdempotency } from "@/server/generation/canonical/policies";
import {
  markDerivationCompleted,
  markDerivationFailed,
  markDerivationProcessing,
} from "@/server/generation/lifecycle/derivation-transitions";
import {
  runDerivationCorpusCapture,
  runDerivationQualityGate,
  runDerivationScore,
} from "@/server/generation/pipeline/post-generation";
import { scoreCompletedDerivation } from "@/server/generation/pipeline/score-derivation";

async function sendDerivationCompleteEmailBestEffort(
  input: Parameters<typeof sendDerivationCompleteEmail>[0]
): Promise<boolean> {
  try {
    await sendDerivationCompleteEmail(input);
    return true;
  } catch (error) {
    // Generation and persistence are already complete. Email is a secondary
    // channel and must not roll a usable derivation back to failed.
    logger.warn("[notify-completion] email delivery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

type CampaignAsset = Awaited<ReturnType<typeof getAssetsByCampaign>>[number];

function resolveRestylingBaseAsset(assets: CampaignAsset[]) {
  return (
    assets.find((asset) => asset.role === "base") ??
    assets.find((asset) => asset.role !== "style_reference") ??
    null
  );
}

function resolveRestylingStyleAsset(
  assets: CampaignAsset[],
  styleAssetId: string | null,
  baseAssetId: string | null
) {
  const isUsableStyleAsset = (asset: CampaignAsset) =>
    asset.id !== baseAssetId && asset.role === "style_reference";

  if (styleAssetId) {
    const selected = assets.find((asset) => asset.id === styleAssetId) ?? null;
    if (selected && isUsableStyleAsset(selected)) {
      return selected;
    }
  }

  return assets.find(isUsableStyleAsset) ?? null;
}

async function loadRestylingQaReferences(
  campaignId: string,
  workspaceId: string,
  contract: CreativeContract
) {
  if (contract.generationMode !== "restyling") return {};

  const assets = await getAssetsByCampaign(campaignId, workspaceId);
  const baseAsset = contract.baseAssetId
    ? assets.find((asset) => asset.id === contract.baseAssetId) ?? null
    : resolveRestylingBaseAsset(assets);
  const styleAsset = resolveRestylingStyleAsset(
    assets,
    contract.styleAssetId,
    baseAsset?.id ?? null
  );
  if (!baseAsset || !styleAsset) return {};

  const [baseImageBuffer, styleImageBuffer] = await Promise.all([
    objectStorage.get(baseAsset.key),
    objectStorage.get(styleAsset.key),
  ]);
  return {
    baseImageBuffer,
    baseMimeType: baseAsset.type ?? "image/png",
    styleImageBuffer,
    styleMimeType: styleAsset.type ?? "image/png",
  };
}

// Moved to ai/derivation-pipeline.ts (PR3, arch/refactor-2026-q3): pure image
// post-processing shared by the initial generation path and the auto-retry
// path. Re-exported here so existing importers of jobs/derivation.ts keep
// working unchanged.
export { normalizeGeneratedImage } from "@/server/ai/derivation-pipeline";

// scoreCompletedDerivation imported from generation/pipeline (Phase 3).
export { scoreCompletedDerivation };

export const derivationJob = inngest.createFunction(
  {
    id: "generate-derivation",
    retries: 2,
    concurrency: [
      // Account-scoped limits require a CEL key (virtual queue name).
      // Without it, Inngest rejects PUT /api/inngest and background jobs stall.
      { limit: 1, scope: "account", key: `"openai"` },
      { limit: 3, key: "event.data.workspaceId" },
    ],
    onFailure: async ({ event, error, step }) => {
      const originalEvent = event.data.event;
      const { derivationId, campaignId, workspaceId, triggeredByUserId, assistantActionId, generationMode, refundPolicy, goalRunId } = originalEvent.data;
      const { userMessage, technicalDetail } = sanitizeDerivationFailureError(error);
      const errorId = crypto.randomUUID();
      logger.error("[Inngest onFailure] derivation failed", {
        errorId,
        derivationId,
        workspaceId,
        campaignId,
        technicalDetail,
      });
      if (process.env.SENTRY_DSN) {
        Sentry.captureException(error, {
          tags: { component: "inngest", fn: "generate-derivation", errorId },
          extra: { derivationId, campaignId, workspaceId, assistantActionId, triggeredByUserId, technicalDetail },
        });
      }
      await step.run("mark-failed", async () => {
        await markDerivationFailed({
          derivationId,
          campaignId,
          workspaceId,
          userMessage,
          assistantActionId,
        });
        if (assistantActionId && goalRunId) {
          await finalizeGoalDerivation({
            workspaceId,
            actionId: assistantActionId,
            goalRunId,
            derivationId,
            generationMode,
            userId: triggeredByUserId,
            outcome: "failed",
          });
        }
      });
      // Canonical refund policy (Phase 3): job refunds only assistant
      // creative_revision when refundPolicy !== "none".
      const refundDecision = decideDerivationRefund({
        surface: assistantActionId ? "assistant" : "campaign",
        generationMode,
        refundPolicy,
        assistantActionId,
        failurePhase: "job_failure",
      });
      if (refundDecision.refund) {
        await step.run("refund-creative-revision", async () => {
          try {
            const result = await refundCredits({
              workspaceId,
              action: "image_derivation",
              idempotencyKey: refundDecision.idempotencyKey,
              amount: refundDecision.amount,
              metadata: {
                actionId: assistantActionId,
                derivationId,
                campaignId,
                mode: "creative_revision",
                reason: refundDecision.reason,
              },
              userId: triggeredByUserId,
            });
            logger.info(
              `[derivationJob onFailure] refundCredits ${result.status} assistantActionId=${assistantActionId} derivationId=${derivationId}`
            );
          } catch (refundErr) {
            logger.error(
              `[derivationJob onFailure] refundCredits FAILED assistantActionId=${assistantActionId} derivationId=${derivationId}`,
              refundErr
            );
          }
        });
        await step.run("emit-generation-failed-telemetry", async () => {
          const action = await getAssistantActionById(workspaceId, assistantActionId);
          if (!action) return;
          const thread = await getAssistantThreadById(workspaceId, action.threadId);
          if (!thread?.campaignId) return;
          emitArtifactIterationTelemetry({
            scope: {
              workspaceId,
              clientProfileId: thread.clientProfileId,
              campaignId: thread.campaignId,
              threadId: thread.id,
            },
            eventKey: "generation_failed",
            metadata: {
              artifactType: "creative",
              actionId: assistantActionId,
              reasonCode: "derivation_failed",
            },
          });
        });
      }
      await step.realtime.publish("status-failed", derivationChannel({ derivationId }).status, {
        derivationId,
        status: "failed",
        updatedAt: new Date().toISOString(),
      });
      if (triggeredByUserId) {
        await step.run("notify-failure", async () => {
          const campaign = await getCampaignById(campaignId, workspaceId);
          await createNotification({
            userId: triggeredByUserId,
            workspaceId,
            type: "derivation_failed",
            title: "Falha na geração",
            message: `A derivação da campanha "${campaign?.name ?? "Desconhecida"}" falhou.`,
            derivationId,
            campaignId,
          });
        });
      }
    },
    triggers: [{ event: "derivation.generate" }],
  },
  async ({ event, step }) => {
    const { derivationId, campaignId, workspaceId, triggeredByUserId, locale, generationMode, variantIndex, ctaText, format, isPreview, styleAssetId, assistantActionId, goalRunId } = event.data;
    logger.info(`[derivationJob] START derivationId=${derivationId} campaignId=${campaignId} locale=${locale ?? "default"}`);

    let generationLog: DerivationGenerationLog = createGenerationLog(campaignId, derivationId);
    await step.run("init-generation-log", async () => {
      await updateDerivationGenerationLog(derivationId, workspaceId, generationLog);
    });

    await inngest.realtime.publish(derivationChannel({ derivationId }).status, {
      derivationId,
      status: "queued",
      updatedAt: new Date().toISOString(),
    });

    // Idempotency check: if already completed, skip entirely
    const existing = await step.run("check-idempotency", async () => {
      const row = await db.select({ outputKey: derivations.outputKey, status: derivations.status })
        .from(derivations)
        .where(eq(derivations.id, derivationId))
        .limit(1);
      return row[0] ?? null;
    });
    const idempotency = decideJobIdempotency({
      surface: "campaign",
      hasOutputKey: Boolean(existing?.outputKey),
    });
    if (idempotency.skip && existing?.outputKey) {
      logger.info(`[derivationJob] SKIP derivationId=${derivationId} already has outputKey=${existing.outputKey} (${idempotency.reason})`);
      return { success: true, derivationId, outputKey: existing.outputKey, skipped: true };
    }

    // 1. Update status to processing
    await step.run("mark-processing", async () => {
      logger.info(`[mark-processing] derivationId=${derivationId}`);
      await markDerivationProcessing({
        derivationId,
        workspaceId,
        assistantActionId,
      });
    });
    await step.realtime.publish("status-processing", derivationChannel({ derivationId }).status, {
      derivationId,
      status: "processing",
      updatedAt: new Date().toISOString(),
    });

    // 2. Fetch derivation, campaign, plan, asset, brand kit, competitors
    const { campaign, plan, asset, derivation, parentDerivation, brandKit, competitorAnalyses, clientProfile } = await step.run(
      "fetch-context",
      async () => {
        logger.info(`[fetch-context] derivationId=${derivationId}`);
        const [derivation, campaign] = await Promise.all([
          getDerivationById(derivationId, workspaceId),
          getCampaignById(campaignId, workspaceId),
        ]);
        if (!derivation) {
          throw new Error("Derivation not found");
        }
        if (!campaign) {
          throw new Error("Campaign not found");
        }

        const [
          plan,
          assets,
          parentDerivation,
          clientProfile,
          brandKit,
          competitorAnalyses,
        ] = await Promise.all([
          getPlanByCampaign(campaignId, workspaceId),
          getAssetsByCampaign(campaignId, workspaceId),
          derivation.parentId ? getDerivationById(derivation.parentId, workspaceId) : Promise.resolve(null),
          campaign.clientProfileId
            ? getClientProfile(workspaceId, campaign.clientProfileId)
            : Promise.resolve(null),
          resolveCampaignClientProfileId(workspaceId, campaign).then(async (profileId) => {
            if (!profileId) return null;
            return getBrandKit(workspaceId, profileId);
          }),
          getCompetitorAnalysesByCampaign(campaignId, workspaceId),
        ]);
        const asset = assets[0];

        if (parentDerivation && parentDerivation.campaignId !== campaignId) {
          throw new Error("Parent derivation does not belong to this campaign");
        }

        logger.info(`[fetch-context] plan=${plan?.id ?? "none"} asset=${asset?.key ?? "none"} parent=${parentDerivation?.id ?? "none"} brandKit=${brandKit ? "yes" : "no"} competitors=${competitorAnalyses.length}`);
        return { derivation, campaign, plan, asset, parentDerivation, brandKit, competitorAnalyses, clientProfile };
      }
    );

    // 3. Fetch selected client references for prompt context
    const clientReferences = await step.run("fetch-client-references", async () => {
      const ids = campaign.selectedReferenceIds ?? [];
      const selected = ids.length > 0 && campaign.clientProfileId
        ? await getClientReferencesByIdsForProfile(workspaceId, campaign.clientProfileId, ids)
        : [];
      const recommendedOptions = campaign.clientProfileId
        ? await buildIdentityOptions(workspaceId, campaign.clientProfileId, {
            theme: campaign.product || campaign.name,
            objective: campaign.objective || campaign.name,
            audience: campaign.audience || "general audience",
            offer: campaign.offer || campaign.product || campaign.name,
          })
        : [];
      const recommendedIds = recommendedOptions.map((option) => option.referenceId);
      const approvedRows = campaign.clientProfileId
        ? await getClientReferencesByIdsForProfile(
            workspaceId,
            campaign.clientProfileId,
            recommendedIds,
          )
        : [];
      const approvedById = new Map(approvedRows.map((reference) => [reference.id, reference]));
      const approved = recommendedIds
        .map((referenceId) => approvedById.get(referenceId))
        .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
      const refs = Array.from(
        new Map([...selected, ...approved].map((reference) => [reference.id, reference])).values(),
      ).slice(0, 4);
      logger.info(`[fetch-client-references] loaded ${refs.length} references`);
      return refs.map((r) => ({
        id: r.id,
        kind: r.kind as "style" | "product" | "layout" | "logo" | "negative" | "other",
        label: r.label,
        notes: r.notes,
        assetKey: r.assetKey,
        trainingCategory: r.trainingCategory ?? null,
        usageMode: r.usageMode ?? null,
      }));
    });

    const effectiveGenerationMode = generationMode ?? derivation.generationMode ?? "art_variation";
    const targetFormat = format ?? derivation.format ?? "1:1";
    const effectiveCtaText = ctaText ?? derivation.ctaText ?? undefined;
    const usesParentOutputForPackage =
      effectiveGenerationMode === "format_adaptation" &&
      Boolean(derivation.parentId && parentDerivation?.outputKey);
    const packageSource: SourcePackage = usesParentOutputForPackage
      ? "approved_derivation"
      : "campaign_asset";

    const contract: CreativeContract = {
      generationMode: effectiveGenerationMode as CreativeContract["generationMode"],
      targetFormat,
      ctaSemantics: resolveCtaSemantics(effectiveCtaText ?? null, effectiveGenerationMode as CreativeContract["generationMode"]),
      baseAssetId: null,
      styleAssetId: (styleAssetId ?? (derivation as { styleAssetId?: string | null }).styleAssetId) ?? null,
      client: campaign?.client ?? null,
      product: campaign?.product ?? null,
      offer: campaign?.offer ?? null,
      constraints: null,
    };

    const [brandMemory, campaignMemoryBlock, calibrationContext] = await Promise.all([
      step.run("fetch-brand-memory", async () => {
        const context = await getBrandMemoryContext({
          workspaceId,
          clientProfileId: clientProfile?.id ?? campaign.clientProfileId ?? null,
          clientProfileName: clientProfile?.name ?? null,
          client: campaign.client,
          product: campaign.product,
          offer: campaign.offer,
          audience: campaign.audience,
          generationMode: effectiveGenerationMode,
          targetFormat,
          ctaText: effectiveCtaText ?? null,
        });
        logger.info(
          `[fetch-brand-memory] derivationId=${derivationId} items=${context.items.length} enabled=${context.items.length > 0 || process.env.MEM0_ENABLED === "true"}`
        );
        return context;
      }),
      step.run("fetch-campaign-memory", async () =>
        getCampaignMemoryPromptBlock(campaignId, workspaceId)
      ),
      step.run("load-prompt-calibration-context", async () => {
        return loadPromptCalibrationContext({
          workspaceId,
          clientProfileId: campaign.clientProfileId,
        });
      }),
    ]);

    // 4. Download, generate, and store inside one step to avoid persisting large blobs
    const generated = await step.run("generate-and-store-output", async () => {
      let referenceBuffer: Buffer | null = null;
      let referenceMimeType: string | null = null;

      const usesParentOutput =
        effectiveGenerationMode === "format_adaptation" &&
        derivation.parentId &&
        parentDerivation?.outputKey;

      const sourcePackage: SourcePackage = usesParentOutput
        ? "approved_derivation"
        : "campaign_asset";

      let sourceDescriptor: SourceDescriptor | null = null;
      if (usesParentOutput && parentDerivation?.outputKey) {
        sourceDescriptor = {
          kind: "approved_derivation",
          derivationId: parentDerivation.id,
          outputKey: parentDerivation.outputKey,
        };
      } else if (asset) {
        sourceDescriptor = {
          kind: "campaign_asset",
          assetId: asset.id,
          assetKey: asset.key,
          assetType: asset.type,
        };
      }

      let resolvedBaseAssetId: string | null = null;
      let resolvedStyleAssetId =
        (styleAssetId ?? (derivation as { styleAssetId?: string | null }).styleAssetId) ?? null;
      let restylingBaseAsset: CampaignAsset | null = null;
      let restylingStyleAsset: CampaignAsset | null = null;

      if (effectiveGenerationMode === "restyling") {
        const assets = await getAssetsByCampaign(campaignId, workspaceId);
        restylingBaseAsset = resolveRestylingBaseAsset(assets);
        restylingStyleAsset = resolveRestylingStyleAsset(
          assets,
          resolvedStyleAssetId,
          restylingBaseAsset?.id ?? null
        );

        if (!restylingBaseAsset || !restylingStyleAsset) {
          throw new Error("Restyling requires both a base asset and a style reference asset");
        }

        resolvedBaseAssetId = restylingBaseAsset.id;
        resolvedStyleAssetId = restylingStyleAsset.id;
      } else if (!usesParentOutput && asset) {
        resolvedBaseAssetId = asset.id;
      }
      const promptAsset =
        effectiveGenerationMode === "restyling" ? restylingBaseAsset : asset;
      if (effectiveGenerationMode === "restyling" && restylingBaseAsset) {
        sourceDescriptor = {
          kind: "campaign_asset",
          assetId: restylingBaseAsset.id,
          assetKey: restylingBaseAsset.key,
          assetType: restylingBaseAsset.type,
        };
      }

      const childStoredContract = derivation.creativeContract ?? null;

      const baseResolvedContract: CreativeContract = childStoredContract
        ? {
            ...childStoredContract,
            generationMode: effectiveGenerationMode as CreativeContract["generationMode"],
            targetFormat,
            ctaSemantics:
              ctaText !== undefined
                ? resolveCtaSemantics(
                    effectiveCtaText ?? null,
                    effectiveGenerationMode as CreativeContract["generationMode"]
                  )
                : childStoredContract.ctaSemantics,
            baseAssetId: resolvedBaseAssetId ?? childStoredContract.baseAssetId,
            styleAssetId: resolvedStyleAssetId ?? childStoredContract.styleAssetId,
            sourcePackage: childStoredContract.sourcePackage ?? sourcePackage,
            factualSourceRules:
              childStoredContract.factualSourceRules ?? FACTUAL_SOURCE_RULES,
          }
        : {
            generationMode: effectiveGenerationMode as CreativeContract["generationMode"],
            targetFormat,
            ctaSemantics: resolveCtaSemantics(
              effectiveCtaText ?? null,
              effectiveGenerationMode as CreativeContract["generationMode"]
            ),
            baseAssetId: resolvedBaseAssetId,
            styleAssetId: resolvedStyleAssetId,
            client: campaign?.client ?? null,
            product: campaign?.product ?? null,
            offer: campaign?.offer ?? null,
            constraints: null,
            sourcePackage,
            factualSourceRules: FACTUAL_SOURCE_RULES,
          };

      const diagnosis = normalizeCreativeDiagnosis(campaign.creativeDiagnosis);
      const canonicalCreative =
        childStoredContract?.canonicalCreative ??
        resolveCanonicalCreative(baseResolvedContract, campaign, diagnosis ?? undefined);

      const creativeLevel: CreativeFidelityLevel =
        childStoredContract?.creativeLevel ??
        resolveCreativeFidelityLevel(campaign.creativeLevel);

      const resolvedContract: CreativeContract = {
        ...baseResolvedContract,
        canonicalCreative,
        creativeLevel,
        policy: resolveCanonicalCreativePolicy(
          effectiveGenerationMode as CreativeContract["generationMode"],
          creativeLevel
        ),
        inputSourceClassification: resolveInputSourceClassification(
          { ...baseResolvedContract, canonicalCreative },
          {
            hasBrandKit: Boolean(brandKit),
            clientReferenceCount: clientReferences?.length ?? 0,
            packageSource: sourcePackage,
          }
        ),
      };

      if (usesParentOutput) {
        assertParentFactualLineage(
          parentDerivation
            ? {
                qualityVerdict: parentDerivation.qualityVerdict ?? null,
                hardFailures: Array.isArray(parentDerivation.hardFailures)
                  ? (parentDerivation.hardFailures as Array<{ code: string }>)
                  : null,
              }
            : null,
        );
      }

      if (usesParentOutput && parentDerivation?.outputKey) {
        logger.info(`[generate-and-store-output] downloading parent output key=${parentDerivation.outputKey}`);
        referenceBuffer = await objectStorage.get(parentDerivation.outputKey);
        referenceMimeType = "image/png";
        logger.info(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes from parent`);
      } else if (effectiveGenerationMode !== "restyling" && asset) {
        logger.info(`[generate-and-store-output] downloading asset key=${asset.key}`);
        referenceBuffer = await objectStorage.get(asset.key);
        referenceMimeType = asset.type;
        logger.info(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes`);
      }

      if (derivation.parentId && !parentDerivation?.outputKey && effectiveGenerationMode === "format_adaptation") {
        throw new Error("Parent derivation output is missing. Cannot perform package format adaptation without the approved winner image.");
      }

      const brandReferenceImages = (
        await Promise.all(
          clientReferences
            .filter((reference) => reference.usageMode === "reference")
            .map(async (reference) => {
              const assetRecord = await getWorkspaceAssetByKey(workspaceId, reference.assetKey);
              if (!assetRecord) return null;
              return {
                buffer: await objectStorage.get(reference.assetKey),
                mimeType: assetRecord.type,
                name: `brand-${reference.trainingCategory ?? reference.kind}-${reference.id}`,
              };
            }),
        )
      ).filter(
        (image): image is { buffer: Buffer; mimeType: string; name: string } => image !== null,
      );

      const promptContextInput = {
        campaign,
        plan,
        asset: promptAsset,
        feedback: derivation.feedback,
        locale,
        generationMode: effectiveGenerationMode as BuildGenerationPromptContextInput["generationMode"],
        variantIndex: variantIndex ?? derivation.variantIndex ?? 0,
        ctaText: effectiveCtaText,
        targetFormat,
        packageSource: sourcePackage,
        clientReferences,
        brandMemory,
        campaignMemoryBlock,
        contract: resolvedContract,
        brandKit: brandKit ?? undefined,
        competitorAnalyses,
        brandTasteSection: calibrationContext.brandTasteSection,
        corpusQualitySection: calibrationContext.corpusQualitySection,
      };

      const prompt = await buildDerivationPrompt(
        buildGenerationPromptContext(promptContextInput)
      );
      const openaiSize = toOpenAISdkImageSize(
        formatToOpenAIImageSize(targetFormat, {
          isPreview,
          modelName: env.OPENAI_IMAGE_MODEL,
        })
      );
      logger.info(`[generate-and-store-output] model=${env.OPENAI_IMAGE_MODEL} hasAsset=${!!asset} locale=${locale ?? "default"}`);

      await inngest.realtime.publish(derivationChannel({ derivationId }).status, {
        derivationId,
        status: "generating",
        updatedAt: new Date().toISOString(),
      });

      let promptProvenance: PromptProvenance = {
        schemaVersion: 1,
        inputPrompt: prompt,
        model: env.OPENAI_IMAGE_MODEL,
        requestedSize: openaiSize,
        sourcePackage,
        source: sourceDescriptor,
        clientProfileId: campaign.clientProfileId ?? null,
        brandReferenceIds: clientReferences.map((reference) => reference.id),
        generationMode: effectiveGenerationMode as PromptProvenance["generationMode"],
        targetFormat,
      };

      await updateDerivationPromptProvenance(derivationId, workspaceId, {
        creativeContract: resolvedContract,
        promptProvenance,
        inputPrompt: prompt,
      });

      let reference: GenerationReferenceInput;
      if (effectiveGenerationMode === "restyling") {
        const baseAsset = restylingBaseAsset!;
        const styleAsset = restylingStyleAsset!;
        const baseBuffer = await objectStorage.get(baseAsset.key);
        const styleBuffer = await objectStorage.get(styleAsset.key);
        reference = {
          kind: "restyling",
          baseBuffer,
          baseMimeType: baseAsset.type,
          styleBuffer,
          styleMimeType: styleAsset.type,
          brandImages: brandReferenceImages,
        };
      } else if (brandReferenceImages.length > 0) {
        const images = [
          ...(referenceBuffer && referenceMimeType
            ? [{ buffer: referenceBuffer, mimeType: referenceMimeType, name: "campaign-source" }]
            : []),
          ...brandReferenceImages,
        ].slice(0, 4);
        reference = { kind: "multi", images };
      } else if (referenceBuffer && referenceMimeType) {
        reference = {
          kind: "single",
          buffer: referenceBuffer,
          mimeType: referenceMimeType,
          allowGenerateFallback: effectiveGenerationMode === "format_adaptation",
        };
      } else {
        reference = { kind: "none" };
      }

      const stepResult = await executeGenerationStep({
        derivationId,
        workspaceId,
        promptContext: promptContextInput,
        reference,
        isPreview,
        authoredByUserId: triggeredByUserId ?? null,
        clientProfileId: campaign.clientProfileId ?? null,
        surface: assistantActionId ? "assistant" : "campaign",
      });

      const exactBrandReferences = clientReferences.filter(
        (brandReference) => brandReference.usageMode === "exact",
      );
      if (exactBrandReferences.length > 0) {
        const dimensions = getTargetDimensions(targetFormat) ?? { width: 1024, height: 1024 };
        const base = await objectStorage.get(stepResult.outputKey);
        const layers = await Promise.all(
          exactBrandReferences.map(async (brandReference) => ({
            buffer: await objectStorage.get(brandReference.assetKey),
            gravity:
              DEFAULT_EXACT_PLACEMENT[
                (brandReference.trainingCategory ?? "logo") as keyof typeof DEFAULT_EXACT_PLACEMENT
              ]?.gravity ?? "southeast",
            widthRatio:
              DEFAULT_EXACT_PLACEMENT[
                (brandReference.trainingCategory ?? "logo") as keyof typeof DEFAULT_EXACT_PLACEMENT
              ]?.widthRatio ?? 0.18,
          })),
        );
        const composed = await composeExactBrandAssets(base, layers, dimensions);
        await objectStorage.put(stepResult.outputKey, composed, "image/png");
      }


      const revisedPrompt = stepResult.revisedPrompt || derivation.prompt || "";

      logger.info(`[generate-and-store-output] upload success key=${stepResult.outputKey}`);

      promptProvenance = {
        ...promptProvenance,
        revisedPrompt,
        imageOperation: stepResult.imageOperation,
        outputKey: stepResult.outputKey,
      };

      await updateDerivationPromptProvenance(derivationId, workspaceId, {
        creativeContract: resolvedContract,
        promptProvenance,
        inputPrompt: stepResult.prompt,
        prompt: revisedPrompt,
      });

      return {
        outputKey: stepResult.outputKey,
        revisedPrompt,
        targetFormat,
        effectiveGenerationMode,
        resolvedContract,
        promptProvenance,
        candidates: stepResult.candidates,
      };
    });

    // 4. Update derivation as completed
    await step.run("mark-completed", async () => {
      logger.info(`[mark-completed] derivationId=${derivationId} outputKey=${generated.outputKey}`);
      await markDerivationCompleted({
        derivationId,
        campaignId,
        workspaceId,
        outputKey: generated.outputKey,
        prompt: generated.revisedPrompt,
        candidates: generated.candidates,
        assistantActionId,
        skipAssistantSync: Boolean(goalRunId),
      });
    });

    // 4a. Creative revision callback — create child creative version when
    // generation succeeded AND the user has not canceled the action while
    // it was running. Source creative remains current on cancel.
    if (assistantActionId && effectiveGenerationMode === "creative_revision") {
      await step.run("create-creative-version", async () => {
        const action = await getAssistantActionById(workspaceId, assistantActionId);
        if (!action) {
          logger.warn(
            `[derivationJob] creative_revision skipped — action ${assistantActionId} not found`
          );
          return;
        }
        if (action.status === "canceled" || action.status === "failed") {
          logger.info(
            `[derivationJob] creative_revision skipped — action ${assistantActionId} status=${action.status} (source remains current)`
          );
          return;
        }

        const input = action.inputSnapshot as {
          lineageId?: string;
          sourceVersionId?: string;
          planVersionId?: string;
        };
        if (!input?.lineageId || !input?.sourceVersionId || !input?.planVersionId) {
          logger.warn(
            `[derivationJob] creative_revision missing lineage/source/plan in inputSnapshot`,
            { assistantActionId }
          );
          return;
        }

        const thread = await getAssistantThreadById(workspaceId, action.threadId);
        if (!thread?.campaignId) {
          logger.warn(
            `[derivationJob] creative_revision skipped — thread ${action.threadId} has no campaign`
          );
          return;
        }
        const scope = {
          workspaceId,
          clientProfileId: thread.clientProfileId,
          campaignId: thread.campaignId,
          threadId: thread.id,
        };

        const lineage = await getArtifactLineage(scope, input.lineageId);
        if (!lineage || lineage.artifactType !== "creative") {
          logger.warn(
            `[derivationJob] creative_revision skipped — lineage ${input.lineageId} not creative`
          );
          return;
        }
        const head = await getArtifactHead(scope, input.lineageId);
        if (!head) {
          logger.warn(
            `[derivationJob] creative_revision skipped — no head for lineage ${input.lineageId}`
          );
          return;
        }

        const versions = await listArtifactVersions(scope, input.lineageId);
        const existing = versions.find((v) => {
          const provenance = v.provenance as { actionId?: string | null };
          return provenance?.actionId === assistantActionId;
        });
        if (existing) {
          logger.info(
            `[derivationJob] creative revision already exists for actionId=${assistantActionId}; skipping duplicate`
          );
          return;
        }

        const created = await createArtifactVersion({
          scope,
          lineageId: input.lineageId,
          sourceVersionId: input.sourceVersionId,
          status: "ready",
          snapshot: {
            type: "creative",
            derivationId,
            outputKey: generated.outputKey,
            format: generated.targetFormat,
            generationMode: generated.effectiveGenerationMode,
            ctaText: effectiveCtaText ?? null,
            planVersionId: input.planVersionId,
          },
          provenance: {
            origin: "revision",
            originalArtifactId: lineage.originalArtifactId,
            sourceVersionId: input.sourceVersionId,
            messageId: null,
            actionId: assistantActionId,
            planVersionId: input.planVersionId,
            format: generated.targetFormat,
            generationMode: generated.effectiveGenerationMode,
          },
        });

        await updateArtifactHead({
          scope,
          lineageId: input.lineageId,
          expectedRevision: head.revision,
          workingVersionId: created.id,
        });

        emitArtifactIterationTelemetry({
          scope,
          eventKey: "generation_succeeded",
          metadata: {
            artifactType: "creative",
            lineageId: input.lineageId,
            versionNumber: created.versionNumber,
            actionId: assistantActionId,
          },
        });

        logger.info(
          `[derivationJob] creative version ${created.id} created for lineage ${input.lineageId}`
        );
      });
    }
    await step.realtime.publish("status-completed", derivationChannel({ derivationId }).status, {
      derivationId,
      status: "completed",
      outputKey: generated.outputKey,
      updatedAt: new Date().toISOString(),
    });

    if (triggeredByUserId && !goalRunId) {
      await step.run("notify-completion-inapp", async () => {
        const stillExists = await getDerivationById(derivationId, workspaceId);
        if (!stillExists) {
          logger.warn(
            `[notify-completion-inapp] skipping deleted derivationId=${derivationId}`
          );
          return;
        }
        const campaign = await getCampaignById(campaignId, workspaceId);
        await createNotification({
          userId: triggeredByUserId,
          workspaceId,
          type: "derivation_completed",
          title: "Derivação pronta",
          message: `Uma derivação da campanha "${campaign?.name ?? "Desconhecida"}" foi gerada com sucesso.`,
          derivationId,
          campaignId,
        });
      });
    }

    // 4b. Send completion email if all derivations are done
    if (triggeredByUserId && !goalRunId) {
      await step.run("notify-completion-email", async () => {
        const active = await db
          .select({ id: derivations.id })
          .from(derivations)
          .where(
            and(
              eq(derivations.campaignId, campaignId),
              eq(derivations.workspaceId, workspaceId),
              sql`${derivations.status} IN ('queued', 'processing')`
            )
          )
          .limit(1);

        if (active.length === 0) {
          const { send, email } = await shouldSendToUser(triggeredByUserId);
          if (send && email) {
            const [completedCount, userLocale] = await Promise.all([
              db
                .select({ count: sql<number>`count(*)::int`.as("count") })
                .from(derivations)
                .where(
                  and(
                    eq(derivations.campaignId, campaignId),
                    eq(derivations.workspaceId, workspaceId),
                    eq(derivations.status, "completed")
                  )
                ),
              getUserLocale(triggeredByUserId),
            ]);
            const emailSent = await sendDerivationCompleteEmailBestEffort({
              to: email,
              campaignName: campaign.name,
              derivationCount: completedCount[0]?.count ?? 0,
              locale: userLocale,
            });
            if (emailSent) {
              logger.info(`[notify-completion] sent email to ${email} for campaign=${campaignId}`);
            }
          }
        }
      });
    }

    // 5. Score / quality / corpus via canonical post-generation helpers (Phase 3).
    // Inngest step names preserved for durability + characterization tests.
    await step.run("score-derivation", async () => {
      await runDerivationScore({
        derivationId,
        workspaceId,
        outputKey: generated.outputKey,
        campaign,
        derivation: {
          ctaText: ctaText ?? derivation.ctaText ?? null,
          format: generated.targetFormat,
          generationMode: generated.effectiveGenerationMode,
          feedback: derivation.feedback ?? null,
          parentId: derivation.parentId ?? null,
          creativeLevel: campaign.creativeLevel ?? null,
        },
        locale,
        contract: generated.resolvedContract,
      });
    });

    await step.run("quality-gate", async () => {
      await runDerivationQualityGate({
        derivationId,
        workspaceId,
        outputKey: generated.outputKey,
        locale,
        campaign,
        derivation: {
          ctaText: ctaText ?? derivation.ctaText ?? null,
          format: generated.targetFormat,
          generationMode: generated.effectiveGenerationMode,
        },
        contract: generated.resolvedContract,
        loadQaReferences: () =>
          loadRestylingQaReferences(
            campaignId,
            workspaceId,
            generated.resolvedContract
          ),
      });
    });

    if (!isPreview && !goalRunId) {
      await step.run("capture-corpus-candidate", async () => {
        // Capture-only: goal-agent requires consent before corpus promotion.
        await runDerivationCorpusCapture({
          workspaceId,
          derivationId,
          enabled: true,
        });
      });
    }

    // 5c. Auto-retry once when text/CTA hard failures are detected
    const retried = await step.run("auto-retry-on-text-failure", async () => {
      const row = await getDerivationById(derivationId, workspaceId);
      if (!row) return null;

      const hardFailures = Array.isArray(row.hardFailures)
        ? (row.hardFailures as CreativeHardFailure[])
        : [];
      const log = (row.generationLog as DerivationGenerationLog | null) ?? generationLog;
      const retryMode = generated.effectiveGenerationMode as
        | "art_variation"
        | "format_adaptation"
        | "restyling";
      const eligibleByPolicy = shouldAutoRetryDerivation(
        retryMode,
        hardFailures,
        log.autoRetryAttempted
      );
      const retryDecision = decideAutoRetry({
        surface: "campaign",
        mode: retryMode,
        eligibleByPolicy,
      });
      if (!retryDecision.retry) {
        return null;
      }

      const correctionFeedback =
        row.regenerationSuggestion ??
        buildHardFailureRegenerationSuggestion({
          hardFailures,
          contract: generated.resolvedContract,
          scoreIssues: Array.isArray(row.scoreIssues) ? (row.scoreIssues as string[]) : [],
          qaChecklist: (row.qaChecklist as Record<string, { note?: string }> | null) ?? {},
        });

      const preRetryFailureCodes = hardFailures.map((failure) => failure.code);

      if (triggeredByUserId) {
        emitDerivationAutoRetryTriggered(
          {
            workspaceId,
            userId: triggeredByUserId,
            campaignId,
            derivationId,
            generationMode: retryMode,
            targetFormat: generated.targetFormat,
            isPreview: isPreview ?? derivation.isPreview ?? false,
          },
          preRetryFailureCodes
        );
      }

      let referenceKey: string;
      let referenceMimeType: string;
      let styleReferenceKey: string | undefined;
      let styleReferenceMimeType: string | undefined;

      if (retryMode === "restyling") {
        const assets = await getAssetsByCampaign(campaignId, workspaceId);
        const baseAssetId = generated.resolvedContract.baseAssetId;
        const styleAssetId = generated.resolvedContract.styleAssetId;
        const baseAsset = baseAssetId
          ? (assets.find((a) => a.id === baseAssetId && a.role !== "style_reference") ??
            resolveRestylingBaseAsset(assets))
          : resolveRestylingBaseAsset(assets);
        const styleAsset = resolveRestylingStyleAsset(
          assets,
          styleAssetId ?? null,
          baseAsset?.id ?? null
        );

        if (!baseAsset || !styleAsset) {
          logger.warn(
            `[auto-retry] skipping restyling retry: missing base or style asset derivationId=${derivationId}`
          );
          return null;
        }

        referenceKey = baseAsset.key;
        referenceMimeType = baseAsset.type ?? "image/png";
        styleReferenceKey = styleAsset.key;
        styleReferenceMimeType = styleAsset.type ?? "image/png";
      } else {
        referenceKey =
          asset?.key ??
          (parentDerivation?.outputKey && effectiveGenerationMode === "format_adaptation"
            ? parentDerivation.outputKey
            : generated.outputKey);
        referenceMimeType = asset?.type ?? "image/png";
      }

      const result = await runDerivationAutoRetry({
        derivationId,
        workspaceId,
        campaignId,
        referenceKey,
        referenceMimeType,
        styleReferenceKey,
        styleReferenceMimeType,
        correctionFeedback,
        contract: generated.resolvedContract,
        targetFormat: generated.targetFormat,
        generationMode: retryMode,
        isPreview: isPreview ?? derivation.isPreview ?? false,
        promptContext: {
          campaign,
          plan,
          asset,
          feedback: correctionFeedback,
          locale,
          generationMode: effectiveGenerationMode as BuildGenerationPromptContextInput["generationMode"],
          variantIndex: variantIndex ?? derivation.variantIndex ?? 0,
          ctaText: effectiveCtaText,
          targetFormat,
          packageSource,
          clientReferences,
          brandMemory,
          campaignMemoryBlock,
          contract: generated.resolvedContract,
          brandKit: brandKit ?? undefined,
          competitorAnalyses,
          brandTasteSection: calibrationContext.brandTasteSection,
          corpusQualitySection: calibrationContext.corpusQualitySection,
        },
      });

      if (!result) return null;

      await db
        .update(derivations)
        .set({
          status: "completed",
          outputKey: result.outputKey,
          prompt: result.revisedPrompt,
          candidates: result.candidates,
          updatedAt: new Date(),
        })
        .where(eq(derivations.id, derivationId));

      generationLog = finalizeGenerationLog(
        appendGenerationLogStep(generationLog, {
          name: "auto-retry-on-text-failure",
          status: "completed",
          detail: correctionFeedback.slice(0, 240),
        }),
        {
          autoRetryAttempted: true,
          autoRetryReason: hardFailures.map((f) => f.code).join(","),
          appliedBrandRuleIds: calibrationContext.appliedBrandRuleIds,
          appliedCorpusRuleIds: calibrationContext.appliedCorpusRuleIds,
        }
      );
      await updateDerivationGenerationLog(derivationId, workspaceId, generationLog);

      await recordCampaignMemoryEntry(campaignId, workspaceId, {
        type: "text_rule",
        text: `Auto-retry applied for: ${hardFailures.map((f) => f.code).join(", ")}`,
        derivationId,
      });

      return {
        ...result,
        preRetryFailureCodes,
      };
    });

    let finalOutputKey = generated.outputKey;

    if (retried) {
      finalOutputKey = retried.outputKey;

      await step.run("score-derivation-after-retry", async () => {
        try {
          const scoreBuffer = await objectStorage.get(retried.outputKey);
          await scoreCompletedDerivation(
            derivationId,
            workspaceId,
            scoreBuffer,
            campaign,
            {
              ctaText: ctaText ?? derivation.ctaText ?? null,
              format: generated.targetFormat,
              generationMode: generated.effectiveGenerationMode,
              feedback: derivation.feedback ?? null,
              parentId: derivation.parentId ?? null,
              creativeLevel: campaign.creativeLevel ?? null,
            },
            locale,
            generated.resolvedContract
          );
        } catch (error) {
          logger.warn(`[score-derivation-after-retry] failed derivationId=${derivationId}`, error);
        }
      });

      await step.run("quality-gate-after-retry", async () => {
        await runDerivationQualityGate({
          derivationId,
          workspaceId,
          outputKey: retried.outputKey,
          locale,
          campaign,
          derivation: {
            ctaText: ctaText ?? derivation.ctaText ?? null,
            format: generated.targetFormat,
            generationMode: generated.effectiveGenerationMode,
          },
          contract: generated.resolvedContract,
          loadQaReferences: () =>
            loadRestylingQaReferences(
              campaignId,
              workspaceId,
              generated.resolvedContract
            ),
        });
      });

      if (triggeredByUserId) {
        await step.run("emit-auto-retry-analytics", async () => {
          const row = await getDerivationById(derivationId, workspaceId);
          if (!row) return;

          const postFailures = Array.isArray(row.hardFailures)
            ? (row.hardFailures as CreativeHardFailure[])
            : [];

          emitDerivationAutoRetryOutcome(
            {
              workspaceId,
              userId: triggeredByUserId,
              campaignId,
              derivationId,
              generationMode: generated.effectiveGenerationMode,
              targetFormat: generated.targetFormat,
              isPreview: isPreview ?? derivation.isPreview ?? false,
            },
            retried.preRetryFailureCodes,
            postFailures
          );
        });
      }
    }

    if (!isPreview && goalRunId) {
      await step.run("capture-goal-corpus-candidate", async () => {
        await captureCorpusCandidateFromDerivation({ workspaceId, derivationId });
      });
    }

    if (assistantActionId && goalRunId) {
      await step.run("finalize-goal-derivation", async () => {
        await finalizeGoalDerivation({
          workspaceId,
          actionId: assistantActionId,
          goalRunId,
          derivationId,
          generationMode: generated.effectiveGenerationMode,
          userId: triggeredByUserId,
        });
      });
    }

    // 6. Track usage
    await step.run("track-usage", async () => {
      await trackUsage(workspaceId, "derivation", 1, {
        derivationId,
        campaignId,
        model: env.OPENAI_IMAGE_MODEL,
      });
    });

    await step.run("finalize-generation-log", async () => {
      generationLog = finalizeGenerationLog(
        appendGenerationLogStep(generationLog, {
          name: "derivationJob",
          status: "completed",
          detail: finalOutputKey,
        }),
        {
          model: env.OPENAI_IMAGE_MODEL,
          imageOperation: generated.promptProvenance?.imageOperation ?? undefined,
          appliedBrandRuleIds: calibrationContext.appliedBrandRuleIds,
          appliedCorpusRuleIds: calibrationContext.appliedCorpusRuleIds,
        }
      );
      await updateDerivationGenerationLog(derivationId, workspaceId, generationLog);
    });

    logger.info(`[derivationJob] DONE derivationId=${derivationId} outputKey=${finalOutputKey}`);
    return { success: true, derivationId, outputKey: finalOutputKey };
  }
);
