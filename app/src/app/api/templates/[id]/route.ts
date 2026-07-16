import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  deleteTemplate,
  getTemplateById,
  updateTemplate,
} from "@/server/repositories/template";

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

const templateIdSchema = z.string().uuid();

async function parseTemplateId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const parsed = templateIdSchema.safeParse(id);
  if (!parsed.success) {
    return { error: await apiError("notFound", 404) };
  }
  return { id: parsed.data };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, idResult] = await Promise.all([
      requireWorkspaceAccess(request),
      parseTemplateId(params),
    ]);
    if ("error" in idResult) return idResult.error;

    const template = await getTemplateById(idResult.id, workspace.id);
    if (!template) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error, "templates.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, idResult] = await Promise.all([
      requireWorkspaceAccess(request),
      parseTemplateId(params),
    ]);
    if ("error" in idResult) return idResult.error;

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const template = await updateTemplate(idResult.id, workspace.id, parsed.data);

    if (!template) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error, "templates.[id].PATCH");
  }
}

/**
 * DELETE contract: first successful delete returns 200 with the deleted
 * template. A second delete (or delete of missing / other-workspace id)
 * returns 404 — not a silent 204 — so clients can treat it as idempotent
 * only by explicitly handling notFound.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, idResult] = await Promise.all([
      requireWorkspaceAccess(request),
      parseTemplateId(params),
    ]);
    if ("error" in idResult) return idResult.error;

    const deleted = await deleteTemplate(idResult.id, workspace.id);
    if (!deleted) {
      return apiError("notFound", 404);
    }

    return NextResponse.json({ template: deleted });
  } catch (error) {
    return handleApiError(error, "templates.[id].DELETE");
  }
}
