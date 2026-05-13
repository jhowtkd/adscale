import { inngest } from "./client";
import { db } from "../db";
import { derivations } from "../db/schema";
import { eq } from "drizzle-orm";
import { uploadBuffer, downloadBuffer } from "../storage/r2";
import { buildDerivationPrompt } from "../ai/prompt-builder";

import { getCampaignById, refreshCampaignStatus } from "../repositories/campaign";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import { getDerivationById, updateDerivationScore } from "../repositories/derivation";
import { trackUsage } from "../repositories/usage";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { env } from "../validation/env";
import {
  scoreDerivationHeuristic,
  analyzeDerivationCreative,
} from "@/server/ai/creative-score";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function getTargetDimensions(format: string, isPreview?: boolean): { width: number; height: number } | null {
  if (isPreview) {
    switch (format) {
      case "1:1":
        return { width: 512, height: 512 };
      case "4:5":
        return { width: 512, height: 640 };
      case "9:16":
        return { width: 512, height: 768 };
      default:
        return null;
    }
  }

  switch (format) {
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "9:16":
      return { width: 1080, height: 1920 };
    default:
      return null;
  }
}

function formatToOpenAISize(format: string, isPreview?: boolean): "512x512" | "1024x1024" | "1024x1536" | "1536x1024" {
  if (isPreview) {
    return "512x512";
  }

  switch (format) {
    case "9:16":
    case "4:5":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

async function normalizeGeneratedImage(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  generationMode: "art_variation" | "format_adaptation" | "restyling",
) {
  const position = generationMode === "format_adaptation" ? "attention" : "centre";

  return sharp(buffer)
    .resize(dimensions.width, dimensions.height, {
      fit: "cover",
      position,
    })
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
  },
  derivation: {
    ctaText: string | null;
    format: string | null;
    generationMode: string | null;
    feedback: string | null;
    parentId: string | null;
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
        },
        locale: locale ?? "pt-BR",
      });
      await updateDerivationScore(derivationId, workspaceId, visualScore);
    } catch (error) {
      console.warn("[generate-and-store-output] creative visual scoring failed", error);
      await updateDerivationScore(derivationId, workspaceId, {
        ...heuristicScore,
        scoreStatus: "failed",
      });
    }
  } catch (error) {
    console.warn("[generate-and-store-output] creative scoring failed", error);
  }
}

export const derivationJob = inngest.createFunction(
  {
    id: "generate-derivation",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event;
      const { derivationId, campaignId, workspaceId } = originalEvent.data;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Inngest onFailure] derivationId=${derivationId} error=${message}`);
      await db
        .update(derivations)
        .set({
          status: "failed",
          prompt: message,
          updatedAt: new Date(),
        })
        .where(eq(derivations.id, derivationId));
      await refreshCampaignStatus(campaignId, workspaceId);
    },
  },
  { event: "derivation.generate" },
  async ({ event, step }) => {
    const { derivationId, campaignId, workspaceId, locale, generationMode, variantIndex, ctaText, format, isPreview } = event.data;
    console.log(`[derivationJob] START derivationId=${derivationId} campaignId=${campaignId} locale=${locale ?? "default"}`);

    // Idempotency check: if already completed, skip entirely
    const existing = await step.run("check-idempotency", async () => {
      const row = await db.select({ outputKey: derivations.outputKey, status: derivations.status })
        .from(derivations)
        .where(eq(derivations.id, derivationId))
        .limit(1);
      return row[0] ?? null;
    });
    if (existing?.outputKey) {
      console.log(`[derivationJob] SKIP derivationId=${derivationId} already has outputKey=${existing.outputKey}`);
      return { success: true, derivationId, outputKey: existing.outputKey, skipped: true };
    }

    // 1. Update status to processing
    await step.run("mark-processing", async () => {
      console.log(`[mark-processing] derivationId=${derivationId}`);
      await db
        .update(derivations)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(derivations.id, derivationId));
    });

    // 2. Fetch derivation, campaign, plan, asset
    const { campaign, plan, asset, derivation } = await step.run(
      "fetch-context",
      async () => {
        console.log(`[fetch-context] derivationId=${derivationId}`);
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

        console.log(`[fetch-context] plan=${plan?.id ?? "none"} asset=${asset?.key ?? "none"}`);
        return { derivation, campaign, plan, asset };
      }
    );

    // 3. Download, generate, and store inside one step to avoid persisting large blobs
    const generated = await step.run("generate-and-store-output", async () => {
      const effectiveGenerationMode = generationMode ?? derivation.generationMode ?? "art_variation";
      const targetFormat = format ?? derivation.format ?? "1:1";
      let referenceBuffer: Buffer | null = null;

      if (asset) {
        console.log(`[generate-and-store-output] downloading asset key=${asset.key}`);
        referenceBuffer = await downloadBuffer(asset.key);
        console.log(`[generate-and-store-output] downloaded ${referenceBuffer.length} bytes`);
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
      });
      console.log(`[generate-and-store-output] model=${env.OPENAI_IMAGE_MODEL} hasAsset=${!!asset} locale=${locale ?? "default"}`);

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
        console.log(`[generate-and-store-output] restyling edit success`);
        result = first;
      } else if (asset && referenceBuffer) {
        // Try edit mode first (works for art_variation and format_adaptation)
        const referenceImage = await toFile(referenceBuffer, "reference-image", {
          type: asset.type,
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
          console.log(`[generate-and-store-output] edit success mode=${effectiveGenerationMode} url=${first.url ? "yes" : "no"} b64=${first.b64_json ? "yes" : "no"}`);
          result = first;
        } catch (editErr) {
          // Fallback to generate for format_adaptation if edit fails
          if (effectiveGenerationMode === "format_adaptation") {
            console.warn(`[generate-and-store-output] edit failed for format_adaptation, falling back to generate:`, editErr);
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
            console.log(`[generate-and-store-output] fallback generate success`);
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
        console.log(`[generate-and-store-output] generate success (no asset)`);
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
      console.log(`[generate-and-store-output] uploading ${buffer.length} bytes to ${key}`);
      await uploadBuffer(key, buffer, "image/png");
      console.log(`[generate-and-store-output] upload success key=${key}`);

      return {
        outputKey: key,
        revisedPrompt: result.revised_prompt || derivation.prompt || "",
        targetFormat,
        effectiveGenerationMode,
      };
    });

    // 4. Update derivation as completed
    await step.run("mark-completed", async () => {
      console.log(`[mark-completed] derivationId=${derivationId} outputKey=${generated.outputKey}`);
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

    // 5. Score derivation (non-blocking; runs after completed)
    await step.run("score-derivation", async () => {
      console.log(`[score-derivation] derivationId=${derivationId} outputKey=${generated.outputKey}`);
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
          },
          locale
        );
        console.log(`[score-derivation] done derivationId=${derivationId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(`[score-derivation] failed derivationId=${derivationId}: ${message}`);
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

    console.log(`[derivationJob] DONE derivationId=${derivationId} outputKey=${generated.outputKey}`);
    return { success: true, derivationId, outputKey: generated.outputKey };
  }
);
