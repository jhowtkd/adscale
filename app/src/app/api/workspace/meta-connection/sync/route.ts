import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { inngest } from "@/server/jobs/client";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { getConnectionByWorkspace } from "@/server/served-ads/repository";

/** POST: "atualizar agora" — enfileira sync imediato (owner/admin). */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const connection = await getConnectionByWorkspace(workspace.id);
    if (!connection) return apiError("connectionNotFound", 404);
    if (connection.status !== "ativa") return apiError("connectionNotActive", 409);
    await inngest.send({ name: "meta.ads.sync", data: { connectionId: connection.id } });
    return NextResponse.json({ sync: "queued" }, { status: 202 });
  } catch (error) {
    return handleApiError(error, "meta-connection.sync");
  }
}
