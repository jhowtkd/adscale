import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import {
  workspaces,
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

    // Workspace-owned data cascades from workspaces via schema-level onDelete rules.
    await Promise.all([
      db.delete(workspaces).where(eq(workspaces.id, workspace.id)),
      db.delete(session).where(eq(session.userId, user.id)),
      db
        .update(userTable)
        .set({
          name: "Usuario Excluido",
          email: `deleted-${user.id.slice(0, 8)}@anon.adscale.io`,
          image: null,
        })
        .where(eq(userTable.id, user.id)),
    ]);

    return NextResponse.json({ success: true, message: "Account deleted and data anonymized" });
  } catch (error) {
    return handleApiError(error, "user.account.DELETE");
  }
}
