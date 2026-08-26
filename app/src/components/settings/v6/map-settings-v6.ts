import { settingsTabs, type SettingsTabId } from "@/app/(dashboard)/settings/settings-tabs";
import type { SettingsV6Card } from "./settings-v6-types";

const cardMeta: Record<
  SettingsTabId,
  { descriptionKey: string; status: "available" | "requiresConfiguration" | "comingSoon"; badgeVariant: SettingsV6Card["badgeVariant"] }
> = {
  team: { descriptionKey: "teamCard", status: "available", badgeVariant: "success" },
  profile: { descriptionKey: "profileCard", status: "available", badgeVariant: "success" },
  workspace: { descriptionKey: "workspaceCard", status: "available", badgeVariant: "success" },
  billing: { descriptionKey: "billingCard", status: "requiresConfiguration", badgeVariant: "warning" },
  creditHistory: { descriptionKey: "creditHistoryCard", status: "available", badgeVariant: "success" },
  plans: { descriptionKey: "plansCard", status: "requiresConfiguration", badgeVariant: "warning" },
  integrations: { descriptionKey: "integrationsCard", status: "comingSoon", badgeVariant: "neutral" },
  privacy: { descriptionKey: "privacyCard", status: "available", badgeVariant: "success" },
};

export function mapSettingsToV6Cards({
  t,
}: {
  t: (key: string) => string;
}): SettingsV6Card[] {
  return settingsTabs.map((tab) => {
    const meta = cardMeta[tab.id];
    return {
      id: tab.id,
      title: t(tab.labelKey),
      description: t(`v6.${meta.descriptionKey}`),
      badge: t(`v6.statuses.${tab.enabled ? meta.status : "comingSoon"}`),
      badgeVariant: tab.enabled ? meta.badgeVariant : "neutral",
      actionLabel: t(`v6.actions.${tab.enabled ? meta.status : "comingSoon"}`),
      enabled: tab.enabled,
      href: `/settings?tab=${tab.id}`,
    };
  });
}
