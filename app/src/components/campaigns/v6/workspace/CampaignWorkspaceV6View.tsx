"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import type {
  CampaignWorkspaceV6Labels,
  CampaignWorkspaceV6ViewModel,
  WorkspaceStageNavTab,
  WorkspaceV6BadgeVariant,
  WorkspaceV6DerivationCard,
} from "./campaign-workspace-v6-types";

type CampaignWorkspaceV6ViewProps = {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
  interactive?: boolean;
  campaignId?: string;
  isDraft?: boolean;
  onDelete?: () => void;
  briefingSlot?: ReactNode;
  derivationsSlot?: ReactNode;
  onOpenDerivation?: (id: string) => void;
  onStageSelect?: (tab: WorkspaceStageNavTab) => void;
};

export function CampaignWorkspaceV6Chrome({
  view,
  labels,
  interactive = true,
  campaignId,
  isDraft = false,
  onDelete,
  onStageSelect,
}: Omit<CampaignWorkspaceV6ViewProps, "briefingSlot" | "derivationsSlot" | "onOpenDerivation"> & {
  onStageSelect?: (tab: WorkspaceStageNavTab) => void;
}) {
  const backHref = interactive ? "/campaigns" : "/v6/campaigns";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span aria-hidden="true">←</span>
            {labels.backToCampaigns}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="product-page-title text-[var(--text-primary)]">{view.name}</h1>
            <WorkspaceBadge variant={view.statusVariant} label={view.status} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{view.meta}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!interactive ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]"
            >
              {labels.sendFeedback}
            </button>
          ) : null}
          {interactive && campaignId ? (
            <ContextualFeedbackButton contextKind="campaign" campaignId={campaignId} />
          ) : null}
          {interactive && isDraft && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={labels.deleteCampaign}
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={labels.deleteCampaign}
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
            >
              🗑
            </button>
          )}
        </div>
      </header>

      <WorkspaceStageList
        view={view}
        labels={labels}
        interactive={interactive}
        onStageSelect={onStageSelect}
      />
    </div>
  );
}

export function CampaignWorkspaceBriefingV6Panel({
  view,
  labels,
}: {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
}) {
  return <BriefingPanel view={view} labels={labels} />;
}

