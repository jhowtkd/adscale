"use client";

import { m } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
      className="mb-4 md:ml-[120px]"
    >
      {platformsText ? (
        <p className="text-sm text-[var(--text-muted)]">{platformsText}</p>
      ) : onAddPlatform ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddPlatform}
          className="h-8 gap-1.5 text-xs"
        >
          <Plus size={14} aria-hidden="true" />
          {tc("addPlatform")}
        </Button>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{tc("noPlatformsSet")}</p>
      )}
    </m.div>
  );
}
