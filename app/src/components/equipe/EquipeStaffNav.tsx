// Internal Equipe console links, rendered only for internal staff (#554).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEquipeStaffAccess } from "@/lib/hooks/use-equipe-staff";
import { cn } from "@/lib/utils";

export default function EquipeStaffNav() {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");
  const { data: staffAccess } = useEquipeStaffAccess();

  if (staffAccess?.allowed !== true) return null;

  const items = [
    { href: "/admin/equipe/exceptions", label: tNav("equipeExceptions") },
    { href: "/admin/equipe/accounts", label: tNav("equipeAccounts") },
    { href: "/admin/equipe/quality", label: tNav("equipeQuality") },
  ];
  return (
    <>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}
