import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { isBrandMemoryEnabled } from "@/server/memory/zep-client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    if (!isBrandMemoryEnabled()) {
      return NextResponse.json({ enabled: false, items: [] });
    }

    const memory = await getBrandMemoryContext({
      workspaceId: workspace.id,
      clientProfileName: profile.name,
      client: profile.name,
      limit: 6,
    });

    return NextResponse.json({
      enabled: true,
      items: memory.items.slice(0, 6),
    });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].memory.GET");
  }
}

