"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ImageIcon, Paperclip, Plus } from "lucide-react";
import { AccessGatePanel } from "@/components/billing/AccessGatePanel";
import { CreativeComposer } from "@/components/creative-work/CreativeComposer";
import { CreativeToolCards } from "@/components/creative-work/CreativeToolCards";
import { BrandInspirations } from "@/components/creative-work/BrandInspirations";
import { CreativePlanReview } from "@/components/creative-work/CreativePlanReview";
import { useCreativeComposer, type ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { resolveContinueWork, type ContinueWorkTarget } from "@/lib/dashboard/resolve-continue-work";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCreativeWork, type CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { useCreateCampaign } from "@/lib/hooks/use-campaigns";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StudioMode } from "@/app/(dashboard)/dashboard-search-params";
import { getOrCreateStudioSession, type StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

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
      className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-inset)]"
    >
      {preview ? <Image src={`/api/creative-work/${preview.workItemId}/outputs/${preview.id}/download`} alt="" width={48} height={48} unoptimized loading="lazy" className="size-full object-cover" /> : <ImageIcon size={18} className="text-[var(--text-muted)]" />}
    </span>
  );
}

function ContinueWorkCard({
  target,
  brandName,
}: {
  target: Extract<ContinueWorkTarget, { kind: "work" }>;
  brandName: string;
}) {
  const t = useTranslations("dashboard.home");
  const creativeWorkId = target.originKind === "creative_work" ? target.originId : null;
  const { data } = useCreativeWork(creativeWorkId);
  const nextAction = data?.preparedPlan
    ? t("continueReviewPlan")
    : target.state === "generating"
      ? t("continueTrackGeneration")
      : target.state === "reviewing"
        ? t("continueReviewPieces")
        : t("continueConfigure");

  return (
    <Link
      href={target.href}
      className="group grid min-h-16 grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 transition-colors hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <span className="min-w-0">
        <span id="continue-work-title" className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("continueWhereLeftOff")}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{target.name}</span>
          <ArrowRight size={14} className="shrink-0 text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">
          <span>{target.originKind === "campaign" ? t("continueOriginCampaign") : t("continueOriginCreativeWork")}</span>
          <span aria-hidden="true">·</span>
          <span>{t("continueBrand", { name: brandName })}</span>
          <span aria-hidden="true">·</span>
          <span>{nextAction}</span>
        </span>
      </span>
      <ContinueWorkThumbnail outputs={data?.outputs ?? []} />
    </Link>
  );
}

