"use client";

import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import {
  studioChipClass,
  studioChromeBarClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import type {
  CampaignWorkspaceV6Labels,
  CampaignWorkspaceV6ViewModel,
  WorkspaceV6BadgeVariant,
} from "./campaign-workspace-v6-types";

type CampaignWorkspaceV6ViewProps = {
  view: CampaignWorkspaceV6ViewModel;
  labels: CampaignWorkspaceV6Labels;
  campaignId?: string;
  isDraft?: boolean;
  onDelete?: () => void;
};

export function CampaignWorkspaceV6Chrome({
  view,
  labels,
  campaignId,
  isDraft = false,
  onDelete,
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
            <ContextualFeedbackButton quiet contextKind="campaign" campaignId={campaignId} />
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
    </div>
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
