import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { getSessionFromHeaders } from "@/server/auth/session";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_OPTIONS,
} from "@/server/auth/workspace";
import {
  acceptInvite,
  isInviteStateError,
} from "@/server/auth/team";
import { getInviteErrorHttpStatus } from "@/server/auth/invite-http";

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getSessionFromHeaders(request.headers);
    if (!session) {
      return apiError("unauthorized", 401);
    }

    const body = await request.json();
    const parsed = acceptInviteSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const accepted = await acceptInvite(parsed.data.token, session.user.id, session.user.email);

    const response = NextResponse.json({ success: true, workspaceId: accepted.workspaceId });
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, accepted.workspaceId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (isInviteStateError(error)) return apiError(error.code, getInviteErrorHttpStatus(error.code));
    return handleApiError(error, "workspace.invites.accept.POST");
  }
}
