import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { EQUIPE_ACCOUNT_STATUS } from "@/server/db/equipe-schema";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getCrossAccountPipeline } from "@/server/equipe/module/escalation-queries";

/**
 * GET /api/equipe/staff/accounts — the between-accounts pipeline: open
 * escalations, open exceptions and active pauses per account. Behind the
 * internal-staff guard; scopes come from the internal account listing,
 * the only cross-account read, and the module query does the filtering.
 */
export async function GET(request: Request) {
  try {
    const guard = await equipeStaffContext(request);

    const accounts = (
      await Promise.all(
        EQUIPE_ACCOUNT_STATUS.map((status) => guard.deps.uow.internal.listAccountsByStatus(status)),
      )
    ).flat();
    const view = await getCrossAccountPipeline(
      guard.deps.uow.repos,
      accounts.map((account) => ({ workspaceId: account.workspaceId, accountId: account.id })),
    );
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error, "equipe.staff.accounts.GET");
  }
}
