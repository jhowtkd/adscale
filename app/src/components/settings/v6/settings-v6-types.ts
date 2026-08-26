export type SettingsV6BadgeVariant = "success" | "warning" | "neutral";

export type SettingsV6Card = {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeVariant: SettingsV6BadgeVariant;
  actionLabel: string;
  enabled: boolean;
  href: string;
};

export type SettingsV6Labels = {
  sectionLabel: string;
  title: string;
  subtitle: string;
  openCard: string;
  unavailable: string;
};
