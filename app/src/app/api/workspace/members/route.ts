import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getWorkspaceMembers,
  removeMember,
  type RemoveMemberResult,
} from "@/server/auth/team";

const removeMemberSchema = z.object({
  userId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const members = await getWorkspaceMembers(workspace.id);
    return NextResponse.json({ members, viewerUserId: user.id });
  } catch (error) {
    return handleApiError(error, "workspace.members.GET");
  }
}

const REMOVE_MEMBER_ERROR_STATUS: Record<Exclude<RemoveMemberResult, "removed">, number> = {
  cannotRemoveSelf: 400,
  memberNotFound: 404,
  forbidden: 403,
};

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    const parsed = removeMemberSchema.safeParse({ userId });
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await removeMember(workspace.id, user.id, parsed.data.userId);
    if (result !== "removed") {
      return apiError(result, REMOVE_MEMBER_ERROR_STATUS[result]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "workspace.members.DELETE");
  }
}
