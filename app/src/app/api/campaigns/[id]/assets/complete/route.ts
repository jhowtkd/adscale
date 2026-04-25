import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { headObject } from "@/server/storage/r2";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const completeSchema = z.object({
  key: z.string().min(1),
  type: z.enum(ALLOWED_TYPES),
  size: z.number().int().min(1).max(MAX_SIZE),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = completeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { key, type, size, width, height } = parsed.data;

    // Validate key starts with the campaign's asset prefix
    const expectedPrefix = `campaigns/${campaignId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Invalid asset key: must belong to the campaign" },
        { status: 400 }
      );
    }

    // Verify the object actually exists in R2
    const head = await headObject(key);
    if (!head) {
      return NextResponse.json(
        { error: "Asset not found in storage" },
        { status: 400 }
      );
    }

    // Verify Content-Type matches
    if (head.ContentType && head.ContentType !== type) {
      return NextResponse.json(
        { error: "Asset type mismatch" },
        { status: 400 }
      );
    }

    // Verify size matches (with small tolerance)
    if (head.ContentLength && Math.abs(head.ContentLength - size) > 1024) {
      return NextResponse.json(
        { error: "Asset size mismatch" },
        { status: 400 }
      );
    }

    const asset = await createAsset(workspace.id, campaignId, {
      key,
      type,
      size,
      width,
      height,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "No workspace") {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
