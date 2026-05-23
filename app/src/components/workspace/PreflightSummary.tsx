"use client";

import { useState } from "react";
import { BarChart3, ChevronUp, ChevronDown, Lightbulb, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import { usePreflightScore } from "@/lib/hooks/use-preflight";

interface PreflightSummaryProps {
  campaignId: string;
  tBriefing: (key: string, values?: Record<string, string | number | Date>) => string;
}

export default function PreflightSummary({ campaignId, tBriefing }: PreflightSummaryProps) {
  const { data: assets = [] } = useCampaignAssets(campaignId);
  const firstAsset = assets[0];
  const preflight = usePreflightScore(firstAsset?.id ?? null, campaignId);
  const result = preflight.data?.preflight;
  const [expanded, setExpanded] = useState(false);

  if (!result || preflight.data?.status !== "completed") return null;

  const scoreColor =
    result.overallScore >= 80
      ? "text-[var(--accent-teal)] bg-[var(--accent-teal)]/10 border-[var(--accent-teal)]/20"
      : result.overallScore >= 50
        ? "text-[var(--accent-amber)] bg-[var(--accent-amber)]/10 border-[var(--accent-amber)]/20"
        : "text-[var(--accent-rose)] bg-[var(--accent-rose)]/10 border-[var(--accent-rose)]/20";

  return (
    <div className="animate-fade-in" style={{ animationDelay: "540ms" }}>
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className={cn(
          "w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all",
          scoreColor
        )}
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={16} />
          <span className="text-xs font-semibold">
            {tBriefing("preflightSummary")}: {result.overallScore}/100
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3 space-y-2">
          {result.suggestions.slice(0, 3).map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
              <Lightbulb size={12} className="mt-0.5 shrink-0 text-[var(--accent-amber)]" />
              {s}
            </div>
          ))}
          {result.criticalIssues.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-[var(--accent-rose)]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {result.criticalIssues[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
