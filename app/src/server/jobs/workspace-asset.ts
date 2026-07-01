import { inngest } from "./client";
import { logger } from "@/lib/logger";
import { updateWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { env } from "@/server/validation/env";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });

interface AnalyzeAssetEvent {
  assetId: string;
  workspaceId: string;
  key: string;
}

export const workspaceAssetAnalyzeJob = inngest.createFunction(
  {
    id: "analyze-workspace-asset",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const { assetId } = event.data.event.data as AnalyzeAssetEvent;
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[workspaceAssetAnalyzeJob] FAILED assetId=${assetId} error=${message}`);
    },
    triggers: [{ event: "workspace.asset.analyze" }],
  },
  async ({ event, step }) => {
    const { assetId, workspaceId, key } = event.data as AnalyzeAssetEvent;
    logger.info(`[workspaceAssetAnalyzeJob] START assetId=${assetId}`);

    const imageBuffer = await step.run("download-image", async () => {
      return objectStorage.get(key);
    });

    const buffer = Buffer.isBuffer(imageBuffer)
      ? imageBuffer
      : Buffer.from((imageBuffer as { data: number[] }).data);
    const base64Image = buffer.toString("base64");
    const dataUri = `data:image/png;base64,${base64Image}`;

    const analysis = await step.run("analyze-with-vision", async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a creative asset analyzer for an advertising platform. Analyze the image and return ONLY a JSON object with no markdown formatting.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this creative asset and provide a structured analysis. Return ONLY valid JSON with this exact shape:
{
  "description": "Brief natural language description (1-2 sentences) of what the image shows",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "product|person|landscape|logo|text|other",
  "dominantColors": ["#hex1", "#hex2"],
  "hasText": boolean,
  "hasFaces": boolean,
  "brandSafe": boolean,
  "confidence": 0.0-1.0
}

Guidelines:
- tags: 3-8 descriptive tags (e.g., ["product", "blue", "summer", "lifestyle"])
- category: best single category
- dominantColors: up to 3 hex colors
- hasText: true if any text/typography is visible
- hasFaces: true if human faces are visible
- brandSafe: false if contains violence, adult content, or offensive material
- confidence: your confidence in this analysis (0-1)`,
              },
              {
                type: "image_url",
                image_url: { url: dataUri },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned empty content");

      try {
        return JSON.parse(content);
      } catch {
        throw new Error(`Invalid JSON from OpenAI: ${content.slice(0, 200)}`);
      }
    });

    await step.run("update-asset", async () => {
      await updateWorkspaceAsset(assetId, workspaceId, {
        aiDescription: analysis.description,
        tags: analysis.tags,
        metadata: {
          category: analysis.category,
          dominantColors: analysis.dominantColors,
          hasText: analysis.hasText,
          hasFaces: analysis.hasFaces,
          brandSafe: analysis.brandSafe,
          confidence: analysis.confidence,
          analyzedAt: new Date().toISOString(),
        },
      });
    });

    logger.info(`[workspaceAssetAnalyzeJob] COMPLETE assetId=${assetId} tags=${analysis.tags?.join(",")}`);

    return {
      success: true,
      assetId,
      tags: analysis.tags,
      description: analysis.description,
    };
  }
);
