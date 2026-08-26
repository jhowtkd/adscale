"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ImageIcon } from "lucide-react";
import { AccessGatePanel } from "@/components/billing/AccessGatePanel";
import { CreativeComposer } from "@/components/creative-work/CreativeComposer";
import { CreativeToolCards } from "@/components/creative-work/CreativeToolCards";
import { BrandInspirations } from "@/components/creative-work/BrandInspirations";
import { useCreativeComposer, type ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { resolveContinueWork, type ContinueWorkTarget } from "@/lib/dashboard/resolve-continue-work";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCreativeWork, type CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { cn } from "@/lib/utils";
import type { StudioMode } from "@/app/(dashboard)/dashboard-search-params";

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function ContinueWorkThumbnail({ outputs }: { outputs: CreativeWorkOutput[] }) {
  const preview = useMemo(
    () => [...outputs]
      .filter((output) => output.status === "completed" && output.outputKey)
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .at(0) ?? null,
    [outputs],
  );

  return (
    <span
      data-testid="continue-work-thumbnail"
      aria-hidden="true"
      className="grid aspect-[4/5] w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] sm:w-24"
    >
      {preview ? <Image src={`/api/creative-work/${preview.workItemId}/outputs/${preview.id}/download`} alt="" width={96} height={120} unoptimized loading="lazy" className="size-full object-cover" /> : <ImageIcon size={20} className="text-[var(--text-muted)]" />}
    </span>
  );
}

function ContinueWorkCard({
  target,
  href,
  title,
  hint,
}: {
  target: Extract<ContinueWorkTarget, { kind: "work" }>;
  href: string;
  title: string;
  hint: string;
}) {
  const creativeWorkId = target.originKind === "creative_work" ? target.originId : null;
  const { data } = useCreativeWork(creativeWorkId);

  return (
    <Link
      href={href}
      className="group grid min-h-24 grid-cols-[minmax(0,1fr)_5rem] items-center gap-4 overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:grid-cols-[minmax(0,1fr)_6rem] sm:p-5"
    >
      <span className="min-w-0">
        <span id="continue-work-title" className="block text-base font-semibold text-[var(--text-primary)] sm:text-lg">{title}</span>
        <span className="mt-2 block truncate text-sm text-[var(--text-secondary)]">{hint}</span>
        <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <ArrowRight size={17} aria-hidden="true" />
        </span>
      </span>
      <ContinueWorkThumbnail outputs={data?.outputs ?? []} />
    </Link>
  );
}

export default function DashboardHomeActions({
  workId,
  initialIntent,
  focusComposer = false,
  templateId,
  studioMode,
  freshEntry = false,
}: {
  workId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: boolean;
  templateId?: string;
  studioMode?: StudioMode;
  freshEntry?: boolean;
}) {
  const t = useTranslations("dashboard.home");
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const { activeProfile } = useActiveClientProfile();
  // The URL mode only seeds a new composer. Once it exists, its intent is the
  // authority because protocol switches may be deferred or cancelled.
  const initialStudioIntent = initialIntent
    ?? (studioMode === "briefing" ? "single" : studioMode === "arte" ? "variations" : undefined);
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    initialIntent: initialStudioIntent,
    focusComposer,
    initialTemplateId: templateId,
    ...(freshEntry ? { freshEntry: true } : {}),
  });
  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);
  // The composer owns protocol switching, including a deferred switch that is
  // later cancelled. Deriving this keeps the visual mode on the same state.
  const mode: StudioMode = composer.intent === "single" ? "briefing" : "arte";

  const selectStudioMode = (nextMode: StudioMode) => {
    composer.selectIntent(nextMode === "briefing" ? "single" : "variations");
  };

  if (isError && works.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t("errorTitle")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t("errorDescription")}</p>
        <button type="button" onClick={() => void refetch()} className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-5 py-2.5 text-sm font-medium text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
      <AccessGatePanel />
      <header className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("studioLabel")}</p>
          <h1 className="mt-1 product-page-title text-[var(--text-primary)]">{mode === "arte" ? t("studioArtTitle") : t("studioBriefingTitle")}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{mode === "arte" ? t("studioArtSubtitle") : t("studioBriefingSubtitle")}</p>
        </div>
        <ActiveBrandSwitcher id="active-client-switcher-home" className="mt-0 w-full sm:w-64" />
      </header>

      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t("studioModeLabel")}>
        {(["arte", "briefing"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => selectStudioMode(value)} className={cn("min-h-20 rounded-[var(--radius-control)] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", mode === value ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)]" : "border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]")}>
            <span className="block text-sm font-semibold">{value === "arte" ? t("studioWithArt") : t("studioWithBriefing")}</span>
            <span className="mt-1 block text-xs opacity-80">{value === "arte" ? t("studioWithArtHint") : t("studioWithBriefingHint")}</span>
          </button>
        ))}
      </div>

      <CreativeToolCards selected={composer.intent} onSelect={composer.selectIntent} />

      {composer.pendingProtocolSwitch ? (
        <div
          role="alertdialog"
          aria-label={t("protocolSwitchPending")}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3"
        >
          <p className="text-sm text-[var(--warning-text)]">{t("protocolSwitchPending")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={composer.confirmProtocolSwitch}
              className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-medium text-[var(--action-primary-text)]"
            >
              {t("protocolSwitchConfirm")}
            </button>
            <button
              type="button"
              onClick={composer.cancelProtocolSwitch}
              className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              {t("protocolSwitchCancel")}
            </button>
          </div>
        </div>
      ) : composer.protocolSwitchNotice ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-object)] border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3">
          <p className="text-sm text-[var(--info-text)]">{t("protocolSwitchPreserved")}</p>
          <button
            type="button"
            onClick={composer.returnToPreviousProtocol}
            className="rounded-[var(--radius-control)] border border-[var(--info-border)] px-3 py-2 text-sm font-medium text-[var(--info-text)]"
          >
            {t("protocolSwitchBack")}
          </button>
        </div>
      ) : null}

      <CreativeComposer composer={composer} composerRef={composerRef} hideSourceUpload={mode === "briefing" && composer.intent === "single"} />

      <section aria-labelledby={isLoading && works.length === 0 ? undefined : "continue-work-title"}>
        {isLoading && works.length === 0 ? (
          <div className="h-40 animate-pulse rounded-[var(--radius-object)] bg-[var(--surface-raised)] sm:h-44 lg:h-48" aria-hidden="true" />
        ) : continueTarget.kind === "work" ? (
          <ContinueWorkCard
            target={continueTarget}
            // #126: a work without a campaign resumes on its own page — the
            // Home never intercepts the canonical destination with an anchor.
            href={continueTarget.href}
            title={t("continueWhereLeftOff")}
            hint={t("continueCampaignHint", { name: continueTarget.name })}
          />
        ) : (
          <div className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-5">
            <h2 id="continue-work-title" className="text-sm font-semibold text-[var(--text-primary)]">{t("firstCreationTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("firstCreationPrompt")} {activeProfile?.name ?? ""}
            </p>
          </div>
        )}
      </section>

      <div data-testid="brand-inspirations-slot" className="min-h-16">
        <BrandInspirations clientProfileId={composer.clientProfileId} onAttach={composer.addInspiration} />
      </div>
    </div>
  );
}
