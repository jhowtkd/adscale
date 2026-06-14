"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import Panel from "@/components/layout/Panel";

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
}

const ranges = ["7D", "30D", "90D"] as const;

export default function CreditChart({ data }: CreditChartProps) {
  const t = useTranslations("dashboard.creditChart");
  const locale = useLocale();
  const [range, setRange] = useState<(typeof ranges)[number]>("7D");
  const filteredData = data.slice(-parseInt(range));
  const maxValue = Math.max(...filteredData.map((d) => d.used), 1);

  return (
    <Panel padding="none">
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-6 py-4">
        <h2 className="product-section-title text-base text-[var(--text-primary)]">{t("title")}</h2>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              aria-label={t("rangeAria", { range: r })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-200",
                range === r
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[240px] min-h-[240px] w-full min-w-0 p-6">
        {filteredData.length === 0 || maxValue === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            {t("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <BarChart data={filteredData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date) =>
                  new Date(date).toLocaleDateString(locale, { weekday: "short" })
                }
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border-dim)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
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
