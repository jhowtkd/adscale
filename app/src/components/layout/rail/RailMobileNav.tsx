"use client";

// Mobile bottom bar of the rail shell: Conversa, Criações, Biblioteca and Mais. Ideias, Metas, Pipeline, the served ads,
// settings and docs live under "Mais". Same landmark name as the classic mobile bar, so the shell geometry checks apply to both.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Library, MessageCircle, MessageSquare, MoreHorizontal, ShieldCheck, type LucideIcon } from "lucide-react";
import MobileMoreSheet, { type MobileMoreItem } from "@/components/layout/MobileMoreSheet";
import { useEquipeStaffAccess } from "@/lib/hooks/use-equipe-staff";
import { usePlatformOwnerAccess } from "@/lib/hooks/use-platform-owner";
import { cn } from "@/lib/utils";
import { railDestinationFor, type RailDestinationId } from "./rail-nav";

const TAB =
  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-2 text-[10px] font-medium leading-tight outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
const ACTIVE = "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]";

export default function RailMobileNav() {
  const t = useTranslations("navigation.rail");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const tLibrary = useTranslations("library");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: staffAccess } = useEquipeStaffAccess();
  const { data: ownerAccess } = usePlatformOwnerAccess();
  const active = railDestinationFor(pathname);
  // Mais holds everything the bar does not list, so it lights up for those routes.
  const moreActive = active === null || active === "ideas" || active === "goals";

  const tabs: Array<{ id: RailDestinationId; href: string; label: string; Icon: LucideIcon }> = [
    { id: "conversation", href: "/", label: t("conversation"), Icon: MessageCircle },
    { id: "creations", href: "/campaigns", label: t("creations"), Icon: LayoutGrid },
    { id: "library", href: "/library", label: tLibrary("title"), Icon: Library },
  ];

  // The account menu holds these on desktop; the sheet is its mobile twin.
  const extraItems: MobileMoreItem[] = [
    ...(ownerAccess?.allowed === true
      ? [{ href: "/feedback", label: tNav("feedback"), icon: MessageSquare, active: pathname.startsWith("/feedback") }]
      : []),
    ...(staffAccess?.allowed === true
      ? [
          { href: "/admin/equipe/exceptions", label: tNav("equipeExceptions") },
          { href: "/admin/equipe/accounts", label: tNav("equipeAccounts") },
          { href: "/admin/equipe/quality", label: tNav("equipeQuality") },
        ].map((link) => ({ ...link, icon: ShieldCheck, active: pathname.startsWith(link.href) }))
      : []),
  ];

  return (
    <>
      <nav
        className="layer-shell-floating fixed bottom-0 left-0 right-0 z-[calc(var(--layer-shell-floating)+2)] grid grid-cols-4 border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Primary mobile navigation"
        data-testid="rail-mobile-nav"
      >
        {tabs.map(({ id, href, label, Icon }) => (
          <Link key={id} href={href} aria-current={active === id ? "page" : undefined} className={cn(TAB, active === id ? ACTIVE : "text-[var(--text-secondary)]")}>
            <Icon size={18} aria-hidden="true" className={active === id ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"} />
            <span className="max-w-full text-center whitespace-normal">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn(TAB, moreActive ? ACTIVE : "text-[var(--text-secondary)]")}
        >
          <MoreHorizontal size={18} aria-hidden="true" className={moreActive ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"} />
          <span className="max-w-full text-center whitespace-normal">{tNav("more")}</span>
        </button>
      </nav>
      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} omitPipeline extraItems={extraItems} closeLabel={tCommon("close")} />
    </>
  );
}
