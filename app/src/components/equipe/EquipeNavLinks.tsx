"use client";

import { useTranslations } from "next-intl";
import { Kanban, Lightbulb, Target } from "lucide-react";
import { useEquipeEnabled } from "@/lib/equipe/use-equipe";

// The three client destinations, rendered only for pilot workspaces. One
// shared component so AppSidebar and MobileMoreSheet gate identically.

export const EQUIPE_NAV_LINKS = [
  { href: "/pipeline", labelKey: "pipeline", Icon: Kanban },
  { href: "/ideas", labelKey: "ideas", Icon: Lightbulb },
  { href: "/goals", labelKey: "goals", Icon: Target },
] as const;

export function useEquipeNavLinks() {
  const enabled = useEquipeEnabled();
  const tNav = useTranslations("navigation");
  if (!enabled) return null;
  return EQUIPE_NAV_LINKS.map(({ href, labelKey, Icon }) => ({
    href,
    label: tNav(labelKey),
    Icon,
  }));
}
