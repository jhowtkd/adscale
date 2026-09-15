import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { isMockMode } from "@/server/served-ads/graph";
import {
  getConnectionByWorkspace,
  listConnectionAccounts,
} from "@/server/served-ads/repository";
import { disconnectConnection as purgeConnection } from "@/server/served-ads/sync";

/**
 * GET: estado da Conexão Meta do workspace (member lê).
 * DELETE: desconectar — apaga token+mídia+métricas na hora (owner/admin).
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const connection = await getConnectionByWorkspace(workspace.id);
    if (!connection) {
      return NextResponse.json({ connected: false, mock: isMockMode() });
    }
    const accounts = await listConnectionAccounts(connection.id);
    return NextResponse.json({
      connected: true,
      mock: isMockMode(),
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      lastSyncError: connection.lastSyncError,
      accounts: accounts.map((account) => ({
        id: account.id,
        adAccountId: account.adAccountId,
        name: account.name,
        currency: account.currency,
        brandId: account.brandId,
      })),
    });
  } catch (error) {
    return handleApiError(error, "meta-connection.GET");
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    await requireRole(workspace.id, user.id, ["owner", "admin"]);
    const connection = await getConnectionByWorkspace(workspace.id);
    if (!connection) return apiError("connectionNotFound", 404);
    await purgeConnection(connection.id);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return handleApiError(error, "meta-connection.DELETE");
  }
}
