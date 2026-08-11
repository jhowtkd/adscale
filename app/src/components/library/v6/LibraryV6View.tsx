"use client";

import Image from "next/image";
import { useState } from "react";
import type { ReactNode } from "react";
import { Search, Upload, X } from "lucide-react";
import type { LibraryV6Asset, LibraryV6Labels } from "./library-v6-types";

type LibraryV6Filter = "all" | LibraryV6Asset["kind"];

type LibraryV6ViewProps = {
  labels: LibraryV6Labels;
  assets: LibraryV6Asset[];
  shownCount: number;
  totalCount: number;
  isLoading?: boolean;
  interactive?: boolean;
  searchQuery: string;
  onSearchChange?: (value: string) => void;
  activeFilter?: LibraryV6Filter;
  onFilterChange?: (value: LibraryV6Filter) => void;
  dragOver?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  onDropzoneClick?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onUploadClick?: () => void;
  onDeleteAsset?: (id: string, name: string) => void;
  onReplaceAsset?: () => void;
  emptyState?: ReactNode;
  useImagePreview?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
};

export default function LibraryV6View({
  labels,
  assets,
  shownCount,
  totalCount,
  isLoading = false,
  interactive = true,
  searchQuery,
  onSearchChange,
  activeFilter = "all",
  onFilterChange,
  dragOver = false,
  isUploading = false,
  uploadProgress = 0,
  onDropzoneClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadClick,
  onDeleteAsset,
  onReplaceAsset,
  emptyState,
  useImagePreview = true,
  onLoadMore,
  isLoadingMore = false,
}: LibraryV6ViewProps) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {labels.sectionLabel}
          </p>
          <h1 className="product-page-title text-[var(--text-primary)]">{labels.title}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={interactive ? onUploadClick : undefined}
          disabled={isUploading}
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--action-primary-text)] transition-colors hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
        >
          <Upload size={16} aria-hidden="true" />
          {isUploading ? `${uploadProgress}%` : labels.upload}
        </button>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div
          className={`flex flex-col items-center justify-center gap-2 border-b border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            dragOver
              ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
              : "border-[var(--border-default)] bg-[var(--surface-raised)]"
          }`}
          role="button"
          tabIndex={interactive ? 0 : undefined}
          aria-label={labels.dropzoneAria}
          onClick={interactive ? onDropzoneClick : undefined}
          onKeyDown={
            interactive
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDropzoneClick?.();
                  }
                }
              : undefined
          }
          onDragOver={interactive ? onDragOver : undefined}
          onDragLeave={interactive ? onDragLeave : undefined}
          onDrop={interactive ? onDrop : undefined}
        >
          <Upload size={24} className="text-[var(--utility-icon)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">{labels.dropzoneTitle}</p>
          <p className="text-xs text-[var(--text-muted)]">{labels.dropzoneHint}</p>
        </div>

        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--utility-icon)]"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchAria}
              value={searchQuery}
              onChange={interactive && onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
              readOnly={!interactive || !onSearchChange}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto pb-1" role="group" aria-label={labels.filtersAria}>
            {([
              ["all", labels.filterAll],
              ["reference", labels.filterReference],
              ["logo", labels.filterLogo],
              ["photo", labels.filterPhoto],
              ["generated", labels.filterGenerated],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeFilter === value}
                onClick={() => onFilterChange?.(value)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                  activeFilter === value
                    ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--text-primary)]"
                    : "border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--surface-inset)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
            {labels.countSummary
              .replace("{shown}", String(shownCount))
              .replace("{total}", String(totalCount))}
          </p>
        </div>

        {isLoading ? (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="h-48 animate-pulse rounded-[var(--radius-panel)] bg-[var(--surface-raised)]" />
            ))}
          </ul>
        ) : emptyState ? (
          <div className="p-6">{emptyState}</div>
        ) : assets.length > 0 ? (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <li key={asset.id}>
                <AssetCard
                  asset={asset}
                  labels={labels}
                  interactive={interactive}
                  useImagePreview={useImagePreview}
                  onDelete={onDeleteAsset}
                  onReplace={onReplaceAsset}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6">{emptyState}</div>
        )}

        {!isLoading && interactive && shownCount < totalCount ? (
          <div className="flex justify-center border-t border-[var(--border-subtle)] p-4">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="rounded-[var(--radius-control)] border border-[var(--selection-border)] bg-[var(--active-navigation-bg)] px-4 py-2 text-sm font-medium text-[var(--active-navigation-text)] transition-colors hover:bg-[var(--selection-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
            >
              {isLoadingMore ? labels.loadingMore : labels.loadMore}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AssetCard({
  asset,
  labels,
  interactive,
  useImagePreview,
  onDelete,
  onReplace,
}: {
  asset: LibraryV6Asset;
  labels: LibraryV6Labels;
  interactive: boolean;
  useImagePreview: boolean;
  onDelete?: (id: string, name: string) => void;
  onReplace?: () => void;
}) {
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "no-preview" | "error">(
    useImagePreview && asset.imageUrl ? "loading" : "no-preview",
  );
  const [retryKey, setRetryKey] = useState(0);
  const kindLabel = {
    reference: labels.filterReference,
    logo: labels.filterLogo,
    photo: labels.filterPhoto,
    generated: labels.filterGenerated,
  }[asset.kind];

  const retryPreview = () => {
    if (!asset.imageUrl) return;
    setPreviewState("loading");
    setRetryKey((key) => key + 1);
  };

  return (
    <article
      data-motion-highlight="focus"
      className="group overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-product)] focus-within:border-[var(--selection-border)] focus-within:bg-[var(--selection-bg)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]"
    >
      <div className={`relative flex h-32 items-center justify-center ${asset.gradient}`} data-preview-state={previewState}>
        {(previewState === "loading" || previewState === "ready") && asset.imageUrl ? (
          <Image
            key={`${asset.id}-${retryKey}`}
            src={asset.imageUrl}
            alt={asset.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
            onLoad={() => setPreviewState("ready")}
            onError={() => setPreviewState("error")}
          />
        ) : previewState === "loading" ? (
          <span role="status" aria-label={labels.previewLoading} className="text-xs text-[var(--text-muted)]">
            {labels.previewLoading}
          </span>
        ) : previewState === "error" ? (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-xs text-[var(--text-muted)]">
            <span role="img" aria-label={labels.previewError}>{labels.previewError}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={retryPreview}
                className="rounded border border-[var(--border-default)] px-2 py-1 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {labels.retryPreview}
              </button>
              {interactive && onReplace ? (
                <button
                  type="button"
                  onClick={onReplace}
                  className="rounded border border-[var(--border-default)] px-2 py-1 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {labels.replaceAsset}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <span role="img" aria-label={labels.previewNoPreview} className="font-mono text-sm font-bold tracking-widest text-[var(--text-muted)]">
            {asset.glyph}
          </span>
        )}
        {previewState === "loading" && asset.imageUrl ? (
          <span role="status" aria-label={labels.previewLoading} className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded bg-black/60 px-2 py-1 text-[10px] text-white">
            {labels.previewLoading}
          </span>
        ) : null}
        {interactive && onDelete ? (
          <button
            type="button"
            aria-label={labels.deleteAsset}
            onClick={() => onDelete(asset.id, asset.name)}
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{asset.name}</p>
        {asset.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="font-mono">{asset.sizeLabel}</span>
          <span>{asset.dimensionsLabel}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
          <div><dt className="inline">{labels.originLabel}: </dt><dd className="inline">{asset.source}</dd></div>
          <div><dt className="inline">{labels.functionLabel}: </dt><dd className="inline">{kindLabel}</dd></div>
          <div><dt className="inline">{labels.createdLabel}: </dt><dd className="inline">{asset.createdAtLabel}</dd></div>
          <div><dt className="inline">Ratio: </dt><dd className="inline">{asset.aspectRatioLabel}</dd></div>
        </dl>
      </div>
    </article>
  );
}
