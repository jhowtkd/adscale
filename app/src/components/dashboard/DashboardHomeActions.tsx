"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { CreativeComposer } from "@/components/creative-work/CreativeComposer";
import { CreativeToolCards } from "@/components/creative-work/CreativeToolCards";
import { BrandInspirations } from "@/components/creative-work/BrandInspirations";
import { useCreativeComposer, type ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import { resolveContinueWork } from "@/lib/dashboard/resolve-continue-work";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";

export default function DashboardHomeActions({
  workId,
  initialIntent,
  focusComposer = false,
  templateId,
}: {
  workId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: boolean;
  templateId?: string;
}) {
  const t = useTranslations("dashboard.home");
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const { activeProfile } = useActiveClientProfile();
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    initialIntent,
    focusComposer,
    initialTemplateId: templateId,
  });
  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);

  if (isError && works.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t("errorTitle")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
        <button type="button" onClick={() => void refetch()} className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)]">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <CreativeComposer composer={composer} composerRef={composerRef} />

      <section aria-labelledby="continue-work-title">
        {isLoading && works.length === 0 ? (
          <div className="h-24 animate-pulse rounded-[var(--radius-object)] bg-[var(--surface-raised)]" aria-hidden="true" />
        ) : continueTarget.kind === "work" ? (
          <Link
            href={continueTarget.href}
            className="flex items-center justify-between gap-4 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <span>
              <span id="continue-work-title" className="block text-sm font-semibold text-[var(--text-primary)]">{t("continueWhereLeftOff")}</span>
              <span className="mt-1 block text-sm text-[var(--text-secondary)]">{t("continueCampaignHint", { name: continueTarget.name })}</span>
            </span>
            <ArrowRight size={18} aria-hidden="true" className="text-[var(--text-muted)]" />
          </Link>
        ) : (
          <div className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-5">
            <h2 id="continue-work-title" className="text-sm font-semibold text-[var(--text-primary)]">{t("firstCreationTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("firstCreationPrompt")} {activeProfile?.name ?? ""}
            </p>
          </div>
        )}
      </section>

      <CreativeToolCards selected={composer.intent} onSelect={composer.selectIntent} />

      <div data-testid="brand-inspirations-slot" className="min-h-16">
        <BrandInspirations clientProfileId={activeProfile?.id ?? null} onAttach={composer.addInspiration} />
      </div>
    </div>
  );
}
