"use client";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

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

  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Créditos por Semana</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={cn("px-2 py-1 text-[11px] rounded-[4px] transition-colors",
                range === r ? "bg-[#1a1a24] text-[#e8e8ec]" : "text-[#4a4a52] hover:text-[#6e6e7a]")}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filteredData}>
            <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString("pt-BR", { weekday: "short" })}
              tick={{ fill: "#4a4a52", fontSize: 10 }} axisLine={{ stroke: "#1a1a24" }} tickLine={false} />
            <YAxis tick={{ fill: "#4a4a52", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#0e0e14", border: "1px solid #1a1a24", borderRadius: "4px", fontSize: "12px" }}
              labelStyle={{ color: "#e8e8ec" }} itemStyle={{ color: "#b4b4be" }} />
            <Bar dataKey="used" fill="#2fb67d" radius={[2, 2, 0, 0]} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
