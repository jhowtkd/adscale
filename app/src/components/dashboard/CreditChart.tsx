"use client";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
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
  const maxValue = Math.max(...filteredData.map(d => d.used), 1);

  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a24]">
        <h3 className="text-base font-semibold text-[#e8e8ec]">Créditos por Semana</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={cn("px-3 py-1.5 text-sm rounded-[4px] transition-colors duration-200",
                range === r ? "bg-[#1a1a24] text-[#e8e8ec]" : "text-[#b4b4be] hover:text-[#e8e8ec]")}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6 h-[240px]">
        {filteredData.length === 0 || maxValue === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#b4b4be]">
            Sem dados de uso de créditos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString("pt-BR", { weekday: "short" })}
                tick={{ fill: "#b4b4be", fontSize: 12 }} axisLine={{ stroke: "#1a1a24" }} tickLine={false} />
              <YAxis tick={{ fill: "#b4b4be", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(47,182,125,0.05)" }}
                contentStyle={{ background: "#0e0e14", border: "1px solid #1a1a24", borderRadius: "4px", fontSize: "13px" }}
                labelStyle={{ color: "#e8e8ec" }}
                itemStyle={{ color: "#b4b4be" }}
              />
              <Bar dataKey="used" fill="#2fb67d" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
