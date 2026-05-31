"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false }
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
  { ssr: false }
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
  const [range, setRange] = useState<typeof ranges[number]>("7D");
  const filteredData = data.slice(-parseInt(range));
  const maxValue = Math.max(...filteredData.map(d => d.used), 1);

  return (
    <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-dim)]">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Créditos por Semana</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button type="button" key={r} onClick={() => setRange(r)}
              className={cn("px-3 py-1.5 text-sm rounded-md transition-colors duration-200",
                range === r ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 h-[240px]">
        {filteredData.length === 0 || maxValue === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
            Sem dados de uso de créditos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={filteredData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString("pt-BR", { weekday: "short" })}
                tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={{ stroke: "var(--border-dim)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--accent-green-dim)" }}
                contentStyle={{ background: "var(--surface-base)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius-md)", fontSize: "13px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="used" fill="var(--accent-green)" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