function CreateCampaignDialog({
  activeProfile,
  onCreated,
}: {
  activeProfile: { id: string; name: string } | null | undefined;
  onCreated: (campaignId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createCampaign = useCreateCampaign();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !name.trim()) return;
    setError(null);
    try {
      const campaign = await createCampaign.mutateAsync({
        name: name.trim(),
        client: activeProfile.name,
        clientProfileId: activeProfile.id,
      });
      if (await onCreated(campaign.id)) {
        setName("");
        setOpen(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a campanha.");
    }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] px-4 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      <Plus size={16} aria-hidden="true" />Nova campanha
    </button>
    <DialogContent size="sm" showCloseButton={!createCampaign.isPending}>
      <form onSubmit={(event) => void submit(event)}>
        <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block text-sm font-medium text-[var(--text-primary)]">Nome da campanha<input aria-label="Nome da campanha" required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2" /></label>
          <p className="text-sm text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">Marca</span><br />{activeProfile?.name ?? "Selecione uma marca"}</p>
          {error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter><button type="button" onClick={() => setOpen(false)} disabled={createCampaign.isPending} className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium">Cancelar</button><button type="submit" disabled={!activeProfile || !name.trim() || createCampaign.isPending} className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-semibold text-[var(--action-primary-text)]">Criar campanha</button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function DashboardHomeActions({
  workId,
  initialIntent,
  focusComposer = false,
  templateId,
  studioMode,
  freshEntry = false,
  campaignId,
  workspaceId,
  rolloutVariant = "control",
}: {
  workId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: boolean;
  templateId?: string;
  studioMode?: StudioMode;
  freshEntry?: boolean;
  campaignId?: string;
  workspaceId?: string;
  rolloutVariant?: StudioRolloutVariant;
}) {
  const t = useTranslations("dashboard.home");
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const { activeProfile } = useActiveClientProfile();
  const { data: billing } = useBillingStatus();
  // The URL mode only seeds a new composer. Once it exists, its intent is the
  // authority because protocol switches may be deferred or cancelled.
  const initialStudioIntent = initialIntent
    ?? (studioMode === "briefing" ? "single" : studioMode === "arte" ? "variations" : undefined);
  const studioSession = useMemo(
    () => workspaceId ? getOrCreateStudioSession(workspaceId) : null,
    [workspaceId],
  );
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    initialIntent: initialStudioIntent,
    focusComposer,
    initialTemplateId: templateId,
    initialCampaignId: campaignId,
    ...(workspaceId ? {
      workspaceId,
      workflowVariant: rolloutVariant,
      studioSessionId: studioSession?.id,
    } : {}),
    ...(freshEntry ? { freshEntry: true } : {}),
  });
  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);
  const [editingPreparedPlan, setEditingPreparedPlan] = useState(false);
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

  if (rolloutVariant === "progressive") {
    const showObjectives = composer.hasEntry && !composer.objectiveSelected;
    const showPlan = composer.stage === "plan" && composer.preparedPlan && !editingPreparedPlan;
    const resultStage = composer.stage === "generation" || composer.stage === "results";
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
        <AccessGatePanel />
        <header className="flex items-end justify-between gap-3 border-b border-[var(--border-subtle)] pb-5">
          <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{t("studioLabel")}</p><h1 className="mt-1 product-page-title text-[var(--text-primary)]">{t("progressiveTitle")}</h1></div>
          <div className="flex items-center gap-2"><CreateCampaignDialog activeProfile={activeProfile} onCreated={composer.linkCampaign} /><ActiveBrandSwitcher id="active-client-switcher-home" className="w-56" /></div>
        </header>
        {isLoading && works.length === 0 ? <div className="h-16 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)]" /> : continueTarget.kind === "work" ? <ContinueWorkCard target={continueTarget} brandName={continueTarget.brandName ?? t("continueBrandUnknown")} /> : null}
        {!composer.objectiveSelected ? (
          <section className="space-y-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5" aria-labelledby="progressive-entry-title">
            <h2 id="progressive-entry-title" className="text-lg font-semibold text-[var(--text-primary)]">{t("progressiveTitle")}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{t("progressiveSubtitle")}</p>
            <textarea id="creative-composer-request" aria-label={t("composer.requestLabel")} value={composer.request} onChange={(event) => composer.setRequest(event.target.value)} rows={4} className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-3 text-sm" />
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-secondary)]"><Paperclip size={16} aria-hidden="true" />{t("composer.addArt")}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void composer.addFiles(event.target.files)} /></label>
          </section>
        ) : null}
        {showObjectives ? <section aria-labelledby="progressive-objective-title" className="space-y-3"><h2 id="progressive-objective-title" className="text-sm font-semibold text-[var(--text-primary)]">{t("chooseObjective")}</h2><CreativeToolCards selected={null} onSelect={composer.selectIntent} /></section> : null}
        {resultStage ? <section aria-labelledby="progressive-results-title"><h2 id="progressive-results-title" tabIndex={-1} className="text-lg font-semibold text-[var(--text-primary)]">{t("resultsTitle")}</h2><details className="mt-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-4"><summary className="cursor-pointer text-sm font-medium">{t("planUsed")}</summary><div className="mt-4"><CreativeComposer composer={composer} composerRef={composerRef} workflowVariant="progressive" hideSourceUpload={composer.intent === "single"} /></div></details></section> : composer.objectiveSelected && !showPlan ? <CreativeComposer composer={composer} composerRef={composerRef} workflowVariant="progressive" hideSourceUpload={composer.intent === "single"} /> : null}
        {showPlan && billing && !billing.access.hasSpendAccess ? <section className="rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4" role="alert"><p className="font-semibold text-[var(--warning-text)]">{t("insufficientBalance")}</p><Link href="/billing" className="mt-2 inline-flex text-sm font-semibold underline">{t("getCredits")}</Link></section> : null}
        {showPlan ? <CreativePlanReview plan={composer.preparedPlan!} busy={composer.actionPhase !== "idle"} onEdit={() => setEditingPreparedPlan(true)} onConfirm={(revision) => composer.confirmGeneration(revision)} /> : null}
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <CreateCampaignDialog activeProfile={activeProfile} onCreated={composer.linkCampaign} />
          <ActiveBrandSwitcher id="active-client-switcher-home" className="mt-0 w-full sm:w-64" />
        </div>
      </header>

      {isLoading && works.length === 0 ? (
        <div className="h-[74px] animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-raised)]" aria-hidden="true" />
      ) : continueTarget.kind === "work" ? (
        <section aria-labelledby="continue-work-title">
          <ContinueWorkCard
            target={continueTarget}
            brandName={continueTarget.brandName ?? t("continueBrandUnknown")}
          />
        </section>
      ) : null}

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

      {!isLoading && continueTarget.kind === "empty" ? (
        <section aria-labelledby="continue-work-title">
          <div className="rounded-[var(--radius-object)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-base)] p-5">
            <h2 id="continue-work-title" className="text-sm font-semibold text-[var(--text-primary)]">{t("firstCreationTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("firstCreationPrompt")} {activeProfile?.name ?? ""}
            </p>
          </div>
        </section>
      ) : null}

      <div data-testid="brand-inspirations-slot" className="min-h-16">
        <BrandInspirations clientProfileId={composer.clientProfileId} onAttach={composer.addInspiration} />
      </div>
    </div>
  );
}
