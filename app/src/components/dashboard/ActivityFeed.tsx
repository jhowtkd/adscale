"use client";
import { Check, Zap, Upload, Users } from "lucide-react";

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
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Atividade</h3>
        <span className="text-xs text-[#4a4a52] hover:text-[#2fb67d] cursor-pointer transition-colors">Ver Mais →</span>
      </div>
      <div className="py-1">
        {activities.map((activity) => (
          <div key={activity.id} className="flex gap-2.5 px-5 py-2.5 border-b border-[#14141c] last:border-b-0 hover:bg-[#12121a] transition-colors">
            <div className="w-7 h-7 rounded-[4px] bg-[#1a1a24] flex items-center justify-center text-[#6e6e7a] flex-shrink-0">
              {activityIcons[activity.type] ?? <Check size={14} />}
            </div>
            <div>
              <div className="text-[13px] text-[#b4b4be] leading-snug" dangerouslySetInnerHTML={{ __html: activity.description }} />
              <div className="text-[11px] text-[#4a4a52] mt-0.5">{formatTimeAgo(activity.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
