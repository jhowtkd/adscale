import { settingsTabs, type SettingsTabId } from "@/app/(dashboard)/settings/settings-tabs";
import type { SettingsV6Card } from "./settings-v6-types";

const cardMeta: Record<
  SettingsTabId,
  { icon: string; descriptionKey: string; status: "available" | "requiresConfiguration" | "comingSoon"; badgeVariant: SettingsV6Card["badgeVariant"] }
> = {
  team: { icon: "👥", descriptionKey: "teamCard", status: "available", badgeVariant: "success" },
  profile: { icon: "👤", descriptionKey: "profileCard", status: "available", badgeVariant: "success" },
  workspace: { icon: "🖥", descriptionKey: "workspaceCard", status: "available", badgeVariant: "success" },
  billing: { icon: "💳", descriptionKey: "billingCard", status: "requiresConfiguration", badgeVariant: "warning" },
  creditHistory: { icon: "📊", descriptionKey: "creditHistoryCard", status: "available", badgeVariant: "success" },
  plans: { icon: "📦", descriptionKey: "plansCard", status: "requiresConfiguration", badgeVariant: "warning" },
  integrations: { icon: "🔌", descriptionKey: "integrationsCard", status: "comingSoon", badgeVariant: "neutral" },
  privacy: { icon: "🔒", descriptionKey: "privacyCard", status: "available", badgeVariant: "success" },
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
      icon: meta.icon,
      href: `/settings?tab=${tab.id}`,
    };
  });
}
