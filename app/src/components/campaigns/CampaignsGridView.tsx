"use client";

import CampaignCard from "./CampaignCard";
import type { Campaign } from "@/lib/mock-data";
import { StaggerContainer, StaggerItem } from "@/components/animations/StaggerContainer";

interface CampaignsGridViewProps {
  campaigns: Campaign[];
}

export default function CampaignsGridView({ campaigns }: CampaignsGridViewProps) {
  return (
    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" staggerDelay={0.05}>
      {campaigns.map((campaign, index) => (
        <StaggerItem key={campaign.id}>
          <CampaignCard campaign={campaign} index={index} />
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
