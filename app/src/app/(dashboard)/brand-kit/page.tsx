"use client";

import { Check } from "lucide-react";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import BrandKitTab from "@/components/settings/BrandKitTab";
import { BrandTrainingAssets } from "@/components/brand-training/BrandTrainingAssets";
import { BrandVoiceSection } from "@/components/brand-training/BrandTrainingWizard";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useBrandTrainingStatus } from "@/lib/hooks/use-brand-training";
import { useTranslations } from "next-intl";

export default function BrandKitPage() {
  const t = useTranslations("navigation");
  const tTraining = useTranslations("brandTraining");
  const { activeClientProfileId, profiles } = useActiveClientProfile();
  const status = useBrandTrainingStatus(activeClientProfileId);
  const showBrandKit = profiles.length === 0 || activeClientProfileId !== null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="max-w-[760px] space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="product-page-title text-[var(--text-primary)]">{t("brandKit")}</h1>
            <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--warning-text)]">
              {t("brandKitBeta")}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{t("brandKitHint")}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ActiveBrandSwitcher
            id="brand-kit-active-brand"
            className="mt-0 w-full sm:max-w-xs"
          />
          {status.data ? (
            <span
              role="status"
              className={
                status.data.trained
                  ? "inline-flex w-fit items-center gap-1 rounded-full bg-[var(--success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--success-text)]"
                  : "inline-flex w-fit rounded-full border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]"
              }
            >
              {status.data.trained ? <Check size={12} aria-hidden="true" /> : null}
              {status.data.trained
                ? tTraining("trainedBadge")
                : tTraining("incompleteBadge")}
            </span>
          ) : null}
        </div>
      </header>

      <section className="mt-6 max-w-[760px] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 sm:p-6">
        {showBrandKit ? (
          <BrandKitTab />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {tTraining("selectBrandPrompt")}
          </p>
        )}

        {activeClientProfileId ? (
          <>
            <div className="mt-8 border-t border-[var(--border-dim)] pt-8">
              <BrandTrainingAssets clientProfileId={activeClientProfileId} />
            </div>
            <div className="mt-8 border-t border-[var(--border-dim)] pt-8">
              <BrandVoiceSection clientProfileId={activeClientProfileId} />
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
