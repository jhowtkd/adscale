import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/platform-owner", () => ({
  workspaceHasPlatformOwnerMember: vi.fn(),
}));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: vi.fn(),
}));

import { workspaceHasPlatformOwnerMember } from "@/server/auth/platform-owner";
import { getActiveTesterEntitlementByWorkspace } from "@/server/repositories/entitlements";
import { workspaceHasUnlimitedBillingAccess } from "./unlimited-access";

const platformOwner = vi.mocked(workspaceHasPlatformOwnerMember);
const testerEntitlement = vi.mocked(getActiveTesterEntitlementByWorkspace);

describe("workspaceHasUnlimitedBillingAccess", () => {
  beforeEach(() => {
    platformOwner.mockResolvedValue(false);
    testerEntitlement.mockResolvedValue(null);
  });

  it("allows platform administrators without consulting tester entitlements", async () => {
    platformOwner.mockResolvedValue(true);

    await expect(workspaceHasUnlimitedBillingAccess("workspace-1")).resolves.toBe(true);
    expect(testerEntitlement).not.toHaveBeenCalled();
  });
});
