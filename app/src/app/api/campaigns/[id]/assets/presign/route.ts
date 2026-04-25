import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getPresignedUploadUrl } from "@/server/storage/r2";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
});

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

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
    const parsed = presignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { filename, contentType, contentLength } = parsed.data;

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPEG, and WebP are allowed." },
        { status: 400 }
      );
    }

    if (contentLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    const key = `campaigns/${campaignId}/${crypto.randomUUID()}-${filename}`;
    const url = await getPresignedUploadUrl(key, contentType, contentLength);

    return NextResponse.json({ url, key });
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
