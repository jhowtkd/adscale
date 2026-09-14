"use client";

import { useState } from "react";
import { Archive, Check, CircleX, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { studioQuietActionClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import type { BrandTrainingAssetRecord } from "@/lib/hooks/use-brand-training";

const CATEGORIES = ["logo", "graphic", "character", "person", "visual_reference"] as const;
type Category = (typeof CATEGORIES)[number];
const USAGE_MODES = ["exact", "reference", "rule"] as const;
type UsageMode = (typeof USAGE_MODES)[number];
export type RejectionReason = NonNullable<BrandTrainingAssetRecord["rejectionReason"]>;

export interface AssetDraft {
  trainingCategory: Category;
  usageMode: UsageMode;
  analysis: NonNullable<BrandTrainingAssetRecord["trainingAnalysis"]>;
}

const occupancyFieldClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export function isLegacyApproved(asset: BrandTrainingAssetRecord) {
  return asset.reviewStatus === "approved" && (!asset.reviewedAt || !asset.reviewedByUserId);
}

export function AssetReviewOccupancy({
  asset,
  submitting,
  onApprove,
  onConfirm,
  onArchive,
  onReject,
}: {
  asset: BrandTrainingAssetRecord;
  submitting: boolean;
  onApprove?: (input: AssetDraft) => void;
  onConfirm?: () => void;
  onArchive?: () => void;
  onReject?: (reason: RejectionReason) => void;
}) {
  const t = useTranslations("brandTraining");
  const needsDraft = asset.reviewStatus === "pending_approval" && Boolean(onApprove);
  const initialCategory = (asset.trainingCategory ?? "graphic") as Category;
  const initialMode = (asset.usageMode ?? "reference") as UsageMode;
  const initialAnalysis = asset.trainingAnalysis ?? {
    description: "",
    visualAttributes: [],
    rules: [],
    constraints: [],
    confidence: 0,
  };
  const [category, setCategory] = useState<Category>(initialCategory);
  const [usageMode, setUsageMode] = useState<UsageMode>(initialMode);
  const [analysis, setAnalysis] = useState<AssetDraft["analysis"]>(initialAnalysis);
  const metadataHasAlpha = asset.asset?.metadata?.hasAlpha === true;
  const blocksExact = needsDraft && usageMode === "exact" && !metadataHasAlpha;

  return (
    <div
      data-testid="brand-assets-review"
      role="status"
      aria-live="polite"
      className="space-y-4 pt-6"
    >
      {needsDraft ? (
        <>
          <p className="text-xs text-[var(--text-muted)]">{t("assets.analysisExplanation")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              <span>{t("assets.category")}</span>
              <select
                aria-label={t("assets.category")}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className={occupancyFieldClass}
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.categories.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              <span>{t("assets.usageMode")}</span>
              <select
                aria-label={t("assets.usageMode")}
                value={usageMode}
                onChange={(e) => setUsageMode(e.target.value as UsageMode)}
                className={occupancyFieldClass}
              >
                {USAGE_MODES.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.usageModes.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
            <span>{t("assets.descriptionField")}</span>
            <textarea
              value={analysis.description}
              onChange={(e) => setAnalysis({ ...analysis, description: e.target.value })}
              rows={2}
              className={cn(occupancyFieldClass, "resize-none")}
            />
          </label>
          {blocksExact ? (
            <p role="alert" className="text-xs text-[var(--danger-text)]">
              {t("assets.transparentRequired")}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        {onArchive ? (
          <button
            type="button"
            disabled={submitting}
            onClick={onArchive}
            className={studioQuietActionClass}
          >
            <Archive size={14} aria-hidden="true" />
            {t("assets.archive")}
          </button>
        ) : null}
        {onApprove ? (
          <button
            type="button"
            disabled={submitting || blocksExact}
            onClick={() =>
              onApprove({
                trainingCategory: category,
                usageMode,
                analysis,
              })
            }
            className={studioQuietActionClass}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            {t("assets.approve")}
          </button>
        ) : null}
        {onConfirm ? (
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className={studioQuietActionClass}
          >
            <Check size={14} aria-hidden="true" />
            {t("assets.confirmLegacy")}
          </button>
        ) : null}
      </div>

      {onReject ? <RejectControl submitting={submitting} onReject={onReject} /> : null}
    </div>
  );
}

function RejectControl({
  submitting,
  onReject,
}: {
  submitting: boolean;
  onReject: (reason: RejectionReason) => void;
}) {
  const t = useTranslations("brandTraining");
  const [code, setCode] = useState<RejectionReason["code"]>("brand_drift");
  const [note, setNote] = useState("");
  const reasonCodes: RejectionReason["code"][] = [
    "brand_drift",
    "excessive_accent_color",
    "generic_stock_photo",
    "decorative_3d",
    "text_density",
    "weak_hierarchy",
    "literal_reference_copy",
    "prohibited_element",
    "other",
  ];

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
        <span>{t("assets.rejectionReason")}</span>
        <select
          aria-label={t("assets.rejectionReason")}
          value={code}
          onChange={(event) => setCode(event.target.value as RejectionReason["code"])}
          className={occupancyFieldClass}
        >
          {reasonCodes.map((value) => (
            <option key={value} value={value}>
              {t(`assets.rejectionReasons.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
        <span>{t("assets.rejectionNote")}</span>
        <input
          aria-label={t("assets.rejectionNote")}
          value={note}
          maxLength={240}
          onChange={(event) => setNote(event.target.value)}
          className={occupancyFieldClass}
        />
      </label>
      <button
        type="button"
        disabled={submitting}
        onClick={() => onReject({ code, ...(note.trim() ? { note: note.trim() } : {}) })}
        className={studioQuietActionClass}
      >
        <CircleX size={14} aria-hidden="true" />
        {t("assets.reject")}
      </button>
    </div>
  );
}
