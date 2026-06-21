import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { getAdminUserMirror } from "@/server/repositories/admin-users";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const { id } = await params;
    const mirror = await getAdminUserMirror(id);

    if (!mirror) {
      return apiError("not_found", 404);
    }

    return NextResponse.json(mirror);
  } catch (error) {
    return handleApiError(error, "admin.users.[id].mirror.GET");
  }
}
