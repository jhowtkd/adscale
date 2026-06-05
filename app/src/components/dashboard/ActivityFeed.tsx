"use client";
import { Check, Zap, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

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
  derivation_approved: "text-[var(--accent-green)]",
  derivations_generated: "text-[var(--accent-amber)]",
  creative_uploaded: "text-[var(--accent-green)]",
  invite_accepted: "text-[var(--accent-secondary)]",
};

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-dim)]">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Atividade</h2>
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] cursor-pointer transition-colors duration-200">Ver Mais →</span>
      </div>
      <div className="divide-y divide-[var(--border-dim)] max-h-[300px] overflow-y-auto">
        {activities.slice(0, 5).map((activity) => (
          <div key={activity.id} className="flex gap-3 px-5 py-3 last:border-b-0 hover:bg-[var(--surface-raised)]/50 transition-colors duration-200">
            <div className={cn(
              "size-7 rounded-lg bg-[var(--surface-raised)] flex items-center justify-center flex-shrink-0",
              activityColors[activity.type] ?? "text-[var(--text-secondary)]"
            )}>
              {activityIcons[activity.type] ?? <Check size={14} />}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[var(--text-secondary)] leading-snug truncate">{activity.description}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">{formatTimeAgo(activity.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
