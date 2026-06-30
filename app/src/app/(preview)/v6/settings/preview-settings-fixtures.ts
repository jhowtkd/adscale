import type { SettingsV6Card, SettingsV6Labels } from "@/components/settings/v6/settings-v6-types";
import { previewSettingsCards } from "../_fixtures/preview-data";

export const previewSettingsLabels: SettingsV6Labels = {
  sectionLabel: "configurações",
  title: "Configurações do workspace",
  subtitle: "Gerencie perfil, equipe, marca, cobrança e integrações em um só lugar",
  openCard: "Abrir →",
  unavailable: "—",
};

const icons: Record<string, string> = {
  Equipe: "👥",
  "Brand Kit": "◇",
  Perfil: "👤",
  Workspace: "🖥",
  Faturamento: "💳",
  Planos: "📦",
};

export const previewSettingsCardsView: SettingsV6Card[] = previewSettingsCards.map((card, index) => ({
  id: `preview-settings-${index}`,
  title: card.title,
  description: card.description,
  badge: card.badge,
  badgeVariant: card.badgeClass,
  enabled: card.enabled,
  icon: icons[card.title] ?? "⚙",
  href: "#",
}));
