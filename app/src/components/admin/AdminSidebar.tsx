"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
};

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "overview",
    items: [{ href: "/admin", labelKey: "dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "platform",
    items: [{ href: "/admin/users", labelKey: "users", icon: Users }],
  },
  {
    labelKey: "quality",
    items: [
      { href: "/admin/quality/queue", labelKey: "qualityQueue" },
      { href: "/admin/quality/candidates", labelKey: "qualityCandidates" },
      { href: "/admin/quality/calibration", labelKey: "qualityCalibration" },
      { href: "/admin/quality/impact", labelKey: "qualityImpact" },
      { href: "/admin/quality/reports", labelKey: "qualityReports" },
      { href: "/admin/quality/coverage", labelKey: "qualityCoverage" },
      { href: "/admin/quality/trends", labelKey: "qualityTrends" },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/admin/feedbacks", labelKey: "feedbacks" },
      { href: "/admin/analytics", labelKey: "analytics" },
      { href: "/admin/sessions", labelKey: "sessions" },
    ],
  },
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || pathname === "/admin/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon?: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
      )}
    >
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {label}
    </Link>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border-dim)] bg-[var(--surface-base)]">
      <div className="border-b border-[var(--border-dim)] px-4 py-5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{t("brand")}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              {t(group.labelKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  active={isNavItemActive(pathname, item.href)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
