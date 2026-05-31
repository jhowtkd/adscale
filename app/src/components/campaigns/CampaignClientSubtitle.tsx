"use client";

import { m } from "framer-motion";
import { useTranslations } from "next-intl";

interface CampaignClientSubtitleProps {
  platformsText?: string;
}

export default function CampaignClientSubtitle({ platformsText }: CampaignClientSubtitleProps) {
  const tc = useTranslations("common");

  return (
    <m.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="text-sm text-[var(--text-muted)] md:ml-[120px] mb-4"
    >
      {platformsText || tc("noPlatformsSet")}
    </m.p>
  );
}
