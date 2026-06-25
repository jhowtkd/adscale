import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getWorkspaceSettings,
  toWorkspaceSettingsResponse,
  updateWorkspaceSettings,
  WorkspaceSlugConflictError,
} from "@/server/repositories/workspace";

const workspaceSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const patchWorkspaceSettingsSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    slug: workspaceSlugSchema.optional(),
    description: z.string().max(500).optional(),
    industry: z.string().max(120).optional(),
    website: z.string().max(200).optional(),
    timezone: z.string().max(80).optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const settings = await getWorkspaceSettings(workspace.id);
    if (!settings) {
      return apiError("notFound", 404);
    }

    return NextResponse.json(toWorkspaceSettingsResponse(settings));
  } catch (error) {
    return handleApiError(error, "workspace.settings.GET");
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);

    const body = await request.json();
    const parsed = patchWorkspaceSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const updated = await updateWorkspaceSettings(workspace.id, parsed.data);

    return NextResponse.json(toWorkspaceSettingsResponse(updated));
  } catch (error) {
    if (error instanceof WorkspaceSlugConflictError) {
      return apiError("slugConflict", 409);
    }

    return handleApiError(error, "workspace.settings.PATCH");
  }
}
