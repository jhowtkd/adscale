"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, Check, Loader2, Upload } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useBrandTrainingAssets,
  useReviewBrandTrainingAsset,
  useUploadBrandTrainingAsset,
  type BrandTrainingAssetRecord,
} from "@/lib/hooks/use-brand-training";

const CATEGORIES = ["logo", "graphic", "character", "visual_reference"] as const;
type Category = (typeof CATEGORIES)[number];

const USAGE_MODES = ["exact", "reference", "rule"] as const;
type UsageMode = (typeof USAGE_MODES)[number];

interface AssetDraft {
  trainingCategory: Category;
  usageMode: UsageMode;
  analysis: NonNullable<BrandTrainingAssetRecord["trainingAnalysis"]>;
}

function formatReviewedAt(value: string | Date | null): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function BrandTrainingAssets({
  clientProfileId,
}: {
  clientProfileId: string;
}) {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);

  const assetsQuery = useBrandTrainingAssets(clientProfileId);
  const upload = useUploadBrandTrainingAsset(clientProfileId);
  const review = useReviewBrandTrainingAsset(clientProfileId);

  const assets = useMemo<BrandTrainingAssetRecord[]>(
    () => assetsQuery.data ?? [],
    [assetsQuery.data],
  );

  const pendingAnalysis = useMemo(
    () => assets.filter((a) => a.reviewStatus === "pending_analysis"),
    [assets],
  );
  const pendingApproval = useMemo(
    () => assets.filter((a) => a.reviewStatus === "pending_approval"),
    [assets],
  );
  const approved = useMemo(
    () => assets.filter((a) => a.reviewStatus === "approved"),
    [assets],
  );
  const archived = useMemo(
    () => assets.filter((a) => a.reviewStatus === "archived"),
    [assets],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    let remaining = list.length;
    list.forEach((file) => {
      upload.mutate(file, {
        onSuccess: () => {
          remaining -= 1;
          if (remaining === 0) {
            addToast("success", tc("saved"));
          }
        },
        onError: (err) => addToast("error", err.message),
      });
    });
  };

  return (
    <section className="space-y-5" aria-label={t("assets.title")}>
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("assets.title")}
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          {t("assets.description")}
        </p>
      </header>

      <UploadField
        disabled={upload.isPending}
        onFiles={handleFiles}
        onError={(msg) => addToast("error", msg)}
        errorMessage={upload.isPending ? null : null}
      />

      {assetsQuery.isLoading ? (
        <p
          className="text-xs text-[var(--text-muted)]"
          role="status"
        >
          {tc("loading")}
        </p>
      ) : null}

      {assets.length === 0 && !assetsQuery.isLoading ? (
        <EmptyState />
      ) : null}

      <Group
        title={t("assets.statusPendingAnalysis")}
        items={pendingAnalysis}
        renderItem={(asset) => (
          <PendingAnalysisCard key={asset.id} asset={asset} />
        )}
      />

      <Group
        title={t("assets.statusPendingApproval")}
        items={pendingApproval}
        renderItem={(asset) => (
          <PendingApprovalCard
            key={asset.id}
            asset={asset}
            onApprove={(input) =>
              review.mutate(
                { ...input, reviewStatus: "approved" },
                {
                  onSuccess: () => addToast("success", tc("saved")),
                  onError: (err) => addToast("error", err.message),
                },
              )
            }
            onArchive={(input) =>
              review.mutate(
                { ...input, reviewStatus: "archived" },
                {
                  onSuccess: () => addToast("success", tc("saved")),
                  onError: (err) => addToast("error", err.message),
                },
              )
            }
            submitting={review.isPending}
          />
        )}
      />

      <Group
        title={t("assets.statusApproved")}
        items={approved}
        renderItem={(asset) => (
          <ApprovedCard
            key={asset.id}
            asset={asset}
            onArchive={(input) =>
              review.mutate(
                { ...input, reviewStatus: "archived" },
                {
                  onSuccess: () => addToast("success", tc("saved")),
                  onError: (err) => addToast("error", err.message),
                },
              )
            }
            submitting={review.isPending}
          />
        )}
      />

      <Group
        title={t("assets.statusArchived")}
        items={archived}
        renderItem={(asset) => <ArchivedCard key={asset.id} asset={asset} />}
      />
    </section>
  );
}

/* ------------------------------ Sub-components ------------------------------ */

function UploadField({
  disabled,
  onFiles,
  onError,
}: {
  disabled: boolean;
  onFiles: (files: FileList | null) => void;
  onError: (msg: string) => void;
  errorMessage: string | null;
}) {
  const t = useTranslations("brandTraining");
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (files: FileList | null): File[] => {
    if (!files || files.length === 0) return [];
    const accepted = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]);
    const MAX_BYTES = 10 * 1024 * 1024;
    const valid: File[] = [];
    Array.from(files).forEach((file) => {
      if (!accepted.has(file.type)) {
        setValidationError(t("assets.uploadFailed"));
        onError(t("assets.uploadFailed"));
        return;
      }
      if (file.size <= 0 || file.size > MAX_BYTES) {
        setValidationError(t("assets.uploadFailed"));
        onError(t("assets.uploadFailed"));
        return;
      }
      valid.push(file);
    });
    if (valid.length > 0) setValidationError(null);
    return valid;
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="brand-training-files"
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-4 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent-green)]/50",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {disabled ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Upload size={14} />
        )}
        <span>{t("assets.uploadLabel")}</span>
        <input
          id="brand-training-files"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          disabled={disabled}
          onChange={(event) => {
            const valid = validate(event.target.files);
            if (valid.length > 0) {
              onFiles(event.target.files);
            }
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      <p className="text-[11px] text-[var(--text-muted)]">
        {t("assets.uploadHint")}
      </p>
      {validationError ? (
        <p role="alert" className="text-[11px] text-[var(--accent-rose)]">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("brandTraining");
  return (
    <div
      className="rounded-lg border border-dashed border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-4 text-center"
      role="status"
    >
      <p className="text-xs font-medium text-[var(--text-primary)]">
        {t("assets.emptyTitle")}
      </p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        {t("assets.emptyDescription")}
      </p>
    </div>
  );
}

function Group<T>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => renderItem(item))}
      </ul>
    </section>
  );
}

