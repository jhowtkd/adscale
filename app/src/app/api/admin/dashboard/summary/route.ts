import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getAdminDashboardSummary } from "@/server/repositories/admin-dashboard";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const summary = await getAdminDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "admin.dashboard.summary.GET");
  }
}
