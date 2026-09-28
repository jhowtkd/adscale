"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Kanban, Lightbulb, Target } from "lucide-react";
import { useEquipeEnabled } from "@/lib/equipe/use-equipe";

// The three client destinations, rendered only for pilot workspaces. One
// shared component so AppSidebar and MobileMoreSheet gate identically.
// The chosen ?account= carries over, so the account survives navigation
// between the screens; the screens re-validate it on arrival.

export const EQUIPE_NAV_LINKS = [
  { href: "/pipeline", labelKey: "pipeline", Icon: Kanban },
  { href: "/ideas", labelKey: "ideas", Icon: Lightbulb },
  { href: "/goals", labelKey: "goals", Icon: Target },
] as const;

export function useEquipeNavLinks() {
  const enabled = useEquipeEnabled();
  const tNav = useTranslations("navigation");
  const searchParams = useSearchParams();
  if (!enabled) return null;
  const account = searchParams.get("account");
  return EQUIPE_NAV_LINKS.map(({ href, labelKey, Icon }) => ({
    href: account ? `${href}?account=${account}` : href,
    label: tNav(labelKey),
    Icon,
  }));
}
