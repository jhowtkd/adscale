"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import type {
  CampaignWorkspaceV6Labels,
  CampaignWorkspaceV6ViewModel,
  WorkspaceStageNavTab,
  WorkspaceV6BadgeVariant,
} from "./campaign-workspace-v6-types";

type CampaignWorkspaceV6ViewProps = {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
  campaignId?: string;
  isDraft?: boolean;
  onDelete?: () => void;
  onStageSelect?: (tab: WorkspaceStageNavTab) => void;
};

export function CampaignWorkspaceV6Chrome({
  view,
  labels,
  campaignId,
  isDraft = false,
  onDelete,
  onStageSelect,
}: CampaignWorkspaceV6ViewProps) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Link
            href="/campaigns"
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
          {campaignId ? (
            <ContextualFeedbackButton contextKind="campaign" campaignId={campaignId} />
          ) : null}
          {isDraft && onDelete ? (
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

const DEFAULT_STAGE_TABS: WorkspaceStageNavTab[] = [
  "briefing",
  "generate",
  "review",
  "share",
];

function WorkspaceStageList({
  view,
  labels,
  onStageSelect,
}: {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
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
          const canNavigate = Boolean(onStageSelect) && Boolean(tab);

          return (
            <li key={stage} className="flex items-center">
              {canNavigate ? (
                <button
                  type="button"
                  onClick={() => onStageSelect?.(tab)}
                  className={`flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 ${
                    isActive ? "border border-[var(--selection-border)] bg-[var(--active-navigation-bg)]" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <StageStepMarker step={step} isActive={isActive} isPast={isPast} />
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-[var(--active-navigation-text)]"
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
                    isActive ? "border border-[var(--selection-border)] bg-[var(--active-navigation-bg)]" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <StageStepMarker step={step} isActive={isActive} isPast={isPast} />
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-[var(--active-navigation-text)]"
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
          ? "border border-[var(--selection-border)] bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : isPast
            ? "border border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)]"
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
    danger: "bg-[var(--danger-bg)] text-[var(--danger-text)]",
    info: "bg-[var(--info-bg)] text-[var(--info-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]} ${className ?? ""}`}>
      {label}
    </span>
  );
}
