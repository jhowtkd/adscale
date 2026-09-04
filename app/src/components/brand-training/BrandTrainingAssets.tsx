"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioBentoClass,
  studioBentoItemClass,
  studioChipClass,
  studioFilterStripClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useBrandTrainingAssets,
  useReviewBrandTrainingAsset,
  useUploadBrandTrainingAsset,
  type BrandTrainingAssetRecord,
} from "@/lib/hooks/use-brand-training";
import {
  AssetReviewOccupancy,
  isLegacyApproved,
  type AssetDraft,
  type RejectionReason,
} from "./BrandTrainingAssetReview";

type Category = "logo" | "graphic" | "character" | "visual_reference";
type UsageMode = "exact" | "reference" | "rule";
type ReferenceFilter = "all" | "review" | "approved" | "archive";

function referenceBucket(asset: BrandTrainingAssetRecord): Exclude<ReferenceFilter, "all"> {
  if (
    asset.reviewStatus === "pending_analysis" ||
    asset.reviewStatus === "pending_approval" ||
    isLegacyApproved(asset)
  ) {
    return "review";
  }
  if (asset.reviewStatus === "approved") return "approved";
  return "archive";
}

function fallbackCategory(asset: BrandTrainingAssetRecord): Category {
  return (asset.trainingCategory as Category | null) ?? "visual_reference";
}

function fallbackUsage(asset: BrandTrainingAssetRecord): UsageMode {
  return (asset.usageMode as UsageMode | null) ?? "reference";
}

