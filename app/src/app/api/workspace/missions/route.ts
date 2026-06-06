import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceMissions } from "@/server/progression/missions/service";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const missions = await getWorkspaceMissions(workspace.id);
    return NextResponse.json(missions);
  } catch (error) {
    return handleApiError(error, "workspace.missions.GET");
  }
}
