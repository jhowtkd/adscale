import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createCampaign, deleteCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { createDerivation } from "@/server/repositories/derivation";
import { uploadBuffer, deleteObject } from "@/server/storage/r2";
import { inngest } from "@/server/jobs/client";
import { getUserLocale } from "@/server/repositories/user";
import { parseStyleIntensity } from "@/lib/style-intensity";
import { spendCreditsOrApiError } from "@/server/billing/gates";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const [locale, formData] = await Promise.all([
      getUserLocale(user.id),
      request.formData(),
    ]);

    // Extract form fields
    const name = formData.get("name");
    const client = formData.get("client");
    const offer = formData.get("offer");
    const ctaText = formData.get("ctaText");
    const notes = formData.get("notes");
    const styleIntensityRaw = formData.get("styleIntensity");
    const baseImage = formData.get("baseImage");
    const styleImage = formData.get("styleImage");

    // Validate required fields
    if (typeof name !== "string" || !name.trim()) {
      return apiError("invalidInput", 400, { message: "Name is required" });
    }
    if (!(baseImage instanceof File)) {
      return apiError("invalidInput", 400, { message: "Base image is required" });
    }
    if (!(styleImage instanceof File)) {
      return apiError("invalidInput", 400, { message: "Style image is required" });
    }

    // Validate file types
    if (!isAllowedImageType(baseImage.type)) {
      return apiError("invalidFileType", 400, { message: "Base image must be PNG, JPEG, or WebP" });
    }
    if (!isAllowedImageType(styleImage.type)) {
      return apiError("invalidFileType", 400, { message: "Style image must be PNG, JPEG, or WebP" });
    }

    // Validate magic bytes
    const [baseMagicValid, styleMagicValid] = await Promise.all([
      validateImageMagicBytes(baseImage, baseImage.type),
      validateImageMagicBytes(styleImage, styleImage.type),
    ]);

    if (!baseMagicValid) {
      return apiError("invalidFileType", 400, { message: "Base image failed magic bytes validation" });
    }
    if (!styleMagicValid) {
      return apiError("invalidFileType", 400, { message: "Style image failed magic bytes validation" });
    }

    // Validate file sizes
    if (baseImage.size <= 0 || baseImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }
    if (styleImage.size <= 0 || styleImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    // Parse and validate style intensity
    const styleIntensity = parseStyleIntensity(styleIntensityRaw);

    if (!styleIntensity) {
      return apiError("invalidInput", 400, { message: "Invalid style intensity" });
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "restyling",
      idempotencyKey: [
        "restyling",
        workspace.id,
        name.trim(),
        baseImage.name,
        baseImage.size,
        styleImage.name,
        styleImage.size,
        typeof ctaText === "string" ? ctaText.trim() : "",
      ].join(":"),
      metadata: { tool: "restyling" },
    });
    if (creditError) return creditError;

    // Create campaign with restyling mode
    const campaign = await createCampaign(workspace.id, {
      name: name.trim(),
      client: typeof client === "string" ? client.trim() : undefined,
      offer: typeof offer === "string" ? offer.trim() : undefined,
      notes: typeof notes === "string" ? notes.trim() : undefined,
      generationMode: "restyling",
      creativeLevel: "balanced",
      styleIntensity: styleIntensity as "soft" | "medium" | "strong",
      status: "draft",
    });

    // Upload base image
    const baseKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-base.${baseImage.type.split("/")[1] ?? "bin"}`;
    const styleKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-style.${styleImage.type.split("/")[1] ?? "bin"}`;
    const [baseBuffer, styleBuffer] = await Promise.all([
      baseImage.arrayBuffer().then((buffer) => Buffer.from(buffer)),
      styleImage.arrayBuffer().then((buffer) => Buffer.from(buffer)),
    ]);
    await Promise.all([
      uploadBuffer(baseKey, baseBuffer, baseImage.type),
      uploadBuffer(styleKey, styleBuffer, styleImage.type),
    ]);

    try {
      const [, , derivation] = await Promise.all([
        createAsset(workspace.id, campaign.id, {
          key: baseKey,
          type: baseImage.type,
          size: baseImage.size,
          role: "base",
        }),
        createAsset(workspace.id, campaign.id, {
          key: styleKey,
          type: styleImage.type,
          size: styleImage.size,
          role: "style_reference",
        }),
        createDerivation({
          campaignId: campaign.id,
          workspaceId: workspace.id,
          status: "queued",
          generationMode: "restyling",
          format: "1:1",
          variantIndex: 0,
          ctaText: typeof ctaText === "string" ? ctaText.trim() : undefined,
        }),
      ]);

      // Send Inngest event
      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: derivation.id,
          campaignId: campaign.id,
          workspaceId: workspace.id,
          locale,
          generationMode: "restyling",
          variantIndex: 0,
          ctaText: typeof ctaText === "string" ? ctaText.trim() : undefined,
          format: "1:1",
          creativeLevel: "balanced",
        },
      });

      return NextResponse.json({
        campaignId: campaign.id,
        derivationId: derivation.id,
        redirectUrl: `/campaigns/${campaign.id}`,
      }, { status: 201 });
    } catch (err) {
      // Compensating transaction: clean up R2 files and DB campaign on failure
      await Promise.all([
        deleteObject(baseKey).catch((e) => logger.error("cleanup failed", e)),
        deleteObject(styleKey).catch((e) => logger.error("cleanup failed", e)),
        deleteCampaign(campaign.id, workspace.id).catch((e) => logger.error("cleanup failed", e)),
      ]);
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "quick-tools.restyling.POST");
  }
}
