"use client";

import { useState } from "react";
import BrandKitTab from "@/components/settings/BrandKitTab";
import { BrandTrainingAssets } from "@/components/brand-training/BrandTrainingAssets";
import { BrandFontFiles } from "@/components/brand-training/BrandFontFiles";
import { BrandVoiceSection } from "@/components/brand-training/BrandVoiceSection";
import { BrandKnowledgeReview } from "@/components/brand-training/BrandKnowledgeReview";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioChromeBarClass,
  studioFilterStripClass,
  studioInstrumentClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import { cn } from "@/lib/utils";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useBrandTrainingStatus } from "@/lib/hooks/use-brand-training";
import { useTranslations } from "next-intl";

type KitSection = "identity" | "assets" | "fonts" | "knowledge" | "voice";

const KIT_SECTIONS: KitSection[] = ["identity", "assets", "fonts", "knowledge", "voice"];

export default function BrandKitPage() {
  const t = useTranslations("navigation");
  const tTraining = useTranslations("brandTraining");
  const { activeClientProfileId, profiles } = useActiveClientProfile();
  const status = useBrandTrainingStatus(activeClientProfileId);
  const showBrandKit = profiles.length === 0 || activeClientProfileId !== null;
  const [section, setSection] = useState<KitSection>("identity");
  const activeSection = activeClientProfileId ? section : "identity";

  return (
    <div className={cn(studioInstrumentClass, "py-0 pb-6")}>
      <div className={studioChromeBarClass}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {t("brandKit")}
        </p>
        {status.data ? (
          <p
            role="status"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            {status.data.trained ? tTraining("trainedBadge") : tTraining("incompleteBadge")}
          </p>
        ) : null}
      </div>

      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">{t("brands")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{t("brandKitHint")}</p>
      </header>

      <div data-testid="brand-kit-strip" className={studioFilterStripClass}>
        {activeClientProfileId ? (
          <DiscreetRadios
            label={tTraining("kitNavAria")}
            value={activeSection}
            onChange={setSection}
            className="min-w-0 flex-1 justify-center"
            options={KIT_SECTIONS.map((value) => ({
              value,
              label: tTraining(`kitSections.${value}`),
            }))}
          />
        ) : null}
      </div>

      <section className="space-y-8">
        {showBrandKit ? (
          <div
            className={
              activeSection === "assets" || activeSection === "knowledge" ? "hidden" : undefined
            }
            hidden={activeSection === "assets" || activeSection === "knowledge"}
          >
            <BrandKitTab
              stage={
                activeSection === "voice"
                  ? "voice"
                  : activeSection === "fonts"
                    ? "fonts"
                    : "identity"
              }
            />
          </div>
        ) : (
          <p className="pt-6 text-sm text-[var(--text-secondary)]">
            {tTraining("selectBrandPrompt")}
          </p>
        )}
        {activeClientProfileId && activeSection === "assets" ? (
          <BrandTrainingAssets clientProfileId={activeClientProfileId} />
        ) : null}
        {activeClientProfileId && activeSection === "fonts" ? (
          <BrandFontFiles clientProfileId={activeClientProfileId} />
        ) : null}
        {activeClientProfileId && activeSection === "knowledge" ? (
          <BrandKnowledgeReview clientProfileId={activeClientProfileId} />
        ) : null}
        {activeClientProfileId && activeSection === "voice" ? (
          <BrandVoiceSection clientProfileId={activeClientProfileId} />
        ) : null}
      </section>
    </div>
  );
}
