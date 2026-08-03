"use client";

import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import Panel from "@/components/layout/Panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreditPanelProps {
  remaining: number;
  total: number;
  planKey: string | null;
  renewalDate?: string;
}

export default function CreditPanel({ remaining, total, planKey, renewalDate }: CreditPanelProps) {
  const t = useTranslations("dashboard.creditsPanel");
  const locale = useLocale();
  const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const isLow = percentage <= 20;

  return (
    <Panel padding="none">
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-5 py-4">
        <h2 className="product-section-title text-sm text-[var(--text-primary)]">{t("title")}</h2>
        <Button
          variant="default"
          size="xs"
          render={<Link href="/settings?tab=billing" />}
          nativeButton={false}
        >
          {t("upgrade")}
        </Button>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <span className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">{remaining}</span>
            <span className="ml-1 font-mono text-xs text-[var(--text-secondary)]">
              / {total.toLocaleString(locale)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isLow ? (
              <AlertTriangle size={14} className="text-[var(--danger-text)]" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "text-xs font-mono font-bold",
                isLow ? "text-[var(--danger-text)]" : "text-[var(--success-text)]",
              )}
              aria-label={isLow ? t("lowBalance") : undefined}
            >
              {percentage}%
            </span>
          </div>
        </div>
        {isLow ? (
          <p className="mb-2 text-xs font-medium text-[var(--danger-text)]">{t("lowBalance")}</p>
        ) : null}
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isLow ? "bg-[var(--danger-bg)]" : "bg-[var(--success-bg)]",
            )}
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={remaining}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={t("title")}
          />
        </div>
        <div className="mt-3 flex justify-between font-mono text-xs text-[var(--text-secondary)]">
          <span className="uppercase tracking-wider">{t("plan", { plan: planKey ?? "Free" })}</span>
          {renewalDate ? <span>{t("renewsOn", { date: renewalDate })}</span> : null}
        </div>
      </div>
    </Panel>
  );
}