export function BrandTrainingAssets({
  clientProfileId,
}: {
  clientProfileId: string;
}) {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assetsQuery = useBrandTrainingAssets(clientProfileId);
  const upload = useUploadBrandTrainingAsset(clientProfileId);
  const review = useReviewBrandTrainingAsset(clientProfileId);

  const assets = useMemo<BrandTrainingAssetRecord[]>(
    () => assetsQuery.data ?? [],
    [assetsQuery.data],
  );
  const [filter, setFilter] = useState<ReferenceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? assets : assets.filter((asset) => referenceBucket(asset) === filter)),
    [assets, filter],
  );
  const selected = visible.find((asset) => asset.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      return;
    }
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    let remaining = list.length;
    list.forEach((file) => {
      upload.mutate(file, {
        onSuccess: () => {
          remaining -= 1;
          if (remaining === 0) addToast("success", tc("saved"));
        },
        onError: (err) => addToast("error", err.message),
      });
    });
  };

  const validate = (files: FileList | null): File[] => {
    if (!files || files.length === 0) return [];
    const accepted = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
    const MAX_BYTES = 10 * 1024 * 1024;
    const valid: File[] = [];
    Array.from(files).forEach((file) => {
      if (!accepted.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
        setValidationError(t("assets.uploadFailed"));
        addToast("error", t("assets.uploadFailed"));
        return;
      }
      valid.push(file);
    });
    if (valid.length > 0) setValidationError(null);
    return valid;
  };

  const openFilePicker = () => {
    if (!upload.isPending) fileInputRef.current?.click();
  };

  const mutateReview = (
    asset: BrandTrainingAssetRecord,
    patch: {
      reviewStatus: "approved" | "archived" | "rejected";
      analysis?: BrandTrainingAssetRecord["trainingAnalysis"] | null;
      rejectionReason?: RejectionReason;
      trainingCategory?: Category;
      usageMode?: UsageMode;
    },
  ) => {
    review.mutate(
      {
        referenceId: asset.id,
        trainingCategory: patch.trainingCategory ?? fallbackCategory(asset),
        usageMode: patch.usageMode ?? fallbackUsage(asset),
        analysis: patch.analysis === undefined ? asset.trainingAnalysis ?? null : patch.analysis,
        reviewStatus: patch.reviewStatus,
        ...(patch.rejectionReason ? { rejectionReason: patch.rejectionReason } : {}),
      },
      {
        onSuccess: () => addToast("success", tc("saved")),
        onError: (err) => addToast("error", err.message),
      },
    );
  };

  return (
    <section
      data-testid="brand-kit-assets"
      aria-label={t("assets.title")}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const valid = validate(e.dataTransfer.files);
        if (valid.length > 0) handleFiles(e.dataTransfer.files);
      }}
      className={cn("space-y-4", isDragging && "rounded-[var(--radius-object)] bg-[var(--selection-bg)] ring-2 ring-[var(--focus-ring)]")}
    >
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={upload.isPending}
          className={studioChipClass}
        >
          {upload.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          <span>{t("assets.uploadChip")}</span>
        </button>
        <input
          ref={fileInputRef}
          id="brand-training-files"
          type="file"
          aria-label={t("assets.uploadLabel")}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          disabled={upload.isPending}
          onChange={(event) => {
            const valid = validate(event.target.files);
            if (valid.length > 0) handleFiles(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </div>

      <div data-testid="brand-assets-strip" className={studioFilterStripClass}>
        <DiscreetRadios
          label={t("assets.filterAria")}
          value={filter}
          onChange={setFilter}
          className="min-w-0 flex-1 justify-center"
          options={[
            { value: "all", label: t("assets.filterAll") },
            { value: "review", label: t("assets.filterReview") },
            { value: "approved", label: t("assets.filterApproved") },
            { value: "archive", label: t("assets.filterArchive") },
          ]}
        />
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {visible.length}/{assets.length}
        </p>
      </div>

      {assetsQuery.isLoading ? (
        <p className="text-xs text-[var(--text-muted)]" role="status">
          {tc("loading")}
        </p>
      ) : null}

      {assets.length === 0 && !assetsQuery.isLoading ? (
        <button
          type="button"
          onClick={openFilePicker}
          className="flex w-full flex-col items-center justify-center gap-1 py-16 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <p className="text-sm text-[var(--text-secondary)]">{t("assets.emptyTitle")}</p>
          <p className="text-xs text-[var(--text-muted)]">{t("assets.emptyDescription")}</p>
        </button>
      ) : null}

      {visible.length > 0 ? (
        <ul className={studioBentoClass} data-testid="brand-assets-bento">
          {visible.map((asset) => (
            <li key={asset.id} className={studioBentoItemClass}>
              <ReferenceTile
                asset={asset}
                selected={selected?.id === asset.id}
                onSelect={() => setSelectedId(asset.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {validationError ? (
        <p role="alert" className="text-xs text-[var(--danger-text)]">
          {validationError}
        </p>
      ) : null}

      {selected &&
      selected.reviewStatus !== "pending_analysis" &&
      selected.reviewStatus !== "rejected" ? (
        <AssetReviewOccupancy
          key={selected.id}
          asset={selected}
          submitting={review.isPending}
          onApprove={
            selected.reviewStatus === "pending_approval"
              ? (draft: AssetDraft) =>
                  mutateReview(selected, {
                    reviewStatus: "approved",
                    trainingCategory: draft.trainingCategory,
                    usageMode: draft.usageMode,
                    analysis: draft.analysis,
                  })
              : undefined
          }
          onConfirm={
            isLegacyApproved(selected)
              ? () =>
                  mutateReview(selected, {
                    reviewStatus: "approved",
                    analysis: selected.trainingAnalysis ?? null,
                  })
              : undefined
          }
          onArchive={
            selected.reviewStatus !== "archived"
              ? () => mutateReview(selected, { reviewStatus: "archived", analysis: null })
              : undefined
          }
          onReject={(reason) =>
            mutateReview(selected, {
              reviewStatus: "rejected",
              analysis: selected.trainingAnalysis ?? null,
              rejectionReason: reason,
            })
          }
        />
      ) : null}
    </section>
  );
}

function ReferenceTile({
  asset,
  selected,
  onSelect,
}: {
  asset: BrandTrainingAssetRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("brandTraining");
  const statusKey =
    asset.reviewStatus === "pending_analysis"
      ? "assets.statusPendingAnalysis"
      : asset.reviewStatus === "pending_approval"
        ? "assets.statusPendingApproval"
        : isLegacyApproved(asset)
          ? "assets.statusLegacyUnreviewed"
          : asset.reviewStatus === "approved"
            ? "assets.statusApproved"
            : asset.reviewStatus === "archived"
              ? "assets.statusArchived"
              : "assets.statusRejected";

  return (
    <article
      role={asset.reviewStatus === "pending_analysis" ? "status" : undefined}
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-white/[0.04]",
        selected && "ring-2 ring-[var(--focus-ring)]",
        asset.reviewStatus === "pending_analysis" && "opacity-80",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${asset.label} · ${t(statusKey)}`}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <Image
          src={asset.url}
          alt=""
          width={800}
          height={800}
          unoptimized
          className="block h-auto w-full"
        />
        <div
          data-testid="brand-assets-rover"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2.5 pb-2.5 pt-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <p className="truncate text-xs font-medium text-white">{asset.label}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-white/70">{t(statusKey)}</p>
        </div>
      </button>
    </article>
  );
}
