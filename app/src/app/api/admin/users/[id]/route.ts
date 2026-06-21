import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  applyAdminUserAction,
  getAdminUserDetail,
} from "@/server/repositories/admin-users";

const patchUserSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify_email"), reason: z.string().min(1) }),
  z.object({ action: z.literal("reset_onboarding"), reason: z.string().min(1) }),
  z.object({
    action: z.literal("unlock_trial_notifications"),
    reason: z.string().min(1),
  }),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const { id } = await params;
    const detail = await getAdminUserDetail(id);

    if (!detail) {
      return apiError("not_found", 404);
    }

    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error, "admin.users.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchUserSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    await applyAdminUserAction(
      id,
      parsed.data.action,
      parsed.data.reason,
      user.email ?? "unknown"
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      return apiError("not_found", 404);
    }
    return handleApiError(error, "admin.users.[id].PATCH");
  }
}
