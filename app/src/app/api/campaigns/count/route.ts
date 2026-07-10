import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceCampaignCount } from "@/server/repositories/campaign";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const count = await getWorkspaceCampaignCount(workspace.id);
    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error, "campaigns.count.GET");
  }
}
