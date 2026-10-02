import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { AUTH_ERROR_CODES, isWorkspaceAuthError } from "@/server/auth/errors";
import { EQUIPE_ACCOUNT_STATUS } from "@/server/db/equipe-schema";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getCrossAccountPipeline } from "@/server/equipe/module/escalation-queries";
import { getGlobalStopState } from "@/server/equipe/module/global-stop";

/**
 * GET /api/equipe/staff/accounts — the between-accounts pipeline: open
 * escalations, open exceptions and active pauses per account, plus the
 * global publication stop state (#583). Behind the internal-staff guard;
 * scopes come from the internal account listing, the only cross-account
 * read, and the module query does the filtering.
 *
 * `?access=1` only asks whether the person is internal staff, which the shell does on every page: staff get 200 {allowed:true} without any read, and anyone
 * else 200 {allowed:false} instead of a 403 that the browser logged as an error at every opening of the home (ticket 13, D-11). No session is still a 401.
 */
export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get("access") === "1";
  try {
    const guard = await equipeStaffContext(request);
    if (probe) return NextResponse.json({ allowed: true });

    const accounts = (
      await Promise.all(
        EQUIPE_ACCOUNT_STATUS.map((status) => guard.deps.uow.internal.listAccountsByStatus(status)),
      )
    ).flat();
    const view = await getCrossAccountPipeline(
      guard.deps.uow.repos,
      guard.deps.uow.internal,
      accounts.map((account) => ({ workspaceId: account.workspaceId, accountId: account.id })),
    );
    const globalStop = await getGlobalStopState(guard.deps.uow.internal);
    return NextResponse.json({ ...view, globalStop });
  } catch (error) {
    if (probe && isWorkspaceAuthError(error) && error.code === AUTH_ERROR_CODES.forbidden) return NextResponse.json({ allowed: false });
    return handleApiError(error, "equipe.staff.accounts.GET");
  }
}
