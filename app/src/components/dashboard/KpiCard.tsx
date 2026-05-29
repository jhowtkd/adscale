"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
}

export default function KpiCard({ label, value, change, changeLabel }: KpiCardProps) {
  const isPositive = change !== undefined ? change >= 0 : true;
  const displayValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  const showChange = change !== undefined && changeLabel !== undefined;
  return (
    <div className="group relative glass-card rounded-lg p-5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent-green)]/5">
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.2em] font-mono mb-4">{label}</div>
      <div className="text-[28px] sm:text-[32px] font-bold text-[var(--text-primary)] font-pixel leading-none tracking-tight">
        {displayValue}
      </div>
      {showChange && (
        <div className={cn("flex items-center gap-1.5 text-xs mt-3 font-mono", isPositive ? "text-[var(--accent-green)]" : "text-[var(--accent-rose)]")}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{isPositive ? "↑" : "↓"} {Math.abs(change)}% {changeLabel}</span>
        </div>
      )}
    </div>
  );
}
