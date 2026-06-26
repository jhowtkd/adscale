"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import Panel from "@/components/layout/Panel";
import type { CreditChartRange } from "@/server/repositories/dashboard";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);
const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false },
);

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
  const isWeekly = range === "90";

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
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date) =>
                  new Date(date).toLocaleDateString(locale, {
                    ...(isWeekly
                      ? { month: "short", day: "numeric" }
                      : { weekday: range === "7" ? "short" : undefined, day: "numeric" }),
                  })
                }
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border-dim)" }}
                tickLine={false}
                interval={range === "30" ? 4 : range === "90" ? 1 : 0}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, maxValue]}
              />
              <Tooltip
                cursor={{ fill: "var(--accent-green-dim)" }}
                contentStyle={{
                  background: "var(--surface-base)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "13px",
                }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="used" fill="var(--accent-green)" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
