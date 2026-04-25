import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaigns } from "@/server/repositories/campaign";
import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const campaignList = await getCampaigns(workspace.id);
    const campaignCount = campaignList.length;

    const recentActivity = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.workspaceId, workspace.id))
      .orderBy(desc(activityEvents.createdAt))
      .limit(5);

    // Fallback: if no activity events, use recent campaigns as activity
    const activity =
      recentActivity.length > 0
        ? recentActivity.map((a) => ({
            id: a.id,
            type: a.type as "plan" | "derivation" | "campaign" | "export" | "alert",
            message: (a.metadata as Record<string, unknown> | null)?.message ?? a.type,
            timestamp: a.createdAt,
          }))
        : campaignList.slice(0, 5).map((c) => ({
            id: c.id,
            type: "campaign" as const,
            message: `Campaign "${c.name}" ${c.status === "draft" ? "created" : "updated"}`,
            timestamp: c.updatedAt,
          }));

    return NextResponse.json({
      campaignCount,
      recentActivity: activity,
    });
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
