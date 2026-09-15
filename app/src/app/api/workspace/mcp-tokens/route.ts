import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { issueWorkspaceToken, listWorkspaceTokens } from "@/server/mcp/tokens";

/**
 * Gestão dos Bearer tokens do MCP — Configurações → Integrações (#356).
 * owner/admin criam e revogam; o segredo aparece uma vez, na criação.
 */
export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const tokens = await listWorkspaceTokens(workspace.id);
    return NextResponse.json({ tokens });
  } catch (error) {
    return handleApiError(error, "workspace.mcp-tokens.GET");
  }
}

const createBodySchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const body = createBodySchema.safeParse(await request.json());
    if (!body.success) return apiError("invalidInput", 400, body.error.flatten());
    const created = await issueWorkspaceToken({
      workspaceId: workspace.id,
      userId: user.id,
      name: body.data.name,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "workspace.mcp-tokens.POST");
  }
}
