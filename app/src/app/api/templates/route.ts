import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createTemplate, getTemplates } from "@/server/repositories/template";

const createTemplateSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const templates = await getTemplates(workspace.id);
    return NextResponse.json({ templates });
  } catch (error) {
    return handleApiError(error, "templates.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const template = await createTemplate({
      workspaceId: workspace.id,
      ...parsed.data,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "templates.POST");
  }
}
