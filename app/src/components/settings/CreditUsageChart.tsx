"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Daily usage bars of the credit history. CreditHistoryTab lazy-loads this
 * whole module: wrapping each recharts component in its own `next/dynamic`
 * made recharts loop ("Maximum update depth exceeded") once the chart had data.
 */
export default function CreditUsageChart({
  data,
}: {
  data: Array<{ date: string; amount: number }>;
}) {
  const t = useTranslations("creditHistory");
  const tc = useTranslations("common");
  const locale = useLocale();

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <BarChart data={data}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
          tickFormatter={(value: string) => {
            const d = new Date(value);
            return d.toLocaleDateString(locale, { day: "numeric", month: "numeric" });
          }}
        />
        <YAxis tick={{ fontSize: 12, fill: "var(--text-secondary)" }} />
        <Tooltip
          contentStyle={{
            background: "var(--surface-base)",
            border: "1px solid var(--border-dim)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: unknown) => [`${value} ${tc("credits")}`, t("usage")]}
        />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.date} fill="var(--text-muted)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
