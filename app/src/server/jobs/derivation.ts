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
      console.error(`[Inngest onFailure] derivationId=${derivationId} error=${message}`);
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
    console.log(`[derivationJob] START derivationId=${derivationId} campaignId=${campaignId}`);

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
    const { plan, asset, derivation } = await step.run(
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

    // 3. Download input image (if asset exists)
    const assetData = asset
      ? await step.run("download-asset", async () => {
          console.log(`[download-asset] key=${asset.key}`);
          const buffer = await downloadBuffer(asset.key);
          console.log(`[download-asset] downloaded ${buffer.length} bytes`);
          return {
            buffer: Buffer.from(buffer).toString("base64"),
            type: asset.type,
          };
        })
      : undefined;

    // 4. Call OpenAI image model with reference image
    const result = await step.run("generate-image", async () => {
      const prompt = buildDerivationPrompt(plan, asset, derivation.feedback);
      console.log(`[generate-image] model=${env.OPENAI_IMAGE_MODEL} hasAsset=${!!assetData}`);

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
        console.log(`[generate-image] edit success url=${first.url ? "yes" : "no"} b64=${first.b64_json ? "yes" : "no"}`);
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
      console.log(`[generate-image] generate success url=${first.url ? "yes" : "no"} b64=${first.b64_json ? "yes" : "no"}`);
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
      console.log(`[store-output] uploading ${buffer.length} bytes to ${key}`);
      await uploadBuffer(key, buffer, "image/png");
      console.log(`[store-output] upload success key=${key}`);
      return key;
    });

    // 6. Update derivation as completed
    await step.run("mark-completed", async () => {
      console.log(`[mark-completed] derivationId=${derivationId} outputKey=${outputKey}`);
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

    console.log(`[derivationJob] DONE derivationId=${derivationId} outputKey=${outputKey}`);
    return { success: true, derivationId, outputKey };
  }
);
