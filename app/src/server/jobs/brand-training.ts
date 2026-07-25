import { z } from "zod";
import OpenAI from "openai";

import { logger } from "@/lib/logger";
import {
  BRAND_TRAINING_CATEGORIES,
  BRAND_TRAINING_USAGE_MODES,
  brandTrainingAnalysisSchema,
} from "@/server/brand-training/contracts";
import {
  getTrainingReferenceForAnalysis,
  recordTrainingAnalysis,
} from "@/server/repositories/client-reference";
import { objectStorage } from "@/server/storage";
import { env } from "@/server/validation/env";
import { normalizeImageForAi } from "@/server/ai/normalize-image-for-ai";

import { inngest } from "./client";

interface BrandTrainingAnalyzeEvent {
  workspaceId: string;
  clientProfileId: string;
  referenceId: string;
  assetKey: string;
  mimeType: string;
  hasAlpha: boolean;
}

const proposalSchema = z.object({
  trainingCategory: z.enum(BRAND_TRAINING_CATEGORIES),
  usageMode: z.enum(BRAND_TRAINING_USAGE_MODES),
  analysis: brandTrainingAnalysisSchema,
});

const SYSTEM_PROMPT = `You are a brand training asset analyst for an advertising platform.

You are given an image uploaded by a brand trainer. Your job is to classify the image so it can condition creative generation.

Important constraints:
- Choose the best trainingCategory and usageMode for how this asset should condition generation.
- usageMode "exact" means the asset should be used verbatim. This is only valid for assets with a transparent background (alpha channel). For PNG/WEBP without alpha, prefer "reference" or "rule".
- usageMode "reference" means the asset conveys style/mood that should inspire new generated creatives.
- usageMode "rule" means the asset encodes a constraint that downstream generation must respect.

trainingCategory must be one of: ${BRAND_TRAINING_CATEGORIES.join(", ")}.
usageMode must be one of: ${BRAND_TRAINING_USAGE_MODES.join(", ")}.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "trainingCategory": "logo|graphic|character|visual_reference",
  "usageMode": "exact|reference|rule",
  "analysis": {
    "description": "1-3 sentence natural-language description of the asset",
    "visualAttributes": ["short style tags, up to 20 entries"],
    "rules": ["how downstream creatives should use this asset, up to 20 entries"],
    "constraints": ["what downstream creatives must NOT do, up to 20 entries"],
    "confidence": 0.0
  }
}`;

async function brandTrainingAnalyzeHandler({
  event,
  step,
}: {
  event: { data: BrandTrainingAnalyzeEvent };
  step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
}) {
    const data = event.data as BrandTrainingAnalyzeEvent;
    logger.info(
      `[brandTrainingAnalyzeJob] START referenceId=${data.referenceId} assetKey=${data.assetKey}`,
    );

    // Short-circuit when enrichment is unnecessary: analysis already exists,
    // or the row is outside enrichable states. Bail before any OpenAI call.
    const existingRow = await getTrainingReferenceForAnalysis(
      data.workspaceId,
      data.clientProfileId,
      data.referenceId,
    );
    if (!existingRow) {
      logger.warn(
        `[brandTrainingAnalyzeJob] SKIP reference not found referenceId=${data.referenceId}`,
      );
      return { success: false, reason: "reference_not_found", referenceId: data.referenceId };
    }
    const needsAnalysis =
      existingRow.reviewStatus === "pending_analysis" ||
      existingRow.reviewStatus === "pending_approval" ||
      (existingRow.reviewStatus === "approved" && !existingRow.trainingAnalysis);
    if (!needsAnalysis) {
      logger.info(
        `[brandTrainingAnalyzeJob] SKIP stale retry referenceId=${data.referenceId} reviewStatus=${existingRow.reviewStatus}`,
      );
      return {
        success: true,
        reason: "already_processed",
        referenceId: data.referenceId,
        reviewStatus: existingRow.reviewStatus,
      };
    }

    const model = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

    // Download + analyze in one step so image bytes never become Inngest step
    // output (large PNGs exceed the step output size limit and leave rows
    // stuck in pending_analysis).
    const proposal = await step.run("analyze-with-vision", async () => {
      const result = await objectStorage.get(data.assetKey);
      const raw = Buffer.isBuffer(result)
        ? result
        : Buffer.from((result as unknown as { data: number[] }).data);
      const normalized = await normalizeImageForAi({ buffer: raw, mimeType: data.mimeType });
      const dataUri = `data:${normalized.mimeType};base64,${normalized.buffer.toString("base64")}`;

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 0 });
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUri, detail: "high" },
              },
              {
                type: "text",
                text: `Propose a brand-training classification for this asset. The asset's alpha channel is ${
                  data.hasAlpha ? "present" : "absent"
                }. Return only the JSON object described in the system instructions.`,
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned empty content for brand training analysis");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(
          `Invalid JSON from OpenAI for brand training analysis: ${content.slice(0, 200)}`,
        );
      }

      return proposalSchema.parse(parsed);
    });

    await step.run("persist-proposal", async () => {
      // Auto-approve: recordTrainingAnalysis persists the proposal and marks
      // the asset approved so it conditions generation without a human gate.
      await recordTrainingAnalysis(
        {
          workspaceId: data.workspaceId,
          clientProfileId: data.clientProfileId,
          referenceId: data.referenceId,
        },
        {
          trainingCategory: proposal.trainingCategory,
          usageMode: proposal.usageMode,
          analysis: proposal.analysis,
        },
      );
    });

    logger.info(
      `[brandTrainingAnalyzeJob] COMPLETE referenceId=${data.referenceId} category=${proposal.trainingCategory} mode=${proposal.usageMode}`,
    );

    return {
      success: true,
      referenceId: data.referenceId,
      trainingCategory: proposal.trainingCategory,
      usageMode: proposal.usageMode,
      confidence: proposal.analysis.confidence,
    };
}

function buildBrandTrainingAnalyzeJob(
  client: typeof inngest,
  options: { id: string; eventName: string },
) {
  return client.createFunction(
    {
      id: options.id,
      retries: 2,
      onFailure: async ({ event, error }) => {
        const data = event.data.event.data as BrandTrainingAnalyzeEvent;
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `[brandTrainingAnalyzeJob] FAILED referenceId=${data.referenceId} error=${message}`,
        );
      },
      triggers: [{ event: options.eventName }],
    },
    brandTrainingAnalyzeHandler,
  );
}

export const brandTrainingAnalyzeJob = buildBrandTrainingAnalyzeJob(inngest, {
  id: "analyze-brand-training-asset",
  eventName: "brand.training.analyze",
});

export function createBrandTrainingAnalyzeJobV2(client: typeof inngest) {
  return buildBrandTrainingAnalyzeJob(client, {
    id: "analyze-brand-training-asset-v2",
    eventName: "brand.training.analyze.v2",
  });
}