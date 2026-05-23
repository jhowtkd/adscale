"use client";
import { Star, ChevronDown } from "lucide-react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  pieceCount: number;
  approvedCount: number;
  status: string;
  platforms: string[];
  updatedAt: string;
}

interface CampaignListProps {
  campaigns: Campaign[];
}

const statusConfig: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-[#2fb67d]", label: "Ativa" },
  draft: { dot: "bg-[#f59e0b]", label: "Rascunho" },
  archived: { dot: "bg-[#4a4a52]", label: "Arquivada" },
};

export default function CampaignList({ campaigns }: CampaignListProps) {
  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a24]">
        <h3 className="text-sm font-semibold text-[#e8e8ec]">Campanhas Recentes</h3>
        <Link href="/campaigns" className="text-xs text-[#4a4a52] hover:text-[#2fb67d] transition-colors">Ver Todas →</Link>
      </div>
      <div>
        {campaigns.map((campaign) => {
          const status = statusConfig[campaign.status] ?? statusConfig.draft;
          return (
            <Link key={campaign.id} href={`/campaigns/${campaign.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[#14141c] last:border-b-0 transition-colors hover:bg-[#12121a] group">
              <div className="w-11 h-11 rounded-[4px] flex-shrink-0 relative overflow-hidden"
                style={{ background: campaign.thumbnailUrl ? `url(${campaign.thumbnailUrl}) center/cover` : "linear-gradient(135deg, #667eea, #764ba2)" }}>
                <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#e8e8ec] truncate">{campaign.name}</div>
                <div className="text-xs text-[#4a4a52]">{campaign.pieceCount} peças · {campaign.platforms.join(", ")}</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6e6e7a] min-w-[80px]">
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{status.label}
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#4a4a52] hover:bg-[#1a1a24] hover:text-[#e8e8ec] transition-colors"><Star size={14} /></button>
                <button className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#4a4a52] hover:bg-[#1a1a24] hover:text-[#e8e8ec] transition-colors"><ChevronDown size={14} /></button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
