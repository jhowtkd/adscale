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
  active: { dot: "bg-[var(--accent-green)]", label: "Ativa" },
  draft: { dot: "bg-[var(--accent-amber)]", label: "Rascunho" },
  archived: { dot: "bg-[var(--text-muted)]", label: "Arquivada" },
};

const ESTIMATED_ROW_HEIGHT = 72;

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const status = statusConfig[campaign.status] ?? statusConfig.draft;
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border-dim)] last:border-b-0 transition-colors duration-200 hover:bg-[var(--surface-raised)] group"
    >
      <Link
        href={`/campaigns/${campaign.id}`}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
        <div
          className="w-12 h-12 rounded-md flex-shrink-0 relative overflow-hidden"
          style={{
            background: campaign.thumbnailUrl
              ? `url(${campaign.thumbnailUrl}) center/cover`
              : "var(--surface-raised)",
          }}
        >
          {!campaign.thumbnailUrl && (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">{campaign.name[0]}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[var(--text-primary)] truncate">{campaign.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[var(--text-secondary)]">{campaign.pieceCount} peças</span>
            <span className="text-xs text-[var(--text-secondary)]">·</span>
            <span className="text-xs text-[var(--text-secondary)]">{campaign.platforms?.join(", ")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {status.label}
          </div>
        </div>
      </Link>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button aria-label="Favorite" className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors duration-200">
          <Star size={16} />
        </button>
        <button aria-label="Expand" className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors duration-200">
          <ChevronDown size={16} />
        </button>
      </div>
    </div>
  );
}

export default function CampaignList({ campaigns }: CampaignListProps) {
  const enableVirtualization = campaigns.length > 20;

  return (
    <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-dim)]">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Campanhas Recentes
        </h3>
        <Link
          href="/campaigns"
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-green)] transition-colors duration-200"
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
