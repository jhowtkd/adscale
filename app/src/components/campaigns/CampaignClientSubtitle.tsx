"use client";

import { m } from "@/components/animations/MotionBoundary";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { studioQuietActionClass } from "@/components/dashboard/studio-stage/StudioInstrument";

interface CampaignClientSubtitleProps {
  platformsText?: string;
  onAddPlatform?: () => void;
}

export default function CampaignClientSubtitle({
  platformsText,
  onAddPlatform,
}: CampaignClientSubtitleProps) {
  const tc = useTranslations("common");

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="mb-4"
    >
      {platformsText ? (
        <p className="text-sm text-[var(--text-muted)]">{platformsText}</p>
      ) : onAddPlatform ? (
        <button type="button" onClick={onAddPlatform} className={studioQuietActionClass}>
          <Plus size={14} aria-hidden="true" />
          {tc("addPlatform")}
        </button>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{tc("noPlatformsSet")}</p>
      )}
    </m.div>
  );
}
