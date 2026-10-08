"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Kanban, Lightbulb, Target } from "lucide-react";

// The three client destinations. One shared component so AppSidebar and
// MobileMoreSheet list them identically.
// The chosen ?account= carries over, so the account survives navigation
// between the screens; the screens re-validate it on arrival.

export const EQUIPE_NAV_LINKS = [
  { href: "/pipeline", labelKey: "pipeline", Icon: Kanban },
  { href: "/ideas", labelKey: "ideas", Icon: Lightbulb },
  { href: "/goals", labelKey: "goals", Icon: Target },
] as const;

export function useEquipeNavLinks() {
  const tNav = useTranslations("navigation");
  const searchParams = useSearchParams();
  const account = searchParams.get("account");
  return EQUIPE_NAV_LINKS.map(({ href, labelKey, Icon }) => ({
    href: account ? `${href}?account=${account}` : href,
    label: tNav(labelKey),
    Icon,
  }));
}
