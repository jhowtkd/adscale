import { requireEquipeStaffPageContext } from "@/server/equipe/http/staff-page-guard";
import Link from "next/link";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import type { StaffRole } from "@/server/equipe/domain";
import {
  getOpenAccountCandidate,
  listPilotWorkspaceIdsForOpening,
  OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE,
  type OpenAccountCandidate,
} from "@/server/equipe/module";
import CrossAccountPipeline from "@/components/equipe/CrossAccountPipeline";

export default async function EquipeAccountsPage({ searchParams }: {
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const { staffRows } = await requireEquipeStaffPageContext();
  // #582 — the open-account form data: pilot workspaces only, operations
  // only. The gateway is scoped to one workspace per build, so each
  // candidate is read with its own workspace-scoped deps, sequentially.
  // Stored roles are plain strings; only known roles count.
  const staffRoles = staffRows
    .map((row) => row.role)
    .filter(
      (role): role is StaffRole =>
        role === "support" || role === "quality" || role === "operations",
    );
  const canOpenAccount = staffRoles.includes("operations");
  const candidates: OpenAccountCandidate[] = [];
  const { after } = await searchParams;
  const cursor = typeof after === "string" ? after : undefined;
  const workspaceIds = canOpenAccount
    ? await listPilotWorkspaceIdsForOpening(createEquipeRouteDeps().uow.internal, undefined, cursor) : [];
  const pageIds = workspaceIds.slice(0, OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE);
  if (canOpenAccount) {
    for (const workspaceId of pageIds) {
      const candidate = await getOpenAccountCandidate(createEquipeRouteDeps(workspaceId), {
        workspaceId,
        staffRoles,
      });
      if (candidate) candidates.push(candidate);
    }
  }
  // #584: support or operations may propose the activation; the console
  // acts with the held role so operations-only staff never hit a 403.
  let activationRole: "support" | "operations" | null = null;
  if (staffRoles.includes("support")) activationRole = "support";
  else if (staffRoles.includes("operations")) activationRole = "operations";
  return (
    <>
      {canOpenAccount && (cursor || workspaceIds.length > OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE) && (
        <nav aria-label="Workspaces para abrir conta" className="flex gap-4 text-sm">
          {cursor && <Link href="/admin/equipe/accounts">Primeira página</Link>}
          {workspaceIds.length > OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE && (
            <Link href={`/admin/equipe/accounts?after=${pageIds.at(-1)}`}>Próximos workspaces</Link>
          )}
        </nav>
      )}
      <CrossAccountPipeline
        candidates={candidates}
        canOpenAccount={canOpenAccount}
        activationRole={activationRole}
      />
    </>
  );
}
