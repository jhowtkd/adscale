import { settingsTabs, type SettingsTabId } from "@/app/(dashboard)/settings/settings-tabs";
import type { SettingsV6Card } from "./settings-v6-types";

const cardMeta: Record<
  SettingsTabId,
  { icon: string; descriptionKey: string; badgeKey: string; badgeVariant: SettingsV6Card["badgeVariant"] }
> = {
  team: { icon: "👥", descriptionKey: "teamCard", badgeKey: "implemented", badgeVariant: "success" },
  profile: { icon: "👤", descriptionKey: "profileCard", badgeKey: "outsideLab", badgeVariant: "neutral" },
  workspace: { icon: "🖥", descriptionKey: "workspaceCard", badgeKey: "outsideLab", badgeVariant: "neutral" },
  billing: { icon: "💳", descriptionKey: "billingCard", badgeKey: "capturePending", badgeVariant: "warning" },
  creditHistory: { icon: "📊", descriptionKey: "creditHistoryCard", badgeKey: "implemented", badgeVariant: "success" },
  plans: { icon: "📦", descriptionKey: "plansCard", badgeKey: "capturePending", badgeVariant: "warning" },
  integrations: { icon: "🔌", descriptionKey: "integrationsCard", badgeKey: "capturePending", badgeVariant: "warning" },
  privacy: { icon: "🔒", descriptionKey: "privacyCard", badgeKey: "implemented", badgeVariant: "success" },
};

export function mapSettingsToV6Cards({
  t,
  tc,
}: {
  t: (key: string) => string;
  tc: (key: string) => string;
}): SettingsV6Card[] {
  return settingsTabs.map((tab) => {
    const meta = cardMeta[tab.id];
    return {
      id: tab.id,
      title: t(tab.labelKey),
      description: t(`v6.${meta.descriptionKey}`),
      badge: tab.enabled ? t(`v6.badges.${meta.badgeKey}`) : tc("comingSoon"),
      badgeVariant: tab.enabled ? meta.badgeVariant : "neutral",
      enabled: tab.enabled,
      icon: meta.icon,
      href: `/settings?tab=${tab.id}`,
    };
  });
}
