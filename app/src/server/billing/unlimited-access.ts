import { DEV_ADMIN_CREDIT_BALANCE } from "@/server/auth/dev-admin";
import { workspaceHasPlatformOwnerMember } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";

export const UNLIMITED_CREDIT_BALANCE = DEV_ADMIN_CREDIT_BALANCE;

export async function workspaceHasUnlimitedBillingAccess(
  workspaceId: string
): Promise<boolean> {
  if (await workspaceHasPlatformOwnerMember(workspaceId)) {
    return true;
  }

  const testerEntitlement = await getActiveTesterEntitlementByWorkspace(workspaceId);
  return testerEntitlement !== null;
}
