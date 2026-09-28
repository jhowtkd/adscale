// Staff label lookup (#554): brand + workspace names for the internal
// consoles, read through the internal repositories only (the single
// cross-account reader). Missing rows read as null names.

import type { InternalEquipeRepositories } from "../data";

export type StaffAccountLabel = {
  brandName: string | null;
  workspaceName: string | null;
};

export const UNKNOWN_STAFF_LABEL: StaffAccountLabel = {
  brandName: null,
  workspaceName: null,
};

function labelKey(workspaceId: string, accountId: string): string {
  return `${workspaceId}:${accountId}`;
}

/** All account labels, keyed for the staff views below. */
export async function loadStaffLabelMap(
  internal: InternalEquipeRepositories,
): Promise<Map<string, StaffAccountLabel>> {
  const rows = await internal.listAccountLabels();
  const map = new Map<string, StaffAccountLabel>();
  for (const row of rows) {
    map.set(labelKey(row.workspaceId, row.accountId), {
      brandName: row.brandName,
      workspaceName: row.workspaceName,
    });
  }
  return map;
}

export function staffLabelOf(
  map: Map<string, StaffAccountLabel>,
  workspaceId: string,
  accountId: string,
): StaffAccountLabel {
  return map.get(labelKey(workspaceId, accountId)) ?? UNKNOWN_STAFF_LABEL;
}
