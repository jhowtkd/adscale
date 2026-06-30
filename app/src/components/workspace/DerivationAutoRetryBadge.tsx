"use client";

import { useTranslations } from "next-intl";
import { shouldShowAutoRetryBadge } from "@/lib/derivation-display";

interface DerivationAutoRetryBadgeProps {
  derivation: {
    autoRetryAttempted?: boolean;
    autoRetryReason?: string | null;
  };
  className?: string;
}

export function DerivationAutoRetryBadge({
  derivation,
  className,
}: DerivationAutoRetryBadgeProps) {
  const t = useTranslations("derivation");

  if (!shouldShowAutoRetryBadge(derivation)) {
    return null;
  }

  const title = derivation.autoRetryReason
    ? t("autoRetryBadgeHint", { codes: derivation.autoRetryReason })
    : t("autoRetryBadgeHintGeneric");

  return (
    <span
      className={
        className ??
        "inline-flex items-center rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400"
      }
      title={title}
    >
      {t("autoRetryBadge")}
    </span>
  );
}
