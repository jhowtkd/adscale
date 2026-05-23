import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDashboardStats } from "@/server/repositories/dashboard";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const stats = await getDashboardStats(workspace.id);
    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error, "dashboard.stats.GET");
  }
}
