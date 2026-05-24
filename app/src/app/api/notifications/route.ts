import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getNotificationsByUser,
  markAllNotificationsAsRead,
  deleteNotificationsByUser,
} from "@/server/repositories/notification";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
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
