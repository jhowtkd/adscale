import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getWorkspaceProgression } from "@/server/progression/service";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const progression = await getWorkspaceProgression(workspace.id);
    return NextResponse.json(progression);
  } catch (error) {
    return handleApiError(error, "workspace.progression.GET");
  }
}
