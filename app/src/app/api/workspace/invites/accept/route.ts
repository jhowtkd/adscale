import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { getSessionFromHeaders } from "@/server/auth/session";
import { acceptInvite } from "@/server/auth/team";

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

    await acceptInvite(parsed.data.token, session.user.id, session.user.email);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Invite not found") {
      return apiError("inviteNotFound", 404);
    }
    if (error instanceof Error && error.message === "Invite expired") {
      return apiError("inviteExpired", 410);
    }
    if (error instanceof Error && error.message === "Invite email mismatch") {
      return apiError("inviteEmailMismatch", 403);
    }
    return handleApiError(error, "workspace.invites.accept.POST");
  }
}
