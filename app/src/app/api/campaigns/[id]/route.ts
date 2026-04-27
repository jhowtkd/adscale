import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
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
  status: z.enum(["draft", "active", "generating", "completed", "failed"]).optional(),
});

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
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
