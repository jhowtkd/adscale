import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { markNotificationAsRead } from "@/server/repositories/notification";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const updated = await markNotificationAsRead(id, user.id);
    if (!updated) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }
    return NextResponse.json({ notification: updated });
  } catch (error) {
    return handleApiError(error, "notifications.read.PATCH");
  }
}
