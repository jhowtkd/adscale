import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { revokeWorkspaceToken } from "@/server/mcp/tokens";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const revoked = await revokeWorkspaceToken(workspace.id, id);
    if (!revoked) return apiError("notFound", 404);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return handleApiError(error, "workspace.mcp-tokens.[id].DELETE");
  }
}
