// Open-account candidates for the internal console (#582).
//
// One workspace at a time: the gateway is construction-scoped to a
// single workspace, so the accounts page loops `listWorkspaceIdsForOpening`
// with per-workspace deps and this read-only query fills each entry —
// the workspace name, its brands (client profiles) WITHOUT an Equipe
// account yet, and its members. A workspace without such a brand is not a
// candidate (null). Operations staff only: anyone else reads as absent,
// same fail-closed shape as the other internal queries.

import type { StaffRole } from "../domain";
import type { InternalEquipeRepositories } from "../data";
import type { EquipeModuleDeps } from "./ports";

export type OpenAccountCandidateBrand = {
  id: string;
  name: string | null;
};

export type OpenAccountCandidateMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type OpenAccountCandidate = {
  workspace: { id: string; name: string };
  brands: OpenAccountCandidateBrand[];
  members: OpenAccountCandidateMember[];
};

export async function getOpenAccountCandidate(
  deps: EquipeModuleDeps,
  input: { workspaceId: string; staffRoles: StaffRole[] },
): Promise<OpenAccountCandidate | null> {
  if (!input.staffRoles.includes("operations")) return null;
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const workspace = await deps.gateway.getWorkspace(input.workspaceId);
  if (!workspace) return null;
  const profiles = await deps.gateway.listClientProfiles(input.workspaceId);
  const accounts = await deps.uow.repos.accounts.list(input.workspaceId);
  const withAccount = new Set(accounts.map((account) => account.clientProfileId));
  const brands = profiles
    .filter(
      (profile) => profile.workspaceId === input.workspaceId && !withAccount.has(profile.id),
    )
    .map((profile) => ({ id: profile.id, name: profile.name ?? null }))
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  // A workspace without a free brand has nothing to open (with `*` that is almost every one: its brand already
  // has the free account), so it is not a candidate and costs no member read.
  if (brands.length === 0) return null;
  const members = await deps.gateway.listWorkspaceMembers(input.workspaceId);
  return {
    workspace: { id: workspace.id, name: workspace.name },
    brands,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
    })),
  };
}

/** Preserve the paid Operations form's paging: one bounded page of workspace ids plus a sentinel for the next link. */
export const OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listWorkspaceIdsForOpening(
  internal: Pick<InternalEquipeRepositories, "listWorkspaceIds">, after?: string,
): Promise<string[]> {
  if (after !== undefined && !UUID_PATTERN.test(after)) return [];
  return internal.listWorkspaceIds({ after, limit: OPEN_ACCOUNT_WORKSPACE_PAGE_SIZE + 1 });
}
