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
        "group relative block overflow-hidden rounded-[var(--radius-control)] p-[1.5px]",
        "transition-transform hover:scale-[1.01]"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[var(--radius-control)] opacity-90"
        style={{
          background:
            "conic-gradient(from 120deg, #ff5c5c, #ffb020, #5cff8d, #5cb8ff, #c45cff, #ff5c5c)",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1.5px",
        }}
      />
      <span
        className={cn(
          "relative flex flex-col gap-0.5 rounded-[calc(var(--radius-control)-1px)] px-3 py-2.5",
          "bg-[var(--surface-raised)]",
          isActive && "bg-[var(--accent-primary-subtle)]"
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
