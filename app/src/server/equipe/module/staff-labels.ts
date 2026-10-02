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

/**
 * The labels of the accounts a console shows, keyed for the staff views below. A console labels only what it shows:
 * reading every account's names for each request grows with the number of accounts (with `*`, every sign-up).
 */
export async function loadStaffLabelMap(
  internal: InternalEquipeRepositories,
  accountIds: readonly string[],
): Promise<Map<string, StaffAccountLabel>> {
  const rows = await internal.listAccountLabels({ accountIds });
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
