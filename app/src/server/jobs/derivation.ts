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
import OpenAI, { toFile } from "openai";
import { env } from "../validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const derivationJob = inngest.createFunction(
  {
    id: "generate-derivation",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event;
      const { derivationId } = originalEvent.data;
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .update(derivations)
        .set({
          status: "failed",
          prompt: message,
          updatedAt: new Date(),
        })
        .where(eq(derivations.id, derivationId));
    },
  },
  { event: "derivation.generate" },
  async ({ event, step }) => {
    const { derivationId, campaignId, workspaceId } = event.data;

    // 1. Update status to processing
    await step.run("mark-processing", async () => {
      await db
        .update(derivations)
        .set({ status: "processing", updatedAt: new Date() })
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
    const assetData = asset
      ? await step.run("download-asset", async () => {
          const buffer = await downloadBuffer(asset.key);
          return {
            buffer: Buffer.from(buffer).toString("base64"),
            type: asset.type,
          };
        })
      : undefined;

    // 4. Call OpenAI image model with reference image
    const result = await step.run("generate-image", async () => {
      const prompt = buildDerivationPrompt(plan, asset, derivation.feedback);

      if (assetData) {
        const buffer = Buffer.from(assetData.buffer, "base64");
        const referenceImage = await toFile(buffer, "reference-image", {
          type: assetData.type,
        });
        const response = await openai.images.edit({
          model: env.OPENAI_IMAGE_MODEL,
          image: referenceImage,
          prompt,
          n: 1,
          size: "1024x1024",
        });
        const first = response.data?.[0];
        if (!first) {
          throw new Error("No image data returned from OpenAI");
        }
        return first;
      }

      const response = await openai.images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
      });
      const first = response.data?.[0];
      if (!first) {
        throw new Error("No image data returned from OpenAI");
      }
      return first;
    });

    // 5. Upload output to R2
    const outputKey = await step.run("store-output", async () => {
      let buffer: Buffer;
      if (result.b64_json) {
        buffer = Buffer.from(result.b64_json, "base64");
      } else if (result.url) {
        const imageResponse = await fetch(result.url);
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to download generated image: ${imageResponse.status} ${imageResponse.statusText}`
          );
        }
        buffer = Buffer.from(await imageResponse.arrayBuffer());
      } else {
        throw new Error("No image data returned");
      }
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
  }
);
