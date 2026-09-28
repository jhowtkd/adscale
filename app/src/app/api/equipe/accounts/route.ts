import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeClientContext } from "@/server/equipe/http/guards";
import { getClientAccounts } from "@/server/equipe/module/queries";

/**
 * GET /api/equipe/accounts — the workspace's Equipe accounts with brand
 * names and pending-decision flags. Disabled workspaces answer 404
 * without revealing the feature.
 */
export async function GET(request: Request) {
  try {
    const guard = await equipeClientContext(request);
    if (!guard.ok) return apiError("notFound", 404);
    const { context } = guard;

    const accounts = await getClientAccounts(context.deps, context.workspace.id);
    return NextResponse.json({ accounts });
  } catch (error) {
    return handleApiError(error, "equipe.accounts.GET");
  }
}
