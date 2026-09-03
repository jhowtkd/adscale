"use client";

import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioChipClass,
  studioChromeBarClass,
  studioFilterStripClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
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
      <div className={studioChromeBarClass}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          {labels.sectionLabel}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {view.status ? (
            <p
              role="status"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
            >
              {view.status}
            </p>
          ) : null}
          {campaignId ? (
            <Link
              href={`/?mode=arte&compose=1&campaignId=${campaignId}`}
              className={studioChipClass}
            >
              <Plus size={14} aria-hidden="true" />
              {labels.newPiece}
            </Link>
          ) : null}
          {campaignId ? (
            <ContextualFeedbackButton contextKind="campaign" campaignId={campaignId} />
          ) : null}
          {isDraft && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={labels.deleteCampaign}
              className={studioQuietActionClass}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <Link href="/campaigns" className={studioQuietActionClass}>
        <ArrowLeft size={16} aria-hidden="true" />
        {labels.backToCampaigns}
      </Link>

      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">{view.name}</h1>
        {view.meta ? (
          <p className="text-sm text-[var(--text-secondary)]">{view.meta}</p>
        ) : null}
      </header>

      <div className={studioFilterStripClass}>
        <WorkspaceStageList
          view={view}
          labels={labels}
          onStageSelect={onStageSelect}
        />
      </div>
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
  const options = view.stages.flatMap((stage, index) => {
    const value = stageTabs[index];
    return value ? [{ value, label: stage }] : [];
  });
  const currentTab =
    stageTabs[Math.max(0, view.currentStage - 1)] ?? options[0]?.value;

  if (!currentTab || options.length === 0) return null;

  return (
    <DiscreetRadios
      label={labels.stagesAria}
      value={currentTab}
      onChange={onStageSelect}
      className="min-w-0 flex-1 justify-center"
      options={options}
    />
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
      <h2 className="product-section-title text-[var(--text-primary)]">{labels.briefingTitle}</h2>

      <div className="space-y-4">
        {view.briefingSliders.map((slider) => (
          <div key={slider.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{slider.label}</span>
              <span className="font-mono text-[var(--text-primary)]">{slider.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
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
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{labels.rulesTitle}</p>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
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
