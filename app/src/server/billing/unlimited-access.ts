import {
  DEV_ADMIN_CREDIT_BALANCE,
  workspaceHasDevAdminOwner,
} from "@/server/auth/dev-admin";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";

export const UNLIMITED_CREDIT_BALANCE = DEV_ADMIN_CREDIT_BALANCE;

export async function workspaceHasUnlimitedBillingAccess(
  workspaceId: string
): Promise<boolean> {
  if (await workspaceHasDevAdminOwner(workspaceId)) {
    return true;
  }

  const testerEntitlement = await getActiveTesterEntitlementByWorkspace(workspaceId);
  return testerEntitlement !== null;
}
