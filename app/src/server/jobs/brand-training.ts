import { z } from "zod";
import OpenAI from "openai";

import { logger } from "@/lib/logger";
import {
  BRAND_TRAINING_CATEGORIES,
  BRAND_TRAINING_USAGE_MODES,
  brandTrainingAnalysisSchema,
} from "@/server/brand-training/contracts";
import { recordTrainingAnalysis } from "@/server/repositories/client-reference";
import { objectStorage } from "@/server/storage";
import { env } from "@/server/validation/env";

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

You are given an image uploaded by a brand trainer. Your job is to PROPOSE a category and usage mode for that image so a human reviewer can decide whether to approve it.

Important constraints:
- The fields you return (trainingCategory, usageMode) are PROPOSALS only. You do NOT approve the asset. A human reviewer always makes the final approval decision.
- Never claim that the asset is "approved" or "ready to use" — only suggest how it COULD be used once a human approves it.
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

export const brandTrainingAnalyzeJob = inngest.createFunction(
  {
    id: "analyze-brand-training-asset",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as BrandTrainingAnalyzeEvent;
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[brandTrainingAnalyzeJob] FAILED referenceId=${data.referenceId} error=${message}`,
      );
    },
    triggers: [{ event: "brand.training.analyze" }],
  },
  async ({ event, step }) => {
    const data = event.data as BrandTrainingAnalyzeEvent;
    logger.info(
      `[brandTrainingAnalyzeJob] START referenceId=${data.referenceId} assetKey=${data.assetKey}`,
    );

    const imageBuffer = await step.run("download-asset", async () => {
      const result = await objectStorage.get(data.assetKey);
      return Buffer.isBuffer(result)
        ? result
        : Buffer.from((result as unknown as { data: number[] }).data);
    });

    const buffer = imageBuffer as unknown as Buffer;
    const base64Image = buffer.toString("base64");
    const dataUri = `data:${data.mimeType};base64,${base64Image}`;

    const model = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

    const proposal = await step.run("analyze-with-vision", async () => {
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
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
      // Critical invariant: AI analysis MUST NOT set reviewStatus to "approved".
      // The repository's recordTrainingAnalysis transitions pending_analysis ->
      // pending_approval. Approval is reserved for the authenticated human
      // review route (see PATCH /api/client-profiles/:id/training-assets/:referenceId).
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
  },
);