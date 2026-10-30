"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Weekly quality trend. HumanQualityCorpusPanel lazy-loads this whole module:
 * recharts must not be wrapped component by component in `next/dynamic`
 * (see CreditUsageChart).
 */
export default function QualityTrendChart({
  data,
  onSelectBucket,
}: {
  data: Array<{
    bucketKey: string;
    meanHumanVisualScore: number | null;
    factualPassRatePct: number | null;
  }>;
  onSelectBucket: (bucketKey: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={280} minWidth={0}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
        onClick={(state) => {
          const label = (state as { activeLabel?: string }).activeLabel;
          if (label) {
            onSelectBucket(label);
          }
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
        <XAxis
          dataKey="bucketKey"
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border-dim)" }}
          tickLine={false}
        />
        <YAxis
          yAxisId="visual"
          domain={[0, 100]}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: "Visual score",
            angle: -90,
            position: "insideLeft",
            fill: "var(--text-muted)",
            fontSize: 10,
          }}
        />
        <YAxis
          yAxisId="factual"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: "Factual pass %",
            angle: 90,
            position: "insideRight",
            fill: "var(--text-muted)",
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-base)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius-md)",
            fontSize: "12px",
          }}
          labelStyle={{ color: "var(--text-primary)" }}
          itemStyle={{ color: "var(--text-secondary)" }}
          formatter={(value, name) => {
            if (name === "factualPassRatePct" && typeof value === "number") {
              return [`${value.toFixed(0)}%`, "Factual pass rate"];
            }
            if (name === "meanHumanVisualScore" && typeof value === "number") {
              return [value.toFixed(1), "Mean visual score"];
            }
            return [value ?? "—", String(name)];
          }}
        />
        <Line
          yAxisId="visual"
          type="monotone"
          dataKey="meanHumanVisualScore"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={{ r: 4, cursor: "pointer" }}
          connectNulls
        />
        <Line
          yAxisId="factual"
          type="monotone"
          dataKey="factualPassRatePct"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={{ r: 4, cursor: "pointer" }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
