import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeClientContext } from "@/server/equipe/http/guards";

/**
 * GET /api/equipe/accounts — the workspace's Equipe accounts, by brand.
 * Disabled workspaces answer 404 without revealing the feature.
 */
export async function GET(request: Request) {
  try {
    const guard = await equipeClientContext(request);
    if (!guard.ok) return apiError("notFound", 404);
    const { context } = guard;

    const accounts = await context.deps.uow.repos.accounts.list(context.workspace.id);
    const ordered = [...accounts].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    return NextResponse.json({ accounts: ordered });
  } catch (error) {
    return handleApiError(error, "equipe.accounts.GET");
  }
}
