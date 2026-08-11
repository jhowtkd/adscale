import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import { getSessionFromHeaders } from "@/server/auth/session";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_OPTIONS,
  acceptInvite,
  assertInviteUsable,
  isInviteStateError,
} from "@/server/auth/team";
import {
  createInvitation,
  getInvitationByToken,
  getPendingInvitations,
  cancelInvitation,
} from "@/server/repositories/invitation";
import { sendInviteEmail } from "@/server/services/email";
import { getUserLocale } from "@/server/repositories/user";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

const previewSchema = z.object({ token: z.string().min(1) });

function maskEmail(email: string) {
  const [local, domain] = email.split("@", 2);
  if (!local || !domain) return "•••";
  return `${local.slice(0, 1)}${"•".repeat(Math.min(Math.max(local.length - 1, 2), 4))}@${domain}`;
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (token !== null) {
      const parsed = previewSchema.safeParse({ token });
      if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());

      const invite = await getInvitationByToken(parsed.data.token);
      if (!invite) return apiError("inviteNotFound", 404);
      assertInviteUsable(invite);

      const session = await getSessionFromHeaders(request.headers);
      return NextResponse.json({
        invite: {
          workspaceName: invite.workspaceName,
          role: invite.role,
          senderName: invite.senderName,
          recipientEmail: maskEmail(invite.email),
          expiresAt: invite.expiresAt.toISOString(),
        },
        account: session
          ? {
              email: session.user.email,
              matchesInvite: session.user.email.toLowerCase() === invite.email.toLowerCase(),
            }
          : null,
      });
    }

    const { workspace } = await requireWorkspaceAccess(request);
    const invites = await getPendingInvitations(workspace.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = invites.map(({ token, ...rest }) => rest);
    return NextResponse.json({ invites: sanitized });
  } catch (error) {
    if (isInviteStateError(error)) return apiError(error.code, error.status);
    return handleApiError(error, "workspace.invites.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const [body] = await Promise.all([
      request.json(),
      requireRole(workspace.id, user.id, ["owner", "admin"]),
    ]);
    const parsed = createInviteSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    if (parsed.data.role === "admin") {
      await requireRole(workspace.id, user.id, ["owner"]);
    }

    const invite = await createInvitation({
      workspaceId: workspace.id,
      email: parsed.data.email,
      role: parsed.data.role,
      createdBy: user.id,
    });

    const locale = await getUserLocale(user.id);
    await sendInviteEmail({
      to: parsed.data.email,
      workspaceName: workspace.name,
      token: invite.token,
      locale,
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

    const accepted = await acceptInvite(parsed.data.token, session.user.id, session.user.email);

    const response = NextResponse.json({ success: true, workspaceId: accepted.workspaceId });
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, accepted.workspaceId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (isInviteStateError(error)) return apiError(error.code, error.status);
    return handleApiError(error, "workspace.invites.PATCH");
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);

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
