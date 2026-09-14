import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listPieceFavorites } from "@/server/repositories/piece-favorites";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const items = await listPieceFavorites({
      workspaceId: workspace.id,
      userId: user.id,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, "library.favorites.GET");
  }
}
