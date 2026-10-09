"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, LogOut, Megaphone, Settings, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useEquipeNavLinks } from "@/components/equipe/EquipeNavLinks";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rail shell lists Pipeline in its header selector, so its sheet leaves it out. */
  omitPipeline?: boolean;
  /** Links the host adds after Docs (the rail shell's staff consoles, for instance). */
  extraItems?: MobileMoreItem[];
  /** The accessible name of the close button, for a host that has the translation (the classic sheet keeps its own). */
  closeLabel?: string;
}

export type MobileMoreItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: string;
};

export default function MobileMoreSheet({ open, onOpenChange, omitPipeline = false, extraItems = [], closeLabel }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("navigation");
  const tServedAds = useTranslations("servedAds");
  const equipeLinks = useEquipeNavLinks();

  // The phone's bar lists Conversa · Criações · Biblioteca · Mais; everything else lives here. The brands are not a tab:
  // the brand menu on the top bar switches them and leads to the Brand Kit.
  const items: MobileMoreItem[] = [
    ...equipeLinks
      .filter(({ href }) => !omitPipeline || !href.startsWith("/pipeline"))
      .map(({ href, label, Icon }) => ({
        href,
        label,
        icon: Icon,
        active: pathname.startsWith(href),
      })),
    {
      href: "/served-ads",
      label: tServedAds("title"),
      icon: Megaphone,
      active: pathname.startsWith("/served-ads"),
    },
    {
      href: "/settings",
      label: tNav("config"),
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
    { href: "/docs", label: tNav("docs"), icon: BookOpen, active: pathname.startsWith("/docs") },
    ...extraItems,
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]" closeLabel={closeLabel}>
        <SheetHeader>
          <SheetTitle>{tNav("more")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-1 pt-2">
          {items.map(({ href, label, icon: Icon, active, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
              )}
            >
              <Icon
                size={18}
                aria-hidden="true"
                className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--warning-text)]">
                  {badge}
                </span>
              ) : null}
            </Link>
          ))}
          <button type="button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
            <LogOut size={18} aria-hidden="true" className="text-[var(--utility-icon)]" />
            {tNav("logout")}
          </button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
