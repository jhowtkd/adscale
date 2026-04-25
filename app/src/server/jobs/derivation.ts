import { inngest } from "./client";
import { db } from "../db";
import { derivations } from "../db/schema";
import { eq } from "drizzle-orm";
import { uploadBuffer, downloadBuffer } from "../storage/r2";
import { buildDerivationPrompt } from "../ai/prompt-builder";
import { getCampaignById } from "../repositories/campaign";
import { getAssetsByCampaign } from "../repositories/asset";
import { getPlanByCampaign } from "../repositories/plan";
import { getDerivationById } from "../repositories/derivation";
import { trackUsage } from "../repositories/usage";
import OpenAI from "openai";
import { env } from "../validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function bufferToBase64DataUri(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export const derivationJob = inngest.createFunction(
  { id: "generate-derivation", retries: 2 },
  { event: "derivation.generate" },
  async ({ event, step }) => {
    const { derivationId, campaignId, workspaceId } = event.data;

    try {
      // 1. Update status to processing
      await step.run("mark-processing", async () => {
        await db
          .update(derivations)
          .set({ status: "processing" })
          .where(eq(derivations.id, derivationId));
      });

      // 2. Fetch derivation, campaign, plan, asset
      const { plan, asset, derivation } = await step.run(
        "fetch-context",
        async () => {
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

          return { derivation, campaign, plan, asset };
        }
      );

      // 3. Download input image (if asset exists)
      let referenceImage: string | undefined;
      if (asset) {
        await step.run("download-asset", async () => {
          const buffer = await downloadBuffer(asset.key);
          referenceImage = bufferToBase64DataUri(buffer, asset.type);
          return { assetKey: asset.key, size: buffer.length };
        });
      }

      // 4. Call OpenAI image model with reference image
      const result = await step.run("generate-image", async () => {
        const prompt = buildDerivationPrompt(plan, asset, derivation.feedback);

        const request: OpenAI.Images.ImageGenerateParams = {
          model: env.OPENAI_IMAGE_MODEL,
          prompt,
          n: 1,
          size: "1024x1024",
        };

        // Include reference image if available
        if (referenceImage) {
          (request as unknown as Record<string, unknown>).image = [referenceImage];
        }

        const response = await openai.images.generate(request);
        const first = response.data?.[0];
        if (!first) {
          throw new Error("No image data returned from OpenAI");
        }
        return first;
      });

      // 5. Upload output to R2
      const outputKey = await step.run("store-output", async () => {
        if (!result.url) {
          throw new Error("No image URL returned");
        }
        const imageResponse = await fetch(result.url);
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to download generated image: ${imageResponse.status} ${imageResponse.statusText}`
          );
        }
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const key = `derivations/${derivationId}/${Date.now()}.png`;
        await uploadBuffer(key, buffer, "image/png");
        return key;
      });

      // 6. Update derivation as completed
      await step.run("mark-completed", async () => {
        await db
          .update(derivations)
          .set({
            status: "completed",
            outputKey,
            prompt: result.revised_prompt || derivation.prompt || "",
            updatedAt: new Date(),
          })
          .where(eq(derivations.id, derivationId));
      });

      // 7. Track usage
      await step.run("track-usage", async () => {
        await trackUsage(workspaceId, "derivation", 1, {
          derivationId,
          campaignId,
          model: env.OPENAI_IMAGE_MODEL,
        });
      });

      return { success: true, derivationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await step.run("mark-failed", async () => {
        await db
          .update(derivations)
          .set({
            status: "failed",
            prompt: message,
            updatedAt: new Date(),
          })
          .where(eq(derivations.id, derivationId));
      });
      return { success: false, derivationId, error: message };
    }
  }
);
