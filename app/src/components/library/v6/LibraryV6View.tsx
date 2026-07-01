"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { Search, Upload, X } from "lucide-react";
import type { LibraryV6Asset, LibraryV6Labels } from "./library-v6-types";

type LibraryV6ViewProps = {
  labels: LibraryV6Labels;
  assets: LibraryV6Asset[];
  shownCount: number;
  totalCount: number;
  isLoading?: boolean;
  interactive?: boolean;
  searchQuery: string;
  onSearchChange?: (value: string) => void;
  dragOver?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  onDropzoneClick?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onUploadClick?: () => void;
  onDeleteAsset?: (id: string, name: string) => void;
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
  dragOver = false,
  isUploading = false,
  uploadProgress = 0,
  onDropzoneClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onUploadClick,
  onDeleteAsset,
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
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
        >
          <Upload size={16} aria-hidden="true" />
          {isUploading ? `${uploadProgress}%` : labels.upload}
        </button>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div
          className={`flex flex-col items-center justify-center gap-2 border-b border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            dragOver
              ? "border-[var(--border-strong)] bg-[var(--surface-inset)]"
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
          <Upload size={24} className="text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--text-primary)]">{labels.dropzoneTitle}</p>
          <p className="text-xs text-[var(--text-muted)]">{labels.dropzoneHint}</p>
        </div>

        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchAria}
              value={searchQuery}
              onChange={interactive && onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
              readOnly={!interactive}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
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
              className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-inset)] disabled:opacity-60"
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
}: {
  asset: LibraryV6Asset;
  labels: LibraryV6Labels;
  interactive: boolean;
  useImagePreview: boolean;
  onDelete?: (id: string, name: string) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className={`relative flex h-32 items-center justify-center ${asset.gradient}`}>
        {useImagePreview && asset.imageUrl ? (
          <Image
            src={asset.imageUrl}
            alt={asset.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
          />
        ) : (
          <span className="font-mono text-sm font-bold tracking-widest text-[var(--text-muted)]">{asset.glyph}</span>
        )}
        {interactive && onDelete ? (
          <button
            type="button"
            aria-label={labels.deleteAsset}
            onClick={() => onDelete(asset.id, asset.name)}
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-[color-mix(in_oklch,var(--text-primary)_55%,transparent)] text-[var(--text-on-accent)] opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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
      </div>
    </article>
  );
}
