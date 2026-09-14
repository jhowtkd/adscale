"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageIcon, Plus } from "lucide-react";
import { AccessGatePanel } from "@/components/billing/AccessGatePanel";
import { CreativeComposer } from "@/components/creative-work/CreativeComposer";
import { CreativePlanReview } from "@/components/creative-work/CreativePlanReview";
import { useCreativeComposer, type ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import { BrandStageHome } from "@/components/dashboard/studio-stage/BrandStageHome";
import { studioChipClass, studioSwitcherClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import { protocolRadioClass, protocolShineFill } from "@/components/dashboard/studio-stage/ProtocolRadios";
import { TalkBox } from "@/components/dashboard/studio-stage/TalkBox";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { resolveContinueWork, type ContinueWorkTarget } from "@/lib/dashboard/resolve-continue-work";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { useCreativeWork, type CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import { useCreativeProduction } from "@/lib/hooks/use-creative-production";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { useStudioEntryInterview } from "@/lib/hooks/use-studio-entry-interview";
import type { EntryLocale } from "@/lib/studio/entry-types";
import { firstVisitComposerIntent } from "@/lib/studio/detect-entry-gaps";
import { studioStageOccupancy } from "@/lib/studio/stage-occupancy";
import { summarizeStudioBatch } from "@/lib/studio/result-summary";
import { useCreateCampaign } from "@/lib/hooks/use-campaigns";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StudioMode } from "@/app/(dashboard)/dashboard-search-params";
import { getOrCreateStudioSession, type StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function followStudioGeneration() {
  const editing = document.activeElement;
  const skipScroll =
    editing instanceof HTMLElement
    && (editing.tagName === "INPUT" || editing.tagName === "TEXTAREA" || editing.isContentEditable);
  const anchor = document.getElementById("studio-production-anchor");
  if (!anchor || skipScroll || typeof anchor.scrollIntoView !== "function") return;
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  anchor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

function ContinueWorkThumbnail({ outputs, className }: { outputs: CreativeWorkOutput[]; className?: string }) {
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
      className={cn("grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-inset)]", className)}
    >
      {preview ? <Image src={`/api/creative-work/${preview.workItemId}/outputs/${preview.id}/download`} alt="" width={preview ? 480 : 48} height={preview ? 600 : 48} unoptimized loading="lazy" className="size-full object-cover" /> : <ImageIcon size={18} className="text-[var(--text-muted)]" />}
    </span>
  );
}

function ContinueWorkCard({
  target,
  brandName,
  density = "row",
}: {
  target: Extract<ContinueWorkTarget, { kind: "work" }>;
  brandName: string;
  density?: "row" | "tile";
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
  const meta = (
    <>
      <span>{target.originKind === "campaign" ? t("continueOriginCampaign") : t("continueOriginCreativeWork")}</span>
      <span aria-hidden="true">·</span>
      <span>{t("continueBrand", { name: brandName })}</span>
      <span aria-hidden="true">·</span>
      <span>{t(`continueStates.${target.state}`)}</span>
      <span aria-hidden="true">·</span>
      <span>{nextAction}</span>
    </>
  );

  if (density === "tile") {
    return (
      <Link
        href={target.href}
        className="group inline-flex max-w-xs items-center gap-2 rounded-full border border-white/15 bg-transparent py-0.5 pl-1 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] hover:bg-white/6"
      >
        <ContinueWorkThumbnail outputs={data?.outputs ?? []} className="size-6 rounded-md border-0 bg-transparent" />
        <span className="min-w-0">
          <span id="continue-work-title" className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("continueWhereLeftOff")}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            <span className="truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{target.name}</span>
            <ArrowRight size={11} className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="sr-only">{meta}</span>
        </span>
      </Link>
    );
  }

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
        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">{meta}</span>
      </span>
      <ContinueWorkThumbnail outputs={data?.outputs ?? []} />
    </Link>
  );
}

function CreateCampaignDialog({
  activeProfile,
  onCreated,
  triggerClassName,
}: {
  activeProfile: { id: string; name: string } | null | undefined;
  onCreated: (campaignId: string) => Promise<boolean>;
  triggerClassName?: string;
}) {
  const t = useTranslations("dashboard.home");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createCampaign = useCreateCampaign();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !name.trim()) return;
    setError(null);
    try {
      const campaignId = createdCampaignId ?? (await createCampaign.mutateAsync({
        name: name.trim(),
        client: activeProfile.name,
        clientProfileId: activeProfile.id,
      })).id;
      if (!createdCampaignId) setCreatedCampaignId(campaignId);
      if (await onCreated(campaignId)) {
        setName("");
        setCreatedCampaignId(null);
        setOpen(false);
      } else setError(t("campaignDialog.linkFailed"));
    } catch {
      setError(t("campaignDialog.createFailed"));
    }
  };
  return <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setCreatedCampaignId(null); }}>
    <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", triggerClassName)}>
      <Plus size={16} aria-hidden="true" />{t("campaignDialog.open")}
    </button>
    <DialogContent size="sm" showCloseButton={!createCampaign.isPending}>
      <form onSubmit={(event) => void submit(event)}>
        <DialogHeader><DialogTitle>{t("campaignDialog.title")}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <label htmlFor="estudio-campaign-name" className="block text-sm font-medium text-[var(--text-primary)]">{t("campaignDialog.nameLabel")}<Input id="estudio-campaign-name" aria-label={t("campaignDialog.nameLabel")} required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 bg-[var(--surface-raised)]" /></label>
          <p className="text-sm text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">{t("campaignDialog.brandLabel")}</span><br /><span className={activeProfile ? undefined : "text-[var(--warning-text)]"}>{activeProfile?.name ?? t("campaignDialog.noBrand")}</span></p>
          {error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={createCampaign.isPending}>{t("campaignDialog.cancel")}</Button><Button type="submit" disabled={!activeProfile || !name.trim() || createCampaign.isPending}>{t("campaignDialog.submit")}</Button></DialogFooter>
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
  carouselCreationEnabled = false,
  entryInterviewEnabled = false,
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
  /** Task 10 wires the carousel rollout percentage to this gate. */
  carouselCreationEnabled?: boolean;
  /** Task 9 wires the entry interview rollout percentage to this gate. */
  entryInterviewEnabled?: boolean;
}) {
  const t = useTranslations("dashboard.home");
  const locale = useLocale();
  const router = useRouter();
  const entryLocale: EntryLocale = locale === "en" ? "en" : "pt-BR";
  const { data: works = [], isLoading, isError, refetch } = useCanonicalWorks();
  const { activeProfile } = useActiveClientProfile();
  const { data: billing } = useBillingStatus();
  const progressiveResultsHeadingRef = useRef<HTMLHeadingElement>(null);
  // The URL mode only seeds a new composer. Once it exists, its intent is the
  // authority because protocol switches may be deferred or cancelled.
  const initialStudioIntent = firstVisitComposerIntent({
    initialIntent,
    studioMode,
    workId,
  });
  const studioSession = useMemo(
    () => workspaceId ? getOrCreateStudioSession(workspaceId, undefined, undefined, rolloutVariant) : null,
    [rolloutVariant, workspaceId],
  );
  const [deskView, setDeskView] = useState<"inspirations" | "production">("inspirations");
  const [acceptedGeneration, setAcceptedGeneration] = useState(0);
  const onGenerationAccepted = useCallback(() => {
    setDeskView("production");
    setAcceptedGeneration((count) => count + 1);
  }, []);
  useEffect(() => {
    if (acceptedGeneration === 0) return;
    const frame = requestAnimationFrame(followStudioGeneration);
    return () => cancelAnimationFrame(frame);
  }, [acceptedGeneration]);
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
    onGenerationAccepted,
  });
  const [boxExpanded, setBoxExpanded] = useState(false);
  const [resultsContainer, setResultsContainer] = useState<HTMLDivElement | null>(null);
  const [deskPaging, setDeskPaging] = useState({ scope: "", page: 0 });
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const expansionButtonRef = useRef<HTMLButtonElement>(null);
  const continueTarget = useMemo(() => resolveContinueWork(works), [works]);
  const [editingPreparedPlan, setEditingPreparedPlan] = useState(false);
  const preparedPlanCycleRef = useRef(composer.preparedPlanCycle ?? 0);
  const sources = composer.sources ?? [];
  const outputs = composer.outputs ?? [];
  const inspirationsQuery = useCreativeInspirations(composer.clientProfileId ?? null);
  const inspirations = inspirationsQuery.data ?? [];

  const interviewEnabled = rolloutVariant === "progressive" && entryInterviewEnabled && Boolean(composer.clientProfileId);
  const [requestFocused, setRequestFocused] = useState(false);
  const [requestWriteToken, setRequestWriteToken] = useState(0);
  const setInterviewRequest = useCallback((value: string) => {
    composer.setRequest?.(value);
    setRequestWriteToken((token) => token + 1);
  }, [composer.setRequest]);
  const interview = useStudioEntryInterview({
    enabled: interviewEnabled,
    clientProfileId: composer.clientProfileId,
    request: composer.request ?? "",
    hasAttachment: Boolean(composer.bufferedFile) || sources.length > 0,
    carouselEnabled: carouselCreationEnabled,
    locale: entryLocale,
    setRequest: setInterviewRequest,
    recordStudioEvent: composer.recordStudioEvent ?? (() => undefined),
    requestFocused,
  });

  const protocolSwitchControls = composer.pendingProtocolSwitch ? (
    <div role="alertdialog" aria-label={t("protocolSwitchPending")} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3">
      <p className="text-sm text-[var(--warning-text)]">{t("protocolSwitchPending")}</p>
      <div className="flex gap-2"><button type="button" onClick={composer.confirmProtocolSwitch} className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-medium text-[var(--action-primary-text)]">{t("protocolSwitchConfirm")}</button><button type="button" onClick={composer.cancelProtocolSwitch} className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">{t("protocolSwitchCancel")}</button></div>
    </div>
  ) : composer.protocolSwitchNotice ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-object)] border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3"><p className="text-sm text-[var(--info-text)]">{t("protocolSwitchPreserved")}</p><button type="button" onClick={composer.returnToPreviousProtocol} className="rounded-[var(--radius-control)] border border-[var(--info-border)] px-3 py-2 text-sm font-medium text-[var(--info-text)]">{t("protocolSwitchBack")}</button></div>
  ) : null;

  // Task 10: the carousel wizard owns its whole lifecycle (prepare → Gerar
  // carrossel → generation states → deck review). The generic progressive
  // plan-review/results surfaces never replace it — their proposals grid has
  // no carousel outputs and would unmount the deck mid-flow.
  const isCarouselWorkflow = composer.intent === "carousel";
  const carouselPhase = composer.carousel?.phase;
  const resultStage = rolloutVariant === "progressive"
    && !isCarouselWorkflow
    && (composer.stage === "generation" || composer.stage === "results");
  const resultSummary = summarizeStudioBatch(outputs, composer.stage);
  const resultSummaryLabel = resultSummary.kind === "generating"
    ? t("resultStateGenerating")
    : resultSummary.kind === "failed"
      ? t("resultStateFailed")
      : resultSummary.kind === "partial"
        ? t("resultStatePartial", { ready: resultSummary.ready, failed: resultSummary.failed })
        : t("resultStateReady");
  const showPlan = rolloutVariant === "progressive"
    && composer.stage === "plan"
    && Boolean(composer.preparedPlan)
    && !editingPreparedPlan
    && !isCarouselWorkflow;
  const carouselTalkBoxProps = {
    showRequest: !isCarouselWorkflow || carouselPhase === "entry" || carouselPhase == null,
    showAttachments: !isCarouselWorkflow && composer.intent !== "restyle",
    showGenerate: !isCarouselWorkflow && !showPlan && !resultStage,
  };
  useEffect(() => {
    const editing = document.activeElement;
    if (resultStage && !(editing instanceof HTMLElement &&
      (editing.tagName === "INPUT" || editing.tagName === "TEXTAREA" || editing.isContentEditable))) {
      progressiveResultsHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [resultStage]);
  useEffect(() => {
    // Presentation follows an already-mounted composer; do not remount the box.
    if (composer.pendingProtocolSwitch || composer.brandConflict || showPlan) setBoxExpanded(true); // eslint-disable-line react-hooks/set-state-in-effect -- Task 2/3 phase chrome
  }, [composer.pendingProtocolSwitch, composer.brandConflict, showPlan]);
  useEffect(() => {
    if (resultStage) setBoxExpanded(false); // eslint-disable-line react-hooks/set-state-in-effect -- Task 2/3 phase chrome
  }, [resultStage]);
  const seenWorkIdRef = useRef<string | null>(composer.workId ?? null);
  useEffect(() => {
    const nextId = composer.workId ?? null;
    if (nextId && nextId !== seenWorkIdRef.current && !resultStage) {
      setBoxExpanded(true);
    }
    seenWorkIdRef.current = nextId;
  }, [composer.workId, resultStage]);
  useEffect(() => {
    if (!isCarouselWorkflow) return;
    if (carouselPhase === "questions" || carouselPhase === "sequence" || carouselPhase === "ready_to_generate") {
      setBoxExpanded(true); // eslint-disable-line react-hooks/set-state-in-effect -- Task 3 carousel chrome
    } else if (carouselPhase === "generating" || carouselPhase === "review") {
      setBoxExpanded(false);
    }
  }, [isCarouselWorkflow, carouselPhase]);
  useEffect(() => {
    // Canonical preparation can legitimately reuse a revision. The explicit
    // cycle means an edit only returns to review after a successful prepare.
    const nextCycle = composer.preparedPlanCycle ?? 0;
    if (nextCycle > preparedPlanCycleRef.current) {
      setEditingPreparedPlan(false);
    }
    preparedPlanCycleRef.current = nextCycle;
  }, [composer.preparedPlanCycle]);

  const occupancy: "empty" | "work" = studioStageOccupancy({
    hasContinueWork: continueTarget.kind === "work",
    hasOpenWork: Boolean(composer.workId),
    outputCount: outputs.length,
    sourceCount: sources.length,
  });
  const productionCampaignId = composer.campaignId ?? null;
  const isProducing = composer.stage === "generation"
    || composer.carousel?.phase === "generating"
    || works.some((work) => work.state === "generating");
  const production = useCreativeProduction({
    workspaceId: workspaceId ?? null,
    clientProfileId: composer.clientProfileId ?? null,
    campaignId: productionCampaignId,
    enabled: deskView === "production",
    isProducing,
  });
  const catalogItems = production.items;
  const productionItems = useMemo(() => {
    const groups = new Map<string, typeof catalogItems>();
    for (const item of catalogItems) {
      const group = item.deckId ? `deck:${item.deckId}` : item.id;
      const values = groups.get(group) ?? [];
      if (!values.some((value) => value.id === item.id)) values.push(item);
      groups.set(group, values);
    }
    return [...groups.values()].flatMap((values) => values.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  }, [catalogItems]);
  const deskScopeKey = `${workspaceId ?? ""}:${composer.clientProfileId ?? ""}:${productionCampaignId ?? ""}:${deskView}`;
  const allMosaicItems = deskView === "inspirations"
    ? inspirations
      .filter((item) => item.previewUrl)
      .map((item) => ({ id: item.id, title: item.title, src: item.previewUrl! }))
    : productionItems.map((item) => ({
      id: item.id,
      title: item.title,
      src: item.previewUrl,
      format: item.format,
      detail: item.position ? t("studioDesk.slide", { position: item.position }) : undefined,
    }));
  const maxDeskPage = Math.max(0, Math.ceil(allMosaicItems.length / 6) - 1);
  const currentDeskPage = Math.min(deskPaging.scope === deskScopeKey ? deskPaging.page : 0, maxDeskPage);
  if (deskPaging.scope !== deskScopeKey || deskPaging.page !== currentDeskPage) {
    setDeskPaging({ scope: deskScopeKey, page: currentDeskPage });
  }
  const mosaicItems = allMosaicItems.slice(currentDeskPage * 6, currentDeskPage * 6 + 6);
  const hasBufferedNextPage = (currentDeskPage + 1) * 6 < allMosaicItems.length;
  const hasRemoteNextPage = deskView === "production" ? production.hasNextPage : inspirationsQuery.hasNextPage;
  const fetchingNextPage = deskView === "production" ? production.isFetchingNextPage : inspirationsQuery.isFetchingNextPage;
  const nextDeskPage = async () => {
    const requestedScope = deskScopeKey;
    const nextStart = (currentDeskPage + 1) * 6;
    if (nextStart < allMosaicItems.length) {
      setDeskPaging((current) => current.scope === requestedScope
        ? { ...current, page: current.page + 1 }
        : current);
      return;
    }
    try {
      if (deskView === "production") {
        if (!production.hasNextPage || production.isFetchingNextPage) return;
        const result = await production.fetchNextPage();
        const total = result.data?.pages.reduce((n, page) => n + page.production.length, 0) ?? 0;
        if (result.isError || total <= nextStart) return;
        setDeskPaging((current) => current.scope === requestedScope
          ? { ...current, page: current.page + 1 }
          : current);
      } else {
        if (!inspirationsQuery.hasNextPage || inspirationsQuery.isFetchingNextPage) return;
        const result = await inspirationsQuery.fetchNextPage();
        const total = result.data?.pages.reduce((n, page) => n + page.inspirations.filter((item) => item.previewUrl).length, 0) ?? 0;
        if (result.isError || total <= nextStart) return;
        setDeskPaging((current) => current.scope === requestedScope
          ? { ...current, page: current.page + 1 }
          : current);
      }
    } catch {
      return;
    }
  };
  const brandName = composer.brandName ?? activeProfile?.name ?? null;
  const productionCampaignName = composer.campaigns?.find((campaign) => campaign.id === productionCampaignId)?.name
    ?? t("studioDesk.unnamedCampaign");
  const deskControls = (
    <div className="relative z-20 flex flex-col items-center gap-2">
      <div
        role="radiogroup"
        aria-label={t("studioDesk.views")}
        className={cn(studioSwitcherClass, "rounded-full border border-white/15 bg-white/[0.04] px-0.5")}
        onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const views = ["inspirations", "production"] as const;
          const current = views.indexOf(deskView);
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? views.length - 1
              : (current + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + views.length) % views.length;
          setDeskView(views[nextIndex]!);
          const radios = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
          radios[nextIndex]?.focus();
        }}
      >
        {(["inspirations", "production"] as const).map((view) => {
          const checked = deskView === view;
          return (
            <button
              key={view}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setDeskView(view)}
              className={protocolRadioClass(checked)}
              style={checked ? protocolShineFill : undefined}
            >
              {t(`studioDesk.${view}`)}
            </button>
          );
        })}
      </div>
      {deskView === "production" ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {productionCampaignId
            ? t("studioDesk.campaignScope", { name: productionCampaignName })
            : brandName
              ? t("studioDesk.brandScope", { name: brandName })
              : null}
        </p>
      ) : null}
      {deskView === "production" && composer.clientProfileId ? (
        production.isPending ? (
          <p role="status">{t("studioDesk.loading")}</p>
        ) : production.isError && production.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2">
            <p role="alert">{t("studioDesk.error")}</p>
            <button type="button" onClick={() => void production.refetch()} className={studioChipClass}>{t("studioDesk.retry")}</button>
          </div>
        ) : production.isSuccess && production.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2">
            <p>{t("studioDesk.empty")}</p>
            <button
              type="button"
              onClick={() => {
                setBoxExpanded(true);
                composerRef.current?.focus();
              }}
              className={studioChipClass}
            >
              {t("studioDesk.create")}
            </button>
          </div>
        ) : production.isFetchNextPageError ? (
          <button type="button" onClick={() => void production.fetchNextPage()} className={studioChipClass}>{t("studioDesk.retry")}</button>
        ) : null
      ) : null}
      {allMosaicItems.length > 6 || (deskView === "production" ? production.hasNextPage : inspirationsQuery.hasNextPage) ? (
        <div className="flex gap-2">
          <button type="button" disabled={currentDeskPage === 0} onClick={() => setDeskPaging((current) => ({ ...current, page: Math.max(0, current.page - 1) }))} className={studioChipClass}>
            {t("studioDesk.previous")}
          </button>
          <button
            type="button"
            disabled={fetchingNextPage || (!hasBufferedNextPage && !hasRemoteNextPage)}
            onClick={() => void nextDeskPage()}
            className={studioChipClass}
          >
            {t("studioDesk.next")}
          </button>
        </div>
      ) : null}
    </div>
  );

  const showComposer = isCarouselWorkflow
    || resultStage
    || rolloutVariant === "control"
    || (rolloutVariant === "progressive" && composer.objectiveSelected);
  const talkBox = (
    <TalkBox
      placement={occupancy === "empty" ? "center" : "dock"}
      request={composer.request ?? ""}
      onRequestChange={(value) => composer.setRequest?.(value)}
      onRequestFocusChange={setRequestFocused}
      intent={composer.intent}
      onSelectIntent={(intent, immediate) => {
        setBoxExpanded(true);
        composer.selectIntent?.(intent, immediate);
      }}
      suggestedProtocol={interviewEnabled && !composer.objectiveSelected ? interview.suggestedProtocol : null}
      carouselEnabled={carouselCreationEnabled}
      sources={sources.map((source) => ({ id: source.id, name: source.name, previewUrl: source.previewUrl, usage: source.usage }))}
      bufferedFile={composer.bufferedFile ?? null}
      onAddFiles={(files) => {
        setBoxExpanded(true);
        void composer.addFiles?.(files);
      }}
      error={composer.error ?? null}
      announcement={composer.announcement ?? (composer.bufferedFile ? t("composer.progressiveBufferedFile", { name: composer.bufferedFile.name }) : null)}
      retryInitialTemplate={composer.retryInitialTemplate ?? null}
      onGenerate={() => void (
        occupancy === "empty" || rolloutVariant !== "progressive"
          ? composer.generateLegacy?.()
          : composer.preparePlan?.()
      )}
      queued={Boolean(composer.actionPhase && composer.actionPhase !== "idle") || composer.state === "generating"}
      generateLabel={occupancy === "empty" ? t("talkStart") : t("talkGenerate")}
      interview={interviewEnabled ? {
        enabled: true,
        chips: interview.chips,
        answers: interview.answers,
        locale: entryLocale,
        writtenToken: requestWriteToken,
        onSelect: interview.selectChip,
        continueLabel: t("entryInterview.continue"),
        showContinue: Boolean(interview.answeredProtocol && !composer.objectiveSelected),
        onContinue: () => {
          setBoxExpanded(true);
          void composer.selectIntent?.(interview.answeredProtocol!, true);
        },
      } : null}
      requestRef={composerRef}
      primaryActionRef={primaryActionRef}
      expansionButtonRef={expansionButtonRef}
      expanded={boxExpanded}
      onExpandedChange={setBoxExpanded}
      {...carouselTalkBoxProps}
      summary={brandName || sources.length > 0 ? <span className="text-xs text-[var(--text-secondary)]">
        {[composer.brandName, composer.format, sources.length ? `${sources.length}/3` : null]
          .filter(Boolean).join(" · ")}
      </span> : undefined}
    >
      {protocolSwitchControls}
      {showPlan && billing && !billing.access.hasSpendAccess ? (
        <section className="rounded-[var(--radius-object)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4" role="alert">
          <p className="font-semibold text-[var(--warning-text)]">{t("insufficientBalance")}</p>
          <Link href="/settings?tab=billing" className="mt-2 inline-flex text-sm font-semibold underline">{t("getCredits")}</Link>
        </section>
      ) : null}
      {showPlan ? (
        <CreativePlanReview
          plan={composer.preparedPlan!}
          busy={composer.actionPhase !== "idle"}
          onEdit={() => setEditingPreparedPlan(true)}
          onConfirm={(revision) => composer.confirmGeneration(revision)}
        />
      ) : null}
      {showComposer ? (
        <div hidden={showPlan}>
          <CreativeComposer
            composer={composer}
            composerRef={composerRef}
            workflowVariant={rolloutVariant === "progressive" ? "progressive" : "control"}
            resultsOnly={resultStage}
            chrome="stage"
            resultsContainer={resultsContainer}
            primaryActionRef={primaryActionRef}
            controlsActive={boxExpanded}
          />
        </div>
      ) : null}
    </TalkBox>
  );

  const resultStageContent = resultStage ? (
    <>
      <section aria-labelledby="progressive-results-title" data-testid="progressive-results-summary" className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{composer.workTitle ?? (composer.request?.trim() || t(`planReview.protocol.${composer.preparedPlan?.protocol === "format_adaptation" ? "formatAdaptation" : composer.preparedPlan?.protocol ?? composer.intent}`))}</p>
          <h2 ref={progressiveResultsHeadingRef} id="progressive-results-title" tabIndex={-1} className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{t("resultsTitle")}</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{composer.brandName ?? t("continueBrandUnknown")} · {resultSummaryLabel}</p>
      </section>
      <details className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("planUsed")}</summary>
        <div className="mt-3">
          <dl data-testid="progressive-readonly-configuration" className="grid gap-2 text-sm text-[var(--text-secondary)]">
            <div><dt className="font-medium text-[var(--text-primary)]">{t("composer.requestLabel")}</dt><dd>{composer.request}</dd></div>
            <div><dt className="font-medium text-[var(--text-primary)]">{t("chooseObjective")}</dt><dd>{t(`planReview.protocol.${composer.intent === "format_adaptation" ? "formatAdaptation" : composer.intent}`)}</dd></div>
            <div><dt className="font-medium text-[var(--text-primary)]">{t("composer.targetFormats")}</dt><dd>{composer.targetFormats?.join(", ")}</dd></div>
          </dl>
          {composer.preparedPlan ? <CreativePlanReview plan={composer.preparedPlan} busy={false} onEdit={() => undefined} onConfirm={() => undefined} readOnly /> : <p className="text-sm text-[var(--text-secondary)]">{composer.request || t("progressiveSubtitle")}</p>}
        </div>
      </details>
      <div data-testid="progressive-campaign-association" className="flex justify-end">
        <CreateCampaignDialog activeProfile={activeProfile} onCreated={composer.linkCampaign} />
      </div>
    </>
  ) : null;

  return (
    <div>
      <AccessGatePanel />
      <BrandStageHome
        occupancy={occupancy}
        brandName={brandName}
        headline={brandName ? t("stageHeadline", { name: brandName }) : t("stageHeadlineAnonymous")}
        subtitle={brandName ? t("stageEmptySubtitle") : t("stageEmptySubtitleAnonymous")}
        eyebrow={t("stageEyebrow")}
        mosaicItems={mosaicItems}
        repeatItems={deskView !== "production"}
        deskControls={deskControls}
        onSelectMosaic={(item) => {
          if (deskView === "production") {
            const piece = productionItems.find((value) => value.id === item.id);
            if (piece) router.push(piece.reviewHref);
            return;
          }
          const inspiration = inspirations.find((entry) => entry.id === item.id);
          if (inspiration) {
            setBoxExpanded(true);
            void composer.addInspiration?.(inspiration);
          }
        }}
        continueWork={isLoading && works.length === 0 ? (
          <div className="mx-auto h-6 w-48 max-w-full animate-pulse rounded-full bg-white/6" aria-hidden="true" />
        ) : continueTarget.kind === "work" ? (
          <ContinueWorkCard
            target={continueTarget}
            brandName={continueTarget.brandName ?? t("continueBrandUnknown")}
            density="tile"
          />
        ) : isError ? (
          <button
            type="button"
            onClick={() => void refetch()}
            className={studioChipClass}
          >
            {t("retry")}
          </button>
        ) : null}
        topBar={(
          <div
            data-testid="stage-brand-bar"
            className="flex min-w-0 w-full max-w-full items-center justify-end gap-2"
          >
            <Link
              href="/?mode=arte&compose=1&fresh=1"
              className={cn(studioChipClass, "shrink-0")}
            >
              <Plus size={16} aria-hidden="true" />
              {t("newWork")}
            </Link>
            <ActiveBrandSwitcher
              id="active-client-switcher-home"
              variant="grouped"
              className="min-w-0 flex-1 max-w-[16rem]"
            />
          </div>
        )}
        talkBox={talkBox}
        onDropFiles={(files) => {
          setBoxExpanded(true);
          void composer.addFiles?.(files);
        }}
        dropLabel={t("composer.dropTarget")}
        expanded={boxExpanded}
        resultsActive={resultStage}
        onCollapse={() => {
          expansionButtonRef.current?.focus();
          setBoxExpanded(false);
        }}
        results={(
          <>
            {resultStageContent}
            <div ref={setResultsContainer} />
          </>
        )}
      />
    </div>
  );
}
