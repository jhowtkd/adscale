"use client";
import { Star, ChevronDown } from "lucide-react";
import Link from "next/link";
import VirtualList from "@/components/ui/VirtualList";

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

const ESTIMATED_ROW_HEIGHT = 72;

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const status = statusConfig[campaign.status] ?? statusConfig.draft;
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="flex items-center gap-4 px-6 py-4 border-b border-[#14141c] last:border-b-0 transition-colors duration-200 hover:bg-[#16161f] group"
    >
      <div
        className="w-12 h-12 rounded-[4px] flex-shrink-0 relative overflow-hidden"
        style={{
          background: campaign.thumbnailUrl
            ? `url(${campaign.thumbnailUrl}) center/cover`
            : "linear-gradient(135deg, #667eea, #764ba2)",
        }}
      >
        <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-[#e8e8ec] truncate">
          {campaign.name}
        </div>
        <div className="text-sm text-[#b4b4be]">
          {campaign.pieceCount} peças · {campaign.platforms.join(", ")}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-[#b4b4be] min-w-[80px]">
        <span className={`w-2 h-2 rounded-full ${status.dot}`} />
        {status.label}
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button className="w-8 h-8 rounded-[4px] flex items-center justify-center text-[#b4b4be] hover:bg-[#1a1a24] transition-colors duration-200">
          <Star size={16} />
        </button>
        <button className="w-8 h-8 rounded-[4px] flex items-center justify-center text-[#b4b4be] hover:bg-[#1a1a24] transition-colors duration-200">
          <ChevronDown size={16} />
        </button>
      </div>
    </Link>
  );
}

export default function CampaignList({ campaigns }: CampaignListProps) {
  const enableVirtualization = campaigns.length > 20;

  return (
    <div className="bg-[#0e0e14] border border-[#1a1a24] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a24]">
        <h3 className="text-base font-semibold text-[#e8e8ec]">
          Campanhas Recentes
        </h3>
        <Link
          href="/campaigns"
          className="text-sm text-[#b4b4be] hover:text-[#2fb67d] transition-colors duration-200"
        >
          Ver Todas →
        </Link>
      </div>
      <div>
        {enableVirtualization ? (
          <VirtualList
            items={campaigns}
            renderItem={(campaign: Campaign, _index: number) => <CampaignRow campaign={campaign} />}
            estimateSize={ESTIMATED_ROW_HEIGHT}
            enabled={true}
            className="max-h-[600px]"
          />
        ) : (
          campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))
        )}
      </div>
    </div>
  );
}
