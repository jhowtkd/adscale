"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type AccountStatusBadgeVariant = "demo" | "tester";

const badgeStyles: Record<AccountStatusBadgeVariant, string> = {
  demo: "border border-[var(--neutral-border)] bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  tester:
    "border border-[var(--neutral-border)] bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
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
      title={t("badgeAriaLabel")}
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
