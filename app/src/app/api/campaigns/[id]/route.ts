import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
} from "@/server/repositories/campaign";

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  client: z.string().optional(),
  product: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  offer: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
  generationMode: z.enum(["art_variation", "format_adaptation"]).optional(),
  ctaVariants: z.array(z.string()).max(3).optional(),
  targetFormats: z.array(z.enum(["1:1", "4:5", "9:16"])).max(1).optional(),
  creativeLevel: z.enum(["conservative", "balanced", "bold"]).optional(),
  status: z.enum(["draft", "active", "generating", "completed", "failed"]).optional(),
})
.refine(
  (data) => {
    const mode = data.generationMode ?? "art_variation";
    return mode !== "format_adaptation" || (data.targetFormats?.length === 1);
  },
  { message: "format_adaptation requires exactly 1 targetFormat", path: ["targetFormats"] }
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const campaign = await getCampaignById(id, workspace.id);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const campaign = await updateCampaign(id, workspace.id, parsed.data);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].PATCH");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const campaign = await deleteCampaign(id, workspace.id);

    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].DELETE");
  }
}
