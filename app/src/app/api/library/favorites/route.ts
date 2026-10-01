import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { z } from "zod";
import { getClientProfile } from "@/server/repositories/client-reference";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listPieceFavorites } from "@/server/repositories/piece-favorites";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const parsed = z.string().uuid().optional().safeParse(new URL(request.url).searchParams.get("clientProfileId") ?? undefined);
    if (!parsed.success) return apiError("invalidInput", 400);
    if (parsed.data && !await getClientProfile(workspace.id, parsed.data)) return apiError("clientProfileNotFound", 404);
    const items = await listPieceFavorites({
      workspaceId: workspace.id,
      userId: user.id,
      ...(parsed.data ? { clientProfileId: parsed.data } : {}),
    });
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, "library.favorites.GET");
  }
}
