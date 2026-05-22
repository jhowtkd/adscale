"use client";

import { Sparkles, ImageIcon, FolderOpen, Download, AlertTriangle } from "lucide-react";
import type { ActivityItem } from "@/lib/mock-data";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";

const activityIcons: Record<ActivityItem["type"], typeof Sparkles> = {
  plan: Sparkles,
  derivation: ImageIcon,
  campaign: FolderOpen,
  export: Download,
  alert: AlertTriangle,
};

const activityIconColors: Record<ActivityItem["type"], string> = {
  plan: "var(--accent-mint)",
  derivation: "var(--accent-mint)",
  campaign: "var(--accent-mint)",
  export: "var(--accent-mint)",
  alert: "var(--accent-amber)",
};

const activityIconBgColors: Record<ActivityItem["type"], string> = {
  plan: "var(--accent-mint-dim)",
  derivation: "var(--accent-mint-dim)",
  campaign: "var(--accent-mint-dim)",
  export: "var(--accent-mint-dim)",
  alert: "rgba(212,160,23,0.12)",
};

interface ActivityFeedPanelProps {
  activityFeed: ActivityItem[];
  isLoading: boolean;
  isError: boolean;
}

export function ActivityFeedPanel({ activityFeed, isLoading, isError }: ActivityFeedPanelProps) {
  const t = useTranslations("common");

  return (
    <div
      className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 sm:p-6 animate-fade-in"
      style={{ animationDelay: "500ms" }}
    >
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">
        {t("activityFeed")}
      </h2>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-full bg-[var(--surface-raised)] animate-pulse" />
              <div className="flex-1 h-4 bg-[var(--surface-raised)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {t("failedLoadActivity")}
        </p>
      ) : activityFeed.length > 0 ? (
        <div className="space-y-4">
          {activityFeed.slice(0, 5).map((item, index) => {
            const Icon = activityIcons[item.type];
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 animate-fade-in"
                style={{ animationDelay: `${600 + index * 60}ms` }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ backgroundColor: activityIconBgColors[item.type] }}
                >
                  <Icon
                    size={14}
                    style={{ color: activityIconColors[item.type] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] leading-snug">
                    {item.message}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
                  {(() => {
                    const d = formatDistanceToNow(new Date(item.timestamp), { addSuffix: false });
                    return d
                      .replace("about ", "")
                      .replace("less than a minute ago", "just now")
                      .replace(/ minutes? ago/, "m ago")
                      .replace(/ hours? ago/, "h ago")
                      .replace(/ days? ago/, "d ago")
                      .replace(/ weeks? ago/, "w ago")
                      .replace(/ months? ago/, "mo ago");
                  })()}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          {t("noRecentActivity")}
        </p>
      )}

      {activityFeed.length > 5 && (
        <button className="mt-4 text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors">
          {t("showMore")}
        </button>
      )}
    </div>
  );
}
