import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import {
  campaigns,
  derivations,
  campaignAssets,
  creativePlans,
  workspaces,
  workspaceMembers,
  user as userTable,
  session,
} from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const body = await request.json().catch(() => ({}));
    if (!body.confirm || body.confirm !== "DELETE") {
      return apiError("confirmationRequired", 400);
    }

    // Delete all workspace data
    await db.delete(derivations).where(eq(derivations.workspaceId, workspace.id));
    await db.delete(campaignAssets).where(eq(campaignAssets.workspaceId, workspace.id));
    await db.delete(creativePlans).where(eq(creativePlans.workspaceId, workspace.id));
    await db.delete(campaigns).where(eq(campaigns.workspaceId, workspace.id));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

    // Anonymize user (LGPD-compliant alternative to hard deletion)
    await db
      .update(userTable)
      .set({
        name: "Usuario Excluido",
        email: `deleted-${user.id.slice(0, 8)}@anon.adscale.io`,
        image: null,
      })
      .where(eq(userTable.id, user.id));

    // Revoke all sessions
    await db.delete(session).where(eq(session.userId, user.id));

    return NextResponse.json({ success: true, message: "Account deleted and data anonymized" });
  } catch (error) {
    return handleApiError(error, "user.account.DELETE");
  }
}
