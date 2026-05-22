"use client";

import CampaignCard from "./CampaignCard";
import type { Campaign } from "@/lib/mock-data";

interface CampaignsGridViewProps {
  campaigns: Campaign[];
}

export default function CampaignsGridView({ campaigns }: CampaignsGridViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {campaigns.map((campaign, index) => (
        <CampaignCard key={campaign.id} campaign={campaign} index={index} />
      ))}
    </div>
  );
}
