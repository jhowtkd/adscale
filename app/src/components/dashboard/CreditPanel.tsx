"use client";
import Link from "next/link";

interface CreditPanelProps {
  remaining: number;
  total: number;
  planKey: string | null;
  renewalDate?: string;
}

export default function CreditPanel({ remaining, total, planKey, renewalDate }: CreditPanelProps) {
  const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0;
  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Créditos</h3>
        <Link href="/settings?tab=billing" className="text-xs text-[#4a4a52] hover:text-[#2fb67d] transition-colors">Upgrade</Link>
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-2xl font-bold font-mono text-[#e8e8ec]">{remaining}</span>
            <span className="text-sm text-[#4a4a52] ml-1">/ {total.toLocaleString()}</span>
          </div>
          <span className="text-xs text-[#2fb67d]">{percentage}%</span>
        </div>
        <div className="h-1 rounded-[2px] bg-[#1a1a24] overflow-hidden">
          <div className="h-full rounded-[2px] bg-[#2fb67d] transition-all" style={{ width: `${percentage}%` }} />
        </div>
        <div className="flex justify-between mt-2.5 text-xs text-[#4a4a52]">
          <span className="capitalize">Plano {planKey ?? "Free"}</span>
          {renewalDate && <span>Renova em {renewalDate}</span>}
        </div>
      </div>
    </div>
  );
}
