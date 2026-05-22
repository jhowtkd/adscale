"use client";

import { useTranslations } from "next-intl";

interface CreditUsagePanelProps {
  creditsUsed: number;
  creditsTotal: number;
  creditPercent: number;
}

export function CreditUsagePanel({ creditsUsed, creditsTotal, creditPercent }: CreditUsagePanelProps) {
  const t = useTranslations("common");

  return (
    <div
      className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 sm:p-6 animate-fade-in"
      style={{ animationDelay: "400ms" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          {t("creditUsage")}
        </h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
          {t("thisMonth")}
        </span>
      </div>

      {/* Chart placeholder */}
      <div className="h-[120px] mb-4 flex items-center justify-center rounded-md bg-[var(--surface-raised)]">
        <p className="text-sm text-[var(--text-muted)]">{t("noUsageData")}</p>
      </div>

      {/* Summary */}
      <p className="text-sm text-[var(--text-secondary)] mb-3">
        <span className="font-medium text-[var(--text-primary)]">
          {creditsUsed}
        </span>{" "}
        {t("of")}{" "}
        <span className="font-medium text-[var(--text-primary)]">
          {creditsTotal}
        </span>{" "}
        {t("creditsUsedThisMonth")}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-[var(--border-dim)] overflow-hidden mb-4">
        <div
          className="h-full rounded-full gradient-progress transition-all duration-600"
          style={{ width: `${creditPercent}%`, transitionDelay: "500ms" }}
        />
      </div>

      <button className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors">
        {t("upgradePlan")}
      </button>
    </div>
  );
}
