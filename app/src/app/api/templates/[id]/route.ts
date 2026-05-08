import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getTemplateById,
  deleteTemplate,
} from "@/server/repositories/template";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const template = await getTemplateById(id, workspace.id);

    if (!template) {
      return apiError("notFound", 404, { message: "Template not found" });
    }

    return NextResponse.json({ template });
  } catch (error) {
    return handleApiError(error, "templates.[id].GET");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;
    const template = await deleteTemplate(id, workspace.id);

    if (!template) {
      return apiError("notFound", 404, { message: "Template not found" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "templates.[id].DELETE");
  }
}
