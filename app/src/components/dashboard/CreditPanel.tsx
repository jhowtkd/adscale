"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CreditPanelProps {
  remaining: number;
  total: number;
  planKey: string | null;
  renewalDate?: string;
}

export default function CreditPanel({ remaining, total, planKey, renewalDate }: CreditPanelProps) {
  const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const isLow = percentage <= 20;
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-dim)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Créditos</h3>
        <Link href="/settings?tab=billing" className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-green)] hover:text-[var(--accent-green-light)] transition-colors duration-200">Upgrade</Link>
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-3xl font-bold font-pixel text-[var(--text-primary)] tracking-tight">{remaining}</span>
            <span className="text-xs text-[var(--text-secondary)] ml-1 font-mono">/ {total.toLocaleString()}</span>
          </div>
          <span className={cn(
            "text-xs font-mono font-bold",
            isLow ? "text-[var(--accent-rose)]" : "text-[var(--accent-green)]"
          )}>{percentage}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isLow ? "bg-[var(--accent-rose)]" : "bg-[var(--accent-green)]"
            )} 
            style={{ width: `${percentage}%` }} 
          />
        </div>
        <div className="flex justify-between mt-3 text-[11px] text-[var(--text-secondary)] font-mono">
          <span className="uppercase tracking-wider">Plano {planKey ?? "Free"}</span>
          {renewalDate && <span>Renova em {renewalDate}</span>}
        </div>
      </div>
    </div>
  );
}

