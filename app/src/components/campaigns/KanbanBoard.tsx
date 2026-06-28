"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import KanbanColumn from "./KanbanColumn";

interface KanbanBoardProps {
  campaigns: UiCampaign[];
}

const columnConfig = [
  {
    key: "draft",
    titleKey: "kanban.draft" as const,
    statuses: ["draft"],
    accentColor: "var(--status-draft-dot)",
  },
  {
    key: "inProgress",
    titleKey: "kanban.inProgress" as const,
    statuses: ["active", "queued", "processing", "generating"],
    accentColor: "var(--status-active-dot)",
  },
  {
    key: "review",
    titleKey: "kanban.review" as const,
    statuses: ["completed"],
    accentColor: "var(--status-completed-dot)",
  },
  {
    key: "approved",
    titleKey: "kanban.approved" as const,
    statuses: ["approved"],
    accentColor: "var(--status-approved-dot)",
  },
  {
    key: "rejected",
    titleKey: "kanban.rejected" as const,
    statuses: ["rejected", "failed"],
    accentColor: "var(--status-rejected-dot)",
  },
];

export default function KanbanBoard({ campaigns }: KanbanBoardProps) {
  const t = useTranslations("campaign");

  const columns = useMemo(() => {
    const byStatus = new Map<string, UiCampaign[]>();
    for (const c of campaigns) {
      const bucket = byStatus.get(c.status) ?? [];
      bucket.push(c);
      byStatus.set(c.status, bucket);
    }
    for (const list of byStatus.values()) {
      list.sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime()
      );
    }
    return columnConfig.map((col) => {
      const seen = new Set<string>();
      const colCampaigns: UiCampaign[] = [];
      for (const status of col.statuses) {
        const bucket = byStatus.get(status) ?? [];
        for (const c of bucket) {
          if (!seen.has(c.id)) {
            colCampaigns.push(c);
            seen.add(c.id);
          }
        }
      }
      return {
        ...col,
        title: t(col.titleKey),
        campaigns: colCampaigns,
      };
    });
  }, [campaigns, t]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <KanbanColumn
          key={col.key}
          title={col.title}
          count={col.campaigns.length}
          campaigns={col.campaigns}
          accentColor={col.accentColor}
        />
      ))}
    </div>
  );
}
