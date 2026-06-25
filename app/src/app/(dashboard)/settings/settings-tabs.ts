/** Tabs audited for end-to-end functionality (API + real UI, not local-only stubs). */
export const settingsTabs = [
  { id: "profile", labelKey: "profileTab", enabled: true },
  { id: "workspace", labelKey: "workspaceTab", enabled: true },
  { id: "brandKit", labelKey: "brandKitTab", enabled: true },
  { id: "team", labelKey: "teamTab", enabled: true },
  { id: "billing", labelKey: "billingTab", enabled: true },
  { id: "creditHistory", labelKey: "creditHistoryTab", enabled: true },
  { id: "plans", labelKey: "plansTab", enabled: true },
  { id: "integrations", labelKey: "integrationsTab", enabled: false },
  { id: "privacy", labelKey: "privacyTab", enabled: true },
] as const;

export type SettingsTabId = (typeof settingsTabs)[number]["id"];

const tabIds = settingsTabs.map((tab) => tab.id);
/** Default landing tab — brandKit (least disruptive; profile/workspace stay navigable via ?tab=). */
const defaultTabId: SettingsTabId = "brandKit";

export function resolveSettingsTab(requestedTab: string | null): SettingsTabId {
  if (requestedTab && tabIds.includes(requestedTab as SettingsTabId)) {
    const tab = settingsTabs.find((item) => item.id === requestedTab);
    if (tab?.enabled) return requestedTab as SettingsTabId;
  }
  return defaultTabId;
}

export function isSettingsTabEnabled(tabId: string): boolean {
  return settingsTabs.find((tab) => tab.id === tabId)?.enabled ?? false;
}
