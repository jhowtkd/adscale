import { requireEquipeStaffPageContext } from "@/server/equipe/http/staff-page-guard";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import type { StaffRole } from "@/server/equipe/domain";
import {
  getOpenAccountCandidate,
  listPilotWorkspaceIds,
  type OpenAccountCandidate,
} from "@/server/equipe/module";
import CrossAccountPipeline from "@/components/equipe/CrossAccountPipeline";

export default async function EquipeAccountsPage() {
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
  if (canOpenAccount) {
    for (const workspaceId of listPilotWorkspaceIds()) {
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
    <CrossAccountPipeline
      candidates={candidates}
      canOpenAccount={canOpenAccount}
      activationRole={activationRole}
    />
  );
}
