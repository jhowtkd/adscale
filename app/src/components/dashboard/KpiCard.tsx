"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  change: number;
  changeLabel: string;
}

export default function KpiCard({ label, value, change, changeLabel }: KpiCardProps) {
  const isPositive = change >= 0;
  return (
    <div className="group relative bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] p-5 transition-all hover:border-[#2a2a32] hover:bg-[#12121a]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#2fb67d] opacity-0 group-hover:opacity-100 transition-opacity rounded-l-[4px]" />
      <div className="text-[11px] text-[#4a4a52] uppercase tracking-wider font-medium mb-2.5">{label}</div>
      <div className="text-[32px] font-bold text-[#e8e8ec] font-mono leading-none">{value}</div>
      <div className={cn("flex items-center gap-1 text-xs mt-1.5", isPositive ? "text-[#2fb67d]" : "text-[#ef4444]")}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        <span>{isPositive ? "↑" : "↓"} {Math.abs(change)}% {changeLabel}</span>
      </div>
    </div>
  );
}
