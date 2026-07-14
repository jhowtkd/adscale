import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess, requireRole } from "@/server/auth/workspace";
import { getSessionFromHeaders } from "@/server/auth/session";
import { acceptInvite } from "@/server/auth/team";
import { createInvitation, getPendingInvitations, cancelInvitation } from "@/server/repositories/invitation";
import { sendInviteEmail } from "@/server/services/email";
import { getUserLocale } from "@/server/repositories/user";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

const deleteQuerySchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const invites = await getPendingInvitations(workspace.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = invites.map(({ token, ...rest }) => rest);
    return NextResponse.json({ invites: sanitized });
  } catch (error) {
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
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);

    const { searchParams } = new URL(request.url);
    const parsed = deleteQuerySchema.safeParse({
      id: searchParams.get("id") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const canceled = await cancelInvitation(parsed.data.id, workspace.id);

    if (!canceled) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "workspace.invites.DELETE");
  }
}
