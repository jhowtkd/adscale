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
  derivation_approved: <Check size={16} />,
  derivations_generated: <Zap size={16} />,
  creative_uploaded: <Upload size={16} />,
  invite_accepted: <Users size={16} />,
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a24]">
        <h3 className="text-base font-semibold text-[#e8e8ec]">Atividade</h3>
        <span className="text-sm text-[#b4b4be] hover:text-[#2fb67d] cursor-pointer transition-colors duration-200">Ver Mais →</span>
      </div>
      <div className="py-2">
        {activities.map((activity) => (
          <div key={activity.id} className="flex gap-3.5 px-6 py-3.5 border-b border-[#14141c] last:border-b-0 hover:bg-[#16161f] transition-colors duration-200">
            <div className="w-8 h-8 rounded-[4px] bg-[#1a1a24] flex items-center justify-center text-[#b4b4be] flex-shrink-0">
              {activityIcons[activity.type] ?? <Check size={16} />}
            </div>
            <div>
              <div className="text-sm text-[#b4b4be] leading-snug" dangerouslySetInnerHTML={{ __html: activity.description }} />
              <div className="text-[13px] text-[#6e6e7a] mt-1">{formatTimeAgo(activity.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
