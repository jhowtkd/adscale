"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutTemplate, Sparkles, type LucideIcon } from "lucide-react";
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
}

type MobileMoreItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: string;
};

export default function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");

  const items: MobileMoreItem[] = [
    {
      href: "/templates",
      label: tNav("templates"),
      icon: LayoutTemplate,
      active: pathname.startsWith("/templates"),
    },
    {
      href: "/assistant",
      label: tNav("creativeIntelligenceAdvanced"),
      icon: Sparkles,
      active: pathname.startsWith("/assistant"),
      badge: "BETA",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{tNav("more")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-1 pt-2">
          {items.map(({ href, label, icon: Icon, active, badge }) => (
            <Link
              key={href}
              href={href}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
              )}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--warning-text)]">
                  {badge}
                </span>
              ) : null}
            </Link>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
