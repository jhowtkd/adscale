import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  getConnectionByWorkspace,
  linkAccountBrand,
  listConnectionAccounts,
} from "@/server/served-ads/repository";

const linkSchema = z.object({
  accountId: z.string().uuid(),
  /** null = desvincula. */
  brandId: z.string().uuid().nullable(),
});

/**
 * GET: contas da conexão (member lê). POST: vincular/desvincular
 * conta ↔ marca (owner/admin; vínculo nunca é feito pelo sync).
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const connection = await getConnectionByWorkspace(workspace.id);
    if (!connection) return NextResponse.json({ accounts: [] });
    const accounts = await listConnectionAccounts(connection.id);
    return NextResponse.json({ accounts });
  } catch (error) {
    return handleApiError(error, "meta-connection.accounts.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const parsed = linkSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    const connection = await getConnectionByWorkspace(workspace.id);
    if (!connection) return apiError("connectionNotFound", 404);
    if (parsed.data.brandId) {
      const brand = await getClientProfile(workspace.id, parsed.data.brandId);
      if (!brand) return apiError("clientProfileNotFound", 404);
    }
    const linked = await linkAccountBrand(connection.id, parsed.data.accountId, parsed.data.brandId);
    if (!linked) return apiError("adAccountNotFound", 404);
    return NextResponse.json({ linked: true });
  } catch (error) {
    return handleApiError(error, "meta-connection.accounts.POST");
  }
}
