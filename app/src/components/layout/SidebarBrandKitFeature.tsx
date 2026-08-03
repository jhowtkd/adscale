"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export default function SidebarBrandKitFeature() {
  const tNav = useTranslations("navigation");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsTab = searchParams.get("tab");
  const isActive =
    pathname.startsWith("/brand-kit") ||
    (pathname.startsWith("/settings") &&
      (settingsTab === "brandKit" || settingsTab === "brandTraining"));

  return (
    <Link
      href="/brand-kit"
      data-testid="sidebar-brand-kit-feature"
      className={cn(
        "block rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] transition-colors",
        "hover:border-[var(--selection-border)] hover:bg-[var(--surface-base)]",
        isActive && "border-[var(--selection-border)] bg-[var(--selection-bg)]"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "flex flex-col gap-0.5 rounded-[calc(var(--radius-control)-1px)] px-3 py-2.5",
          isActive && "text-[var(--selection-text)]"
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {tNav("brandKit")}
          </span>
          <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--warning-text)]">
            {tNav("brandKitBeta")}
          </span>
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">{tNav("brandKitHint")}</span>
      </span>
    </Link>
  );
}
