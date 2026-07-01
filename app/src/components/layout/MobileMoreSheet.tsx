"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutTemplate, Palette, Settings } from "lucide-react";
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

export default function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");

  const items = [
    {
      href: "/templates",
      label: tNav("templates"),
      icon: LayoutTemplate,
      active: pathname.startsWith("/templates"),
    },
    {
      href: "/restyling",
      label: tNav("restyling"),
      icon: Palette,
      active: pathname.startsWith("/restyling"),
    },
    {
      href: "/settings",
      label: tNav("settings"),
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ] as const;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{tNav("more")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-1 pt-2">
          {items.map(({ href, label, icon: Icon, active }) => (
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
              <span>{label}</span>
            </Link>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
