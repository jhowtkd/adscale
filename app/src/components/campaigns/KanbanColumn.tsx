"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/lib/mock-data";
import KanbanCard from "./KanbanCard";

interface KanbanColumnProps {
  title: string;
  count: number;
  campaigns: Campaign[];
  accentColor: string;
}

export default function KanbanColumn({
  title,
  count,
  campaigns,
  accentColor,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)]",
        "min-w-[260px] w-[260px] flex-shrink-0"
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-dim)] rounded-t-xl"
        style={{ borderTop: `3px solid ${accentColor}` }}
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
        <span
          className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[11px] font-bold"
          style={{
            backgroundColor: `${accentColor}20`,
            color: accentColor,
          }}
        >
          {count}
        </span>
      </div>

      {/* Drop zone / Card list */}
      <div
        className={cn(
          "flex-1 p-2.5 space-y-2 overflow-y-auto",
          "min-h-[120px]",
          "transition-colors duration-200"
        )}
        style={{ maxHeight: "calc(100vh - 320px)" }}
      >
        {campaigns.map((campaign, index) => (
          <KanbanCard key={campaign.id} campaign={campaign} index={index} />
        ))}
      </div>
    </div>
  );
}