function AssetThumb({ url, label }: { url: string; label: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)]">
      <Image
        src={url}
        alt={label}
        fill
        unoptimized
        className="object-cover"
        sizes="(max-width: 640px) 100vw, 240px"
      />
    </div>
  );
}

function PendingAnalysisCard({ asset }: { asset: BrandTrainingAssetRecord }) {
  const t = useTranslations("brandTraining");
  return (
    <li
      role="status"
      aria-live="polite"
      className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3"
    >
      <AssetThumb url={asset.url} label={asset.label} />
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {asset.label}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {t("assets.statusPendingAnalysis")}
        </p>
      </div>
    </li>
  );
}

function PendingApprovalCard({
  asset,
  onApprove,
  onArchive,
  submitting,
}: {
  asset: BrandTrainingAssetRecord;
  onApprove: (input: Omit<AssetDraft, "analysis"> & {
    analysis: AssetDraft["analysis"];
  }) => void;
  onArchive: (input: Omit<AssetDraft, "analysis"> & {
    analysis: AssetDraft["analysis"];
  }) => void;
  submitting: boolean;
}) {
  const t = useTranslations("brandTraining");
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
  const blocksExact = usageMode === "exact" && !metadataHasAlpha;

  const buildInput = () => ({
    referenceId: asset.id,
    trainingCategory: category,
    usageMode,
    analysis,
  });

  return (
    <li
      role="status"
      aria-live="polite"
      className="space-y-3 rounded-lg border border-[var(--accent-green)]/40 bg-[var(--surface-raised)] p-3"
    >
      <AssetThumb url={asset.url} label={asset.label} />
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {asset.label}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {t("assets.statusPendingApproval")}
        </p>
      </div>

      <p className="text-[11px] text-[var(--text-muted)]">
        {t("assets.analysisExplanation")}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[11px] text-[var(--text-muted)]">
          <span>{t("assets.category")}</span>
          <select
            aria-label={t("assets.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="block w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]"
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`assets.categories.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-[var(--text-muted)]">
          <span>{t("assets.usageMode")}</span>
          <select
            aria-label={t("assets.usageMode")}
            value={usageMode}
            onChange={(e) => setUsageMode(e.target.value as UsageMode)}
            className="block w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]"
          >
            {USAGE_MODES.map((value) => (
              <option key={value} value={value}>
                {t(`assets.usageModes.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-[11px] text-[var(--text-muted)]">
        <span>{t("assets.descriptionField")}</span>
        <textarea
          value={analysis.description}
          onChange={(e) =>
            setAnalysis({ ...analysis, description: e.target.value })
          }
          rows={2}
          className="block w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]"
        />
      </label>

      {blocksExact ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--accent-rose)]/40 bg-[var(--accent-rose-dim)] px-2 py-1.5 text-[11px] text-[var(--accent-rose)]"
        >
          {t("assets.transparentRequired")}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() => onArchive(buildInput())}
        >
          <Archive size={14} className="mr-1" />
          {t("assets.archive")}
        </Button>
        <Button
          type="button"
          disabled={submitting || blocksExact}
          onClick={() => onApprove(buildInput())}
        >
          {submitting ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <Check size={14} className="mr-1" />
          )}
          {t("assets.approve")}
        </Button>
      </div>
    </li>
  );
}

function ApprovedCard({
  asset,
  onArchive,
  submitting,
}: {
  asset: BrandTrainingAssetRecord;
  onArchive: (input: {
    referenceId: string;
    trainingCategory: Category;
    usageMode: UsageMode;
    analysis: AssetDraft["analysis"];
  }) => void;
  submitting: boolean;
}) {
  const t = useTranslations("brandTraining");
  const reviewedAt = formatReviewedAt(asset.reviewedAt);
  const category = (asset.trainingCategory ?? "graphic") as Category;
  const usageMode = (asset.usageMode ?? "reference") as UsageMode;
  const analysis = asset.trainingAnalysis ?? {
    description: "",
    visualAttributes: [],
    rules: [],
    constraints: [],
    confidence: 0,
  };
  return (
    <li className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3">
      <AssetThumb url={asset.url} label={asset.label} />
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {asset.label}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {t(`assets.categories.${category}`)} · {t(`assets.usageModes.${usageMode}`)}
        </p>
        {reviewedAt ? (
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {t("assets.reviewedAt", { when: reviewedAt })}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() =>
            onArchive({
              referenceId: asset.id,
              trainingCategory: category,
              usageMode,
              analysis,
            })
          }
        >
          <Archive size={14} className="mr-1" />
          {t("assets.archive")}
        </Button>
      </div>
    </li>
  );
}

function ArchivedCard({ asset }: { asset: BrandTrainingAssetRecord }) {
  const t = useTranslations("brandTraining");
  return (
    <li
      role="status"
      className="space-y-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3 opacity-70"
    >
      <AssetThumb url={asset.url} label={asset.label} />
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {asset.label}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {t("assets.statusArchived")}
        </p>
      </div>
    </li>
  );
}