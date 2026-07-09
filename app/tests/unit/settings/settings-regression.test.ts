/**
 * TRUST-05 regression guard — settings surfaces outside profile/workspace
 * must remain intact: brand kit, team, billing, credit history, plans, privacy.
 */
import { describe, expect, it } from "vitest";

import { isSettingsTabEnabled, settingsTabs } from "@/app/(dashboard)/settings/settings-tabs";
import {
  useBillingPortal,
  useBillingStatus,
  useCreditHistory,
  useRedeemBetaAccess,
  useStartCheckout,
} from "@/lib/hooks/use-billing";
import {
  useBrandKit,
  useClearBrandKit,
  useExtractBrandKit,
  useUpdateBrandKit,
  useUploadLogo,
} from "@/lib/hooks/use-brand-kit";

describe("settings regression guard (TRUST-05)", () => {
  it("exports brand kit hooks unchanged", () => {
    expect(useBrandKit).toBeTypeOf("function");
    expect(useUpdateBrandKit).toBeTypeOf("function");
    expect(useExtractBrandKit).toBeTypeOf("function");
    expect(useUploadLogo).toBeTypeOf("function");
    expect(useClearBrandKit).toBeTypeOf("function");
  });

  it("exports billing hooks unchanged", () => {
    expect(useBillingStatus).toBeTypeOf("function");
    expect(useStartCheckout).toBeTypeOf("function");
    expect(useBillingPortal).toBeTypeOf("function");
    expect(useRedeemBetaAccess).toBeTypeOf("function");
    expect(useCreditHistory).toBeTypeOf("function");
  });

  it("keeps integrations disabled while profile and workspace are enabled", () => {
    const integrations = settingsTabs.find((tab) => tab.id === "integrations");
    const profile = settingsTabs.find((tab) => tab.id === "profile");
    const workspace = settingsTabs.find((tab) => tab.id === "workspace");

    expect(integrations?.enabled).toBe(false);
    expect(profile?.enabled).toBe(true);
    expect(workspace?.enabled).toBe(true);
    expect(isSettingsTabEnabled("integrations")).toBe(false);
  });

  it("moves Brand Kit out of settings into a first-class feature route", () => {
    const brandKit = settingsTabs.find((tab) => tab.id === "brandKit");
    const brandTraining = settingsTabs.find((tab) => (tab as { id: string }).id === "brandTraining");

    expect(brandKit).toBeUndefined();
    expect(brandTraining).toBeUndefined();
    expect(isSettingsTabEnabled("brandKit")).toBe(false);
    expect(isSettingsTabEnabled("brandTraining")).toBe(false);
  });
});
