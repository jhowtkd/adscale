import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getNotificationsByUser,
  markAllNotificationsAsRead,
  deleteNotificationsByUser,
} from "@/server/repositories/notification";

const listQuerySchema = z.object({
  limit: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.coerce.number().int().positive().max(100).optional()
  ),
});

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);

    const parsed = listQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const limit = parsed.data.limit ?? 50;
    const items = await getNotificationsByUser(user.id, workspace.id, limit);
    return NextResponse.json({ notifications: items });
  } catch (error) {
    return handleApiError(error, "notifications.GET");
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await markAllNotificationsAsRead(user.id, workspace.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "notifications.PATCH");
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await deleteNotificationsByUser(user.id, workspace.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "notifications.DELETE");
  }
}
