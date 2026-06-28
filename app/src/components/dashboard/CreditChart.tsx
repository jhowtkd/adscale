"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import Panel from "@/components/layout/Panel";
import type { CreditChartRange } from "@/server/repositories/dashboard";

const CreditChartBars = dynamic(() => import("./CreditChartBars"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
      …
    </div>
  ),
});

interface DataPoint {
  date: string;
  used: number;
  remaining: number;
}

interface CreditChartProps {
  data: DataPoint[];
  range: CreditChartRange;
  onRangeChange: (range: CreditChartRange) => void;
  isFetching?: boolean;
}

const rangeOptions: { label: "7D" | "30D" | "90D"; value: CreditChartRange }[] = [
  { label: "7D", value: "7" },
  { label: "30D", value: "30" },
  { label: "90D", value: "90" },
];

export default function CreditChart({ data, range, onRangeChange, isFetching }: CreditChartProps) {
  const t = useTranslations("dashboard.creditChart");
  const locale = useLocale();
  const hasUsage = data.some((point) => point.used > 0);
  const maxValue = Math.max(...data.map((d) => d.used), 1);

  return (
    <Panel padding="none">
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-6 py-4">
        <h2 className="product-section-title text-base text-[var(--text-primary)]">{t("title")}</h2>
        <div className="flex gap-1" aria-busy={isFetching}>
          {rangeOptions.map(({ label, value }) => (
            <button
              type="button"
              key={label}
              onClick={() => onRangeChange(value)}
              aria-pressed={range === value}
              aria-label={t("rangeAria", { range: label })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
                range === value
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[240px] min-h-[240px] w-full min-w-0 p-6">
        {data.length === 0 || !hasUsage ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t("noData")}</p>
            <p className="text-xs text-[var(--text-muted)]">{t("noDataHint")}</p>
          </div>
        ) : (
          <CreditChartBars data={data} range={range} locale={locale} maxValue={maxValue} />
        )}
      </div>
    </Panel>
  );
}
