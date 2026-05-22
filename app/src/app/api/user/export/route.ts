import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import {
  campaigns,
  derivations,
  campaignAssets,
  creativePlans,
  workspaces,
  user as userTable,
} from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const [userData, workspaceData, userCampaigns, userPlans, userAssets] = await Promise.all([
      db.select().from(userTable).where(eq(userTable.id, user.id)).limit(1),
      db.select().from(workspaces).where(eq(workspaces.id, workspace.id)).limit(1),
      db.select().from(campaigns).where(eq(campaigns.workspaceId, workspace.id)),
      db.select().from(creativePlans).where(eq(creativePlans.workspaceId, workspace.id)),
      db.select().from(campaignAssets).where(eq(campaignAssets.workspaceId, workspace.id)),
    ]);

    const userDerivations = await db
      .select()
      .from(derivations)
      .where(eq(derivations.workspaceId, workspace.id));

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: userData[0]?.id,
        name: userData[0]?.name,
        email: userData[0]?.email,
        createdAt: userData[0]?.createdAt?.toISOString(),
      },
      workspace: {
        id: workspaceData[0]?.id,
        name: workspaceData[0]?.name,
        createdAt: workspaceData[0]?.createdAt?.toISOString(),
      },
      campaigns: userCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        client: c.client,
        status: c.status,
        generationMode: c.generationMode,
        createdAt: c.createdAt?.toISOString(),
        updatedAt: c.updatedAt?.toISOString(),
      })),
      derivations: userDerivations.map((d) => ({
        id: d.id,
        campaignId: d.campaignId,
        status: d.status,
        format: d.format,
        generationMode: d.generationMode,
        createdAt: d.createdAt?.toISOString(),
      })),
      assets: userAssets.map((a) => ({
        id: a.id,
        campaignId: a.campaignId,
        key: a.key,
        role: a.role,
        createdAt: a.createdAt?.toISOString(),
      })),
      plans: userPlans.map((p) => ({
        id: p.id,
        campaignId: p.campaignId,
        strategy: p.strategy,
        status: p.status,
        createdAt: p.createdAt?.toISOString(),
      })),
    };

    return NextResponse.json(exportData);
  } catch (error) {
    return handleApiError(error, "user.export.GET");
  }
}
