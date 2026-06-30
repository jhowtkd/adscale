"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type AccountStatusBadgeVariant = "demo" | "tester";

const badgeStyles: Record<AccountStatusBadgeVariant, string> = {
  demo: "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]",
  tester:
    "border border-[color-mix(in_oklch,var(--accent-secondary)_35%,transparent)] bg-[color-mix(in_oklch,var(--accent-secondary)_14%,transparent)] text-[var(--accent-secondary)]",
};

export default function AccountStatusBadge({
  variant,
  className,
}: {
  variant: AccountStatusBadgeVariant;
  className?: string;
}) {
  const namespace = variant === "demo" ? "demoMode" : "testerMode";
  const t = useTranslations(namespace);

  return (
    <span
      aria-label={t("badgeAriaLabel")}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        badgeStyles[variant],
        className
      )}
    >
      {t("badge")}
    </span>
  );
}
