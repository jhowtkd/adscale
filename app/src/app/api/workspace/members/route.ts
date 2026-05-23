import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import {
  getWorkspaceMembers,
  removeMember,
} from "@/server/auth/team";

const removeMemberSchema = z.object({
  userId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const members = await getWorkspaceMembers(workspace.id);
    return NextResponse.json({ members });
  } catch (error) {
    return handleApiError(error, "workspace.members.GET");
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    const parsed = removeMemberSchema.safeParse({ userId });
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    if (parsed.data.userId === user.id) {
      return apiError("cannotRemoveSelf", 400);
    }

    const removed = await removeMember(workspace.id, parsed.data.userId);

    if (!removed) {
      return apiError("memberNotFound", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "workspace.members.DELETE");
  }
}