export default function CampaignWorkspaceV6View({
  view,
  labels,
  interactive = true,
  campaignId,
  isDraft = false,
  onDelete,
  briefingSlot,
  derivationsSlot,
  onOpenDerivation,
  onStageSelect,
}: CampaignWorkspaceV6ViewProps) {
  return (
    <div className="space-y-6">
      <CampaignWorkspaceV6Chrome
        view={view}
        labels={labels}
        interactive={interactive}
        campaignId={campaignId}
        isDraft={isDraft}
        onDelete={onDelete}
        onStageSelect={onStageSelect}
      />

      <section className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            {briefingSlot ?? <BriefingPanel view={view} labels={labels} />}
          </div>
          <div className="space-y-4">
            {derivationsSlot ?? (
              <DerivationsPanel
                view={view}
                labels={labels}
                interactive={interactive}
                onOpenDerivation={onOpenDerivation}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const DEFAULT_STAGE_TABS: WorkspaceStageNavTab[] = [
  "briefing",
  "generate",
  "review",
  "share",
];

function WorkspaceStageList({
  view,
  labels,
  interactive = true,
  onStageSelect,
}: {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
  interactive?: boolean;
  onStageSelect?: (tab: WorkspaceStageNavTab) => void;
}) {
  const stageTabs = view.stageTabs ?? DEFAULT_STAGE_TABS;

  return (
    <section aria-label={labels.stagesAria}>
      <ol className="flex flex-wrap items-center gap-2 sm:gap-0">
        {view.stages.map((stage, index) => {
          const step = index + 1;
          const isActive = step === view.currentStage;
          const isPast = step < view.currentStage;
          const tab = stageTabs[index];
          const canNavigate = interactive && Boolean(onStageSelect) && Boolean(tab);

          return (
            <li key={stage} className="flex items-center">
              {canNavigate ? (
                <button
                  type="button"
                  onClick={() => onStageSelect?.(tab)}
                  className={`flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 ${
                    isActive ? "bg-[var(--accent-green-dim)]" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <StageStepMarker step={step} isActive={isActive} isPast={isPast} />
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-[var(--accent-green-text)]"
                        : isPast
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {stage}
                  </span>
                </button>
              ) : (
                <div
                  className={`flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 ${
                    isActive ? "bg-[var(--accent-green-dim)]" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <StageStepMarker step={step} isActive={isActive} isPast={isPast} />
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-[var(--accent-green-text)]"
                        : isPast
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {stage}
                  </span>
                </div>
              )}
              {index < view.stages.length - 1 ? (
                <span className="mx-1 hidden h-px w-6 bg-[var(--border-default)] sm:block" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageStepMarker({
  step,
  isActive,
  isPast,
}: {
  step: number;
  isActive: boolean;
  isPast: boolean;
}) {
  return (
    <span
      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
        isActive
          ? "bg-[var(--accent-green)] text-[var(--accent-green-on-fill)]"
          : isPast
            ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
            : "border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-muted)]"
      }`}
    >
      {step}
    </span>
  );
}

function BriefingPanel({
  view,
  labels,
}: {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
}) {
  return (
    <>
      <div className="flex items-baseline gap-3">
        <h2 className="product-section-title text-[var(--text-primary)]">{labels.briefingTitle}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {labels.briefingVersion}
        </span>
      </div>

      <div className="space-y-4">
        {view.briefingSliders.map((slider) => (
          <div key={slider.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{slider.label}</span>
              <span className="font-mono text-[var(--text-primary)]">{slider.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div
                className="gradient-progress h-full rounded-full"
                style={{ width: `${slider.value}%` }}
                role="progressbar"
                aria-valuenow={slider.value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={slider.label}
              />
            </div>
          </div>
        ))}
      </div>

      {view.briefingRules.length > 0 ? (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{labels.rulesTitle}</p>
          <ul className="space-y-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
            {view.briefingRules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--neutral-dot)]" aria-hidden="true" />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function DerivationsPanel({
  view,
  labels,
  interactive,
  onOpenDerivation,
}: {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
  interactive: boolean;
  onOpenDerivation?: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="product-section-title text-[var(--text-primary)]">{labels.derivationsTitle}</h2>
          <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-muted)]">
            {view.derivations.length}
          </span>
        </div>
        {interactive ? (
          <button type="button" className="text-sm font-medium text-[var(--accent-primary-text)]">
            {labels.viewAllDerivations}
          </button>
        ) : (
          <button type="button" className="text-sm font-medium text-[var(--accent-primary-text)]">
            {labels.viewAllDerivations}
          </button>
        )}
      </div>

      {view.derivations.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.derivations.map((derivation) => (
            <DerivationCard
              key={derivation.id}
              derivation={derivation}
              labels={labels}
              interactive={interactive}
              onOpen={onOpenDerivation}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">—</p>
      )}
    </>
  );
}

function DerivationCard({
  derivation,
  labels,
  interactive,
  onOpen,
}: {
  derivation: WorkspaceV6DerivationCard;
  labels: CampaignWorkspaceV6Labels;
  interactive: boolean;
  onOpen?: (id: string) => void;
}) {
  return (
    <li className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className={`relative flex h-28 items-center justify-center ${derivation.gradient}`}>
        <span className="font-mono text-lg font-bold tracking-widest text-[var(--text-muted)]">{derivation.art}</span>
        <WorkspaceBadge variant={derivation.statusVariant} label={derivation.status} className="absolute left-2 top-2" />
        {derivation.score != null ? (
          <span className="absolute right-2 top-2 rounded bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
            {derivation.score}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{derivation.title}</p>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{derivation.variations}</span>
          <span className="font-mono">{derivation.version}</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={interactive ? () => onOpen?.(derivation.id) : undefined}
            className="flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] py-1.5 text-xs font-medium text-[var(--text-primary)]"
          >
            {labels.openDerivation}
          </button>
          <button
            type="button"
            aria-label={labels.moreOptionsFor(derivation.title)}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] hover:bg-[var(--surface-inset)]"
          >
            ⋮
          </button>
        </div>
      </div>
    </li>
  );
}

export function WorkspaceBadge({
  variant,
  label,
  className,
}: {
  variant: WorkspaceV6BadgeVariant;
  label: string;
  className?: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    info: "bg-[var(--info-bg)] text-[var(--info-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]} ${className ?? ""}`}>
      {label}
    </span>
  );
}
