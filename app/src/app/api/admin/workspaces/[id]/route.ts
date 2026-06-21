import { NextResponse } from "next/server";
import { z } from "zod";
import { billingPlanKeys } from "@/server/billing/plans";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  applyAdminWorkspaceAction,
  getAdminWorkspaceDetail,
} from "@/server/repositories/admin-workspaces";

const patchWorkspaceSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust_credits"),
    delta: z.number().int(),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal("override_plan"),
    planKey: z.enum(billingPlanKeys),
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
    const detail = await getAdminWorkspaceDetail(id);

    if (!detail) {
      return apiError("not_found", 404);
    }

    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error, "admin.workspaces.[id].GET");
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
    const parsed = patchWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    await applyAdminWorkspaceAction(
      id,
      parsed.data.action,
      parsed.data,
      user.email ?? "unknown",
      parsed.data.reason
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Workspace not found") {
      return apiError("not_found", 404);
    }
    if (
      error instanceof Error &&
      (error.message === "Insufficient credits" ||
        error.message === "No billable subscription or beta entitlement")
    ) {
      return apiError("validation_error", 400, { message: error.message });
    }
    return handleApiError(error, "admin.workspaces.[id].PATCH");
  }
}
