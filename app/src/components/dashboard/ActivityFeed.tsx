"use client";

import { Check, Zap, Upload, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import Panel from "@/components/layout/Panel";

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons: Record<string, React.ReactNode> = {
  derivation_approved: <Check size={14} />,
  derivations_generated: <Zap size={14} />,
  creative_uploaded: <Upload size={14} />,
  invite_accepted: <Users size={14} />,
};

const activityColors: Record<string, string> = {
  derivation_approved: "text-[var(--success-text)]",
  derivations_generated: "text-[var(--warning-text)]",
  creative_uploaded: "text-[var(--success-text)]",
  invite_accepted: "text-[var(--accent-secondary)]",
};

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const t = useTranslations("dashboard.activity");

  const formatTimeAgo = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
    if (diff < 60) return t("now");
    if (diff < 3600) return t("minutesAgo", { count: Math.floor(diff / 60) });
    if (diff < 86400) return t("hoursAgo", { count: Math.floor(diff / 3600) });
    return t("daysAgo", { count: Math.floor(diff / 86400) });
  };

  return (
    <Panel padding="none">
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-5 py-4">
        <h2 className="product-section-title text-sm text-[var(--text-primary)]">{t("title")}</h2>
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
          {t("seeMore")} →
        </span>
      </div>
      <div className="max-h-[300px] divide-y divide-[var(--border-dim)] overflow-y-auto">
        {activities.slice(0, 5).map((activity) => (
          <div
            key={activity.id}
            className="flex gap-3 px-5 py-3 transition-colors duration-200 last:border-b-0 hover:bg-[var(--surface-raised)]/50"
          >
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)]",
                activityColors[activity.type] ?? "text-[var(--text-secondary)]",
              )}
            >
              {activityIcons[activity.type] ?? <Check size={14} />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs leading-snug text-[var(--text-secondary)]">
                {activity.description}
              </div>
              <div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                {formatTimeAgo(activity.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
