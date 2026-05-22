import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getSessionFromHeaders } from "@/server/auth/session";
import { inviteMember, acceptInvite } from "@/server/auth/team";
import { getPendingInvitations, cancelInvitation } from "@/server/repositories/invitation";
import { sendInviteEmail } from "@/server/services/email";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const invites = await getPendingInvitations(workspace.id);
    return NextResponse.json({ invites });
  } catch (error) {
    return handleApiError(error, "workspace.invites.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createInviteSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const invite = await inviteMember(
      workspace.id,
      parsed.data.email,
      parsed.data.role,
      user.id
    );

    await sendInviteEmail({
      to: parsed.data.email,
      workspaceName: workspace.name,
      token: invite.token,
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "workspace.invites.POST");
  }
}

export async function PATCH(request: Request) {
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
    return handleApiError(error, "workspace.invites.PATCH");
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const url = new URL(request.url);
    const inviteId = url.searchParams.get("id");

    if (!inviteId) {
      return apiError("invalidInput", 400);
    }

    const canceled = await cancelInvitation(inviteId, workspace.id);

    if (!canceled) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "workspace.invites.DELETE");
  }
}
