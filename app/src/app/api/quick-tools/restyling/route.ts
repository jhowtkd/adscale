import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createCampaign, deleteCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { createDerivation } from "@/server/repositories/derivation";
import { uploadBuffer, deleteObject } from "@/server/storage/r2";
import { inngest } from "@/server/jobs/client";
import { getUserLocale } from "@/server/repositories/user";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);

    const formData = await request.formData();

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
    if (!ALLOWED_TYPES.includes(baseImage.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400, { message: "Base image must be PNG, JPEG, or WebP" });
    }
    if (!ALLOWED_TYPES.includes(styleImage.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400, { message: "Style image must be PNG, JPEG, or WebP" });
    }

    // Validate file sizes
    if (baseImage.size <= 0 || baseImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }
    if (styleImage.size <= 0 || styleImage.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    // Parse and validate style intensity
    const styleIntensity = typeof styleIntensityRaw === "string" && ["soft", "medium", "strong"].includes(styleIntensityRaw)
      ? styleIntensityRaw
      : styleIntensityRaw == null
        ? "medium"
        : null;

    if (!styleIntensity) {
      return apiError("invalidInput", 400, { message: "Invalid style intensity" });
    }

    // Create campaign with restyling mode
    const campaign = await createCampaign(workspace.id, {
      name: name.trim(),
      client: typeof client === "string" ? client.trim() : undefined,
      offer: typeof offer === "string" ? offer.trim() : undefined,
      notes: typeof notes === "string" ? notes.trim() : undefined,
      generationMode: "restyling",
      creativeLevel: "balanced",
      styleIntensity,
      status: "draft",
    });

    // Upload base image
    const baseKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-base.${baseImage.type.split("/")[1] ?? "bin"}`;
    const baseBuffer = Buffer.from(await baseImage.arrayBuffer());
    await uploadBuffer(baseKey, baseBuffer, baseImage.type);

    // Upload style reference image
    const styleKey = `campaigns/${campaign.id}/${crypto.randomUUID()}-style.${styleImage.type.split("/")[1] ?? "bin"}`;
    const styleBuffer = Buffer.from(await styleImage.arrayBuffer());
    await uploadBuffer(styleKey, styleBuffer, styleImage.type);

    try {
      await createAsset(workspace.id, campaign.id, {
        key: baseKey,
        type: baseImage.type,
        size: baseImage.size,
        role: "base",
      });

      await createAsset(workspace.id, campaign.id, {
        key: styleKey,
        type: styleImage.type,
        size: styleImage.size,
        role: "style_reference",
      });

      // Create derivation
      const derivation = await createDerivation({
        campaignId: campaign.id,
        workspaceId: workspace.id,
        status: "queued",
        generationMode: "restyling",
        format: "1:1",
        variantIndex: 0,
        ctaText: typeof ctaText === "string" ? ctaText.trim() : undefined,
      });

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
      await deleteObject(baseKey).catch(() => {});
      await deleteObject(styleKey).catch(() => {});
      await deleteCampaign(campaign.id, workspace.id).catch(() => {});
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "quick-tools.restyling.POST");
  }
}