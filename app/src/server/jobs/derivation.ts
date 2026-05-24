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
import { uploadBuffer, downloadBuffer } from "../storage/r2";
import { buildDerivationPrompt } from "../ai/prompt-builder";

import { getCampaignById, refreshCampaignStatus } from "../repositories/campaign";
import { createNotification } from "../repositories/notification";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import { getDerivationById, updateDerivationScore } from "../repositories/derivation";
import { getClientReferencesByIds } from "../repositories/client-reference";
import { trackUsage } from "../repositories/usage";
import { getBrandKitByWorkspace } from "../db/repositories/brand-kit";
import { getCompetitorAnalysesByCampaign } from "../repositories/competitor-analysis";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { env } from "../validation/env";
import {
  scoreDerivationHeuristic,
  analyzeDerivationCreative,
} from "@/server/ai/creative-score";
import { normalizeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { getTargetDimensions, formatToOpenAISize } from "@/lib/formats";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000 });
const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

export async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: "art_variation" | "format_adaptation" | "restyling",
) {
  const backgroundPosition = generationMode === "format_adaptation" ? "attention" : "centre";

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

export async function scoreCompletedDerivation(
  derivationId: string,
  workspaceId: string,
  normalizedBuffer: Buffer,
  campaign: {
    name: string;
    client: string | null;
    product: string | null;
    offer: string | null;
    objective: string | null;
    audience: string | null;
    creativeLevel?: string | null;
    creativeDiagnosis?: unknown;
  },
  derivation: {
    ctaText: string | null;
    format: string | null;
    generationMode: string | null;
    feedback: string | null;
    parentId: string | null;
    creativeLevel?: string | null;
  },
  locale?: string
) {
  const effectiveGenerationMode = derivation.generationMode ?? "art_variation";
  const targetFormat = derivation.format ?? "1:1";

  try {
    const heuristicScore = scoreDerivationHeuristic({
      status: "completed",
      format: targetFormat,
      generationMode: effectiveGenerationMode,
      ctaText: derivation.ctaText,
      parentId: derivation.parentId,
    });
    await updateDerivationScore(derivationId, workspaceId, heuristicScore);

    try {
      const visualScore = await analyzeDerivationCreative({
        imageBuffer: normalizedBuffer,
        mimeType: "image/png",
        campaign: {
          name: campaign.name,
          client: campaign.client ?? "",
          product: campaign.product ?? "",
          offer: campaign.offer ?? "",
          objective: campaign.objective ?? "",
          audience: campaign.audience ?? "",
        },
        derivation: {
          ctaText: derivation.ctaText,
          format: targetFormat,
          generationMode: effectiveGenerationMode,
          feedback: derivation.feedback,
          creativeLevel: campaign.creativeLevel ?? null,
          creativeDiagnosis: campaign.creativeDiagnosis ?? null,
        },
        locale: locale ?? "pt-BR",
      });
      await updateDerivationScore(derivationId, workspaceId, visualScore);
    } catch (error) {
      logger.warn("[generate-and-store-output] creative visual scoring failed", error);
      await updateDerivationScore(derivationId, workspaceId, {
        ...heuristicScore,
        scoreStatus: "failed",
      });
    }
  } catch (error) {
    logger.warn("[generate-and-store-output] creative scoring failed", error);
  }
}

export const derivationJob = inngest.createFunction(
  {
    id: "generate-derivation",
    retries: 2,
    onFailure: async ({ event, error, step }) => {
      const originalEvent = event.data.event;
      const { derivationId, campaignId, workspaceId, triggeredByUserId } = originalEvent.data;
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[Inngest onFailure] derivationId=${derivationId} error=${message}`);
      await step.run("mark-failed", async () => {
        await db
          .update(derivations)
          .set({
            status: "failed",
            prompt: message,
            updatedAt: new Date(),
          })
          .where(eq(derivations.id, derivationId));
        await refreshCampaignStatus(campaignId, workspaceId);
      });
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
    const { derivationId, campaignId, workspaceId, triggeredByUserId, locale, generationMode, variantIndex, ctaText, format, isPreview } = event.data;
    logger.info(`[derivationJob] START derivationId=${derivationId} campaignId=${campaignId} locale=${locale ?? "default"}`);

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
    if (existing?.outputKey) {
      logger.info(`[derivationJob] SKIP derivationId=${derivationId} already has outputKey=${existing.outputKey}`);
      return { success: true, derivationId, outputKey: existing.outputKey, skipped: true };
    }

    // 1. Update status to processing
    await step.run("mark-processing", async () => {
      logger.info(`[mark-processing] derivationId=${derivationId}`);
      await db
        .update(derivations)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(derivations.id, derivationId));
    });
    await step.realtime.publish("status-processing", derivationChannel({ derivationId }).status, {
      derivationId,
      status: "processing",
      updatedAt: new Date().toISOString(),
    });

    // 2. Fetch derivation, campaign, plan, asset, brand kit, competitors
    const { campaign, plan, asset, derivation, parentDerivation, brandKit, competitorAnalyses } = await step.run(
      "fetch-context",
      async () => {
        logger.info(`[fetch-context] derivationId=${derivationId}`);
        const derivation = await getDerivationById(derivationId, workspaceId);
        if (!derivation) {
          throw new Error("Derivation not found");
        }

        const campaign = await getCampaignById(campaignId, workspaceId);
        if (!campaign) {
          throw new Error("Campaign not found");
        }

        const plan = await getPlanByCampaign(campaignId, workspaceId);
        const assets = await getAssetsByCampaign(campaignId, workspaceId);
        const asset = assets[0];

        let parentDerivation = null;
        if (derivation.parentId) {
          parentDerivation = await getDerivationById(derivation.parentId, workspaceId);
          if (parentDerivation && parentDerivation.campaignId !== campaignId) {
            throw new Error("Parent derivation does not belong to this campaign");
          }
        }

        const brandKit = await getBrandKitByWorkspace(workspaceId);
        const competitorAnalyses = await getCompetitorAnalysesByCampaign(campaignId, workspaceId);

        logger.info(`[fetch-context] plan=${plan?.id ?? "none"} asset=${asset?.key ?? "none"} parent=${parentDerivation?.id ?? "none"} brandKit=${brandKit ? "yes" : "no"} competitors=${competitorAnalyses.length}`);
        return { derivation, campaign, plan, asset, parentDerivation, brandKit, competitorAnalyses };
      }
    );

    // 3. Fetch selected client references for prompt context
    const clientReferences = await step.run("fetch-client-references", async () => {
      const ids = campaign.selectedReferenceIds ?? [];
      if (ids.length === 0) return [];
      const refs = await getClientReferencesByIds(workspaceId, ids);
      logger.info(`[fetch-client-references] loaded ${refs.length} references`);
      return refs.map((r) => ({
        id: r.id,
        kind: r.kind as "style" | "product" | "layout" | "logo" | "negative" | "other",
        label: r.label,
        notes: r.notes,
        assetKey: r.assetKey,
      }));
    });

    // 4. Download, generate, and store inside one step to avoid persisting large blobs
    const generated = await step.run("generate-and-store-output", async () => {
      const effectiveGenerationMode = generationMode ?? derivation.generationMode ?? "art_variation";
      const targetFormat = format ?? derivation.format ?? "1:1";
      let referenceBuffer: Buffer | null = null;
      let referenceMimeType: string | null = null;

      const usesParentOutput =
        effectiveGenerationMode === "format_adaptation" &&
        derivation.parentId &&
        parentDerivation?.outputKey;

      if (usesParentOutput && parentDerivation?.outputKey) {
        logger.info(`[generate-and-store-output] downloading parent output key=${parentDerivation.outputKey}`);
        referenceBuffer = await downloadBuffer(parentDerivation.outputKey);
        referenceMimeType = "image/png";
        logger.info(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes from parent`);
      } else if (asset) {
        logger.info(`[generate-and-store-output] downloading asset key=${asset.key}`);
        referenceBuffer = await downloadBuffer(asset.key);
        referenceMimeType = asset.type;
        logger.info(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes`);
      }

      if (derivation.parentId && !parentDerivation?.outputKey && effectiveGenerationMode === "format_adaptation") {
        throw new Error("Parent derivation output is missing. Cannot perform package format adaptation without the approved winner image.");
      }

      const prompt = buildDerivationPrompt({
        campaign,
        plan,
        asset,
        feedback: derivation.feedback,
        locale,
        generationMode: effectiveGenerationMode,
        variantIndex: variantIndex ?? derivation.variantIndex ?? 0,
        ctaText: ctaText ?? derivation.ctaText ?? undefined,
        targetFormat,
        creativeLevel: campaign.creativeLevel ?? "balanced",
        creativeDiagnosis: normalizeCreativeDiagnosis(campaign.creativeDiagnosis) ?? null,
        packageSource: usesParentOutput ? "approved_derivation" : "campaign_asset",
        clientReferences,
        brandKit: brandKit ? {
          name: brandKit.name,
          description: brandKit.description ?? undefined,
          visualNotes: brandKit.visualNotes ?? undefined,
          toneNotes: brandKit.toneNotes ?? undefined,
          constraints: brandKit.constraints ?? undefined,
          colors: Array.isArray(brandKit.brandColors) ? brandKit.brandColors as string[] : undefined,
          fonts: Array.isArray(brandKit.brandFonts) ? brandKit.brandFonts as string[] : undefined,
          logoAssetKey: brandKit.logoAssetKey ?? undefined,
          toneOfVoice: brandKit.toneOfVoice ?? undefined,
          prohibitedElements: brandKit.prohibitedElements ?? undefined,
          requiredElements: brandKit.requiredElements ?? undefined,
        } : null,
        competitorAnalyses: competitorAnalyses.map((a) => {
          const analysis = (a.analysis ?? {}) as Record<string, unknown>;
          const vp = analysis.visualPatterns as Record<string, unknown> | undefined;
          const msg = analysis.messaging as Record<string, unknown> | undefined;
          return {
            visualPatterns: {
              colors: Array.isArray(vp?.colors) ? vp.colors as string[] : undefined,
              composition: typeof vp?.composition === "string" ? vp.composition : undefined,
              typography: typeof vp?.typography === "string" ? vp.typography : undefined,
            },
            messaging: {
              headlineStyle: typeof msg?.headlineStyle === "string" ? msg.headlineStyle : undefined,
              ctaStyle: typeof msg?.ctaStyle === "string" ? msg.ctaStyle : undefined,
              offerType: typeof msg?.offerType === "string" ? msg.offerType : undefined,
            },
            strengths: Array.isArray(a.strengths) ? a.strengths as string[] : [],
            weaknesses: Array.isArray(a.weaknesses) ? a.weaknesses as string[] : [],
            differentiationOpportunities: Array.isArray(a.differentiators) ? a.differentiators as string[] : [],
          };
        }),
        preflightResult: asset?.metadata ? (asset.metadata as Record<string, unknown>).preflightResult as import("@/server/ai/preflight-analysis").PreflightResult | undefined : null,
      });
      logger.info(`[generate-and-store-output] model=${env.OPENAI_IMAGE_MODEL} hasAsset=${!!asset} locale=${locale ?? "default"}`);

      await step.realtime.publish("status-generating", derivationChannel({ derivationId }).status, {
        derivationId,
        status: "generating",
        updatedAt: new Date().toISOString(),
      });

      // Persist the built prompt before generation
      await db
        .update(derivations)
        .set({ inputPrompt: prompt, updatedAt: new Date() })
        .where(eq(derivations.id, derivationId));

      let result: OpenAI.Images.Image;

      const openaiSize = formatToOpenAISize(targetFormat, isPreview);

      if (effectiveGenerationMode === "restyling") {
        const assets = await getAssetsByCampaign(campaignId, workspaceId);
        const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
        const styleAsset = assets.find((a) => a.role === "style_reference") ?? assets[1];

        if (!baseAsset || !styleAsset) {
          throw new Error("Restyling requires both base and style_reference assets");
        }

        const baseBuffer = await downloadBuffer(baseAsset.key);
        const styleBuffer = await downloadBuffer(styleAsset.key);

        const baseFile = await toFile(baseBuffer, "base-image", { type: baseAsset.type });
        const styleFile = await toFile(styleBuffer, "style-reference", { type: styleAsset.type });

        const response = await withTimeout(
          openai.images.edit({
            model: env.OPENAI_IMAGE_MODEL,
            image: [baseFile, styleFile],
            prompt,
            n: 1,
            size: openaiSize,
          }),
          IMAGE_GENERATION_TIMEOUT_MS,
          "OpenAI image edit (restyling)"
        );

        const first = response.data?.[0];
        if (!first) {
          throw new Error("No image data returned from OpenAI");
        }
        logger.info(`[generate-and-store-output] restyling edit success`);
        result = first;
      } else if (referenceBuffer && referenceMimeType) {
        // Try edit mode first (works for art_variation and format_adaptation)
        const referenceImage = await toFile(referenceBuffer, "reference-image", {
          type: referenceMimeType,
        });

        try {
          const response = await withTimeout(
            openai.images.edit({
              model: env.OPENAI_IMAGE_MODEL,
              image: referenceImage,
              prompt,
              n: 1,
              size: openaiSize,
            }),
            IMAGE_GENERATION_TIMEOUT_MS,
            "OpenAI image edit"
          );
          const first = response.data?.[0];
          if (!first) {
            throw new Error("No image data returned from OpenAI");
          }
          logger.info(`[generate-and-store-output] edit success mode=${effectiveGenerationMode} url=${first.url ? "yes" : "no"} b64=${first.b64_json ? "yes" : "no"}`);
          result = first;
        } catch (editErr) {
          // Fallback to generate for format_adaptation if edit fails
          if (effectiveGenerationMode === "format_adaptation") {
            logger.warn(`[generate-and-store-output] edit failed for format_adaptation, falling back to generate:`, editErr);
            const response = await withTimeout(
              openai.images.generate({
                model: env.OPENAI_IMAGE_MODEL,
                prompt,
                n: 1,
                size: openaiSize,
              }),
              IMAGE_GENERATION_TIMEOUT_MS,
              "OpenAI image generation (fallback)"
            );
            const first = response.data?.[0];
            if (!first) {
              throw new Error("No image data returned from OpenAI fallback");
            }
            logger.info(`[generate-and-store-output] fallback generate success`);
            result = first;
          } else {
            throw editErr;
          }
        }
      } else {
        // No asset — generate from scratch
        const response = await withTimeout(
          openai.images.generate({
            model: env.OPENAI_IMAGE_MODEL,
            prompt,
            n: 1,
            size: openaiSize,
          }),
          IMAGE_GENERATION_TIMEOUT_MS,
          "OpenAI image generation"
        );
        const first = response.data?.[0];
        if (!first) {
          throw new Error("No image data returned from OpenAI");
        }
        logger.info(`[generate-and-store-output] generate success (no asset)`);
        result = first;
      }

      let buffer: Buffer;
      if (result.b64_json) {
        buffer = Buffer.from(result.b64_json, "base64");
      } else if (result.url) {
        const imageResponse = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to download generated image: ${imageResponse.status} ${imageResponse.statusText}`
          );
        }
        buffer = Buffer.from(await imageResponse.arrayBuffer());
      } else {
        throw new Error("No image data returned");
      }

      // Normalize output dimensions based on target format
      const dimensions = getTargetDimensions(targetFormat, isPreview);
      if (dimensions) {
        buffer = await normalizeGeneratedImage(buffer, dimensions, effectiveGenerationMode);
      }

      const key = `derivations/${derivationId}/${Date.now()}.png`;
      logger.info(`[generate-and-store-output] uploading ${buffer.length} bytes to ${key}`);
      await uploadBuffer(key, buffer, "image/png");
      logger.info(`[generate-and-store-output] upload success key=${key}`);

      return {
        outputKey: key,
        revisedPrompt: result.revised_prompt || derivation.prompt || "",
        targetFormat,
        effectiveGenerationMode,
      };
    });

    // 4. Update derivation as completed
    await step.run("mark-completed", async () => {
      logger.info(`[mark-completed] derivationId=${derivationId} outputKey=${generated.outputKey}`);
      await db
        .update(derivations)
        .set({
          status: "completed",
          outputKey: generated.outputKey,
          prompt: generated.revisedPrompt,
          updatedAt: new Date(),
        })
        .where(eq(derivations.id, derivationId));
      await refreshCampaignStatus(campaignId, workspaceId);
    });
    await step.realtime.publish("status-completed", derivationChannel({ derivationId }).status, {
      derivationId,
      status: "completed",
      outputKey: generated.outputKey,
      updatedAt: new Date().toISOString(),
    });

    if (triggeredByUserId) {
      await step.run("notify-completion", async () => {
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
    if (triggeredByUserId) {
      await step.run("notify-completion", async () => {
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
            const completedCount = await db
              .select({ count: sql<number>`count(*)::int`.as("count") })
              .from(derivations)
              .where(
                and(
                  eq(derivations.campaignId, campaignId),
                  eq(derivations.workspaceId, workspaceId),
                  eq(derivations.status, "completed")
                )
              );
            const userLocale = await getUserLocale(triggeredByUserId);
            await sendDerivationCompleteEmail({
              to: email,
              campaignName: campaign.name,
              derivationCount: completedCount[0]?.count ?? 0,
              locale: userLocale,
            });
            logger.info(`[notify-completion] sent email to ${email} for campaign=${campaignId}`);
          }
        }
      });
    }

    // 5. Score derivation (non-blocking; runs after completed)
    await step.run("score-derivation", async () => {
      logger.info(`[score-derivation] derivationId=${derivationId} outputKey=${generated.outputKey}`);
      try {
        const scoreBuffer = await downloadBuffer(generated.outputKey);
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
          locale
        );
        logger.info(`[score-derivation] done derivationId=${derivationId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.warn(`[score-derivation] failed derivationId=${derivationId}: ${message}`);
      }
    });

    // 6. Track usage
    await step.run("track-usage", async () => {
      await trackUsage(workspaceId, "derivation", 1, {
        derivationId,
        campaignId,
        model: env.OPENAI_IMAGE_MODEL,
      });
    });

    logger.info(`[derivationJob] DONE derivationId=${derivationId} outputKey=${generated.outputKey}`);
    return { success: true, derivationId, outputKey: generated.outputKey };
  }
);
