import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { db } from "@/server/db";
import { clientProfiles, workspaces } from "@/server/db/schema";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);

    const brands = await db
      .select({
        id: clientProfiles.id,
        name: clientProfiles.name,
        workspaceId: clientProfiles.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(clientProfiles)
      .innerJoin(workspaces, eq(clientProfiles.workspaceId, workspaces.id))
      .orderBy(asc(clientProfiles.name));

    return NextResponse.json({ brands });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.GET");
  }
}
