"use client";

import Image from "next/image";
import { useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { Search, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioBentoClass,
  studioBentoItemClass,
  studioChipClass,
  studioChromeBarClass,
  studioFilterStripClass,
  studioInstrumentClass,
  studioQuietActionClass,
  studioSearchClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import type { LibraryV6Asset, LibraryV6Filter, LibraryV6Labels } from "./library-v6-types";

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

function averageImageLuminance(image: HTMLImageElement): number | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let luminance = 0;
    let alphaTotal = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha === 0) continue;
      luminance += ((0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255) * alpha;
      alphaTotal += alpha;
    }

    return alphaTotal > 0 ? luminance / alphaTotal : null;
  } catch {
    // Private or cross-origin assets can make canvas reads unavailable.
    return null;
  }
}

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
  const showOccupancy = !isLoading && assets.length === 0 && !emptyState;

  return (
    <div className={cn(studioInstrumentClass, "py-0 pb-6")} aria-busy={isLoading}>
      <div className={studioChromeBarClass}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          {labels.sectionLabel}
        </p>
        <button
          type="button"
          onClick={interactive ? onUploadClick : undefined}
          disabled={isUploading}
          className={studioChipClass}
        >
          <Upload size={14} aria-hidden="true" />
          {isUploading ? `${uploadProgress}%` : labels.upload}
        </button>
      </div>

      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">{labels.title}</h1>
        {labels.subtitle ? (
          <p className="text-sm text-[var(--text-secondary)]">{labels.subtitle}</p>
        ) : null}
      </header>

      <section
        onDragOver={interactive ? onDragOver : undefined}
        onDragLeave={interactive ? onDragLeave : undefined}
        onDrop={interactive ? onDrop : undefined}
        className={cn(
          "rounded-[var(--radius-object)] transition-colors",
          dragOver && "bg-[var(--selection-bg)] ring-2 ring-[var(--focus-ring)]",
        )}
      >
        <div data-testid="library-filter-strip" className={studioFilterStripClass}>
          <div className="relative w-[7.25rem] shrink-0 transition-[width] duration-200 ease-out focus-within:w-52 sm:w-36">
            <Search
              size={14}
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[var(--utility-icon)]"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchAria}
              value={searchQuery}
              onChange={interactive && onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
              readOnly={!interactive || !onSearchChange}
              className={cn(
                studioSearchClass,
                "h-9 min-w-0 rounded-full bg-transparent py-0 pl-6 pr-2 text-xs",
              )}
            />
          </div>
          <span className="hidden h-3.5 w-px shrink-0 bg-white/12 sm:block" aria-hidden="true" />
          <DiscreetRadios
            label={labels.filtersAria}
            value={activeFilter}
            onChange={onFilterChange}
            className="min-w-0 flex-1 justify-center"
            options={[
              { value: "all", label: labels.filterAll },
              { value: "reference", label: labels.filterReference },
              { value: "logo", label: labels.filterLogo },
              { value: "photo", label: labels.filterPhoto },
              { value: "generated", label: labels.filterGenerated },
              { value: "favorite", label: labels.filterFavorite },
            ]}
          />
          <p
            role="status"
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]"
          >
            <span className="sr-only">
              {labels.countSummary
                .replace("{shown}", String(shownCount))
                .replace("{total}", String(totalCount))}
            </span>
            <span aria-hidden="true">{shownCount}/{totalCount}</span>
          </p>
        </div>

        {isLoading ? (
          <ul className={studioBentoClass} aria-hidden="true">
            {["h-52", "h-40", "h-64", "h-48", "h-56", "h-36", "h-60", "h-44"].map((height, i) => (
              <li key={i} className={studioBentoItemClass}>
                <div className={cn("animate-pulse rounded-2xl bg-white/6", height)} />
              </li>
            ))}
          </ul>
        ) : emptyState ? (
          <div className="pt-10">{emptyState}</div>
        ) : assets.length > 0 ? (
          <ul className={studioBentoClass} data-testid="library-bento">
            {assets.map((asset) => (
              <li key={asset.id} className={studioBentoItemClass}>
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
        ) : showOccupancy ? (
          <button
            type="button"
            aria-label={labels.dropzoneAria}
            onClick={interactive ? onDropzoneClick : undefined}
            className="mt-10 flex w-full flex-col items-center justify-center gap-1 py-16 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <p className="text-sm text-[var(--text-secondary)]">{labels.dropzoneTitle}</p>
            <p className="text-xs text-[var(--text-muted)]">{labels.dropzoneHint}</p>
          </button>
        ) : null}

        {!isLoading && interactive && shownCount < totalCount ? (
          <div className="flex justify-center pt-6">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className={studioQuietActionClass}
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
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "dark" | "no-preview" | "error">(
    useImagePreview && asset.imageUrl ? "loading" : "no-preview",
  );
  const [retryKey, setRetryKey] = useState(0);
  const [measuredSize, setMeasuredSize] = useState<string | null>(null);
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

  const handlePreviewLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.naturalWidth && image.naturalHeight) {
      setMeasuredSize(`${image.naturalWidth}×${image.naturalHeight}`);
    }
    const luminance = averageImageLuminance(image);
    setPreviewState(luminance !== null && luminance < 0.18 ? "dark" : "ready");
  };

  const width = asset.width || 1080;
  const height = asset.height || 1080;
  const dimensionsLabel = asset.dimensionsLabel !== "—" ? asset.dimensionsLabel : measuredSize;
  const roverMeta = [asset.sizeLabel, dimensionsLabel, kindLabel].filter(Boolean).join(" · ");

  return (
    <article
      data-motion-highlight="focus"
      className="group relative overflow-hidden rounded-2xl bg-white/[0.04] transition-[box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-product)] focus-within:shadow-[0_0_0_2px_var(--focus-ring)]"
    >
      <div
        className={cn("relative", !asset.imageUrl && asset.gradient)}
        data-preview-state={previewState}
      >
        {(previewState === "loading" || previewState === "ready" || previewState === "dark") && asset.imageUrl ? (
          <Image
            key={`${asset.id}-${retryKey}`}
            src={asset.imageUrl}
            alt={previewState === "dark" ? `${asset.name} — ${labels.previewDark}` : asset.name}
            width={width}
            height={height}
            className="block h-auto w-full"
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
            onLoad={handlePreviewLoad}
            onError={() => setPreviewState("error")}
          />
        ) : previewState === "error" ? (
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 px-3 text-center text-xs text-[var(--text-muted)]">
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
          <div className="flex aspect-[4/5] items-center justify-center">
            {previewState === "loading" ? (
              <span role="status" aria-label={labels.previewLoading} className="text-xs text-[var(--text-muted)]">
                {labels.previewLoading}
              </span>
            ) : (
              <span role="img" aria-label={labels.previewNoPreview} className="font-mono text-sm font-bold tracking-widest text-[var(--text-muted)]">
                {asset.glyph}
              </span>
            )}
          </div>
        )}

        {previewState === "loading" && asset.imageUrl ? (
          <span role="status" aria-label={labels.previewLoading} className="sr-only">
            {labels.previewLoading}
          </span>
        ) : null}

        {previewState !== "error" ? (
          <div
            data-testid="library-asset-rover"
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-[oklch(0.12_0.003_260)] px-2.5 py-2 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <p className="truncate text-xs font-medium text-[var(--text-primary)]">{asset.name}</p>
            {roverMeta ? (
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-secondary)]">{roverMeta}</p>
            ) : null}
            {previewState === "dark" ? (
              <span role="status" aria-label={labels.previewDark} className="mt-1 block text-[10px] text-[var(--text-secondary)]">
                {labels.previewDark}
              </span>
            ) : null}
          </div>
        ) : null}

        {interactive && onDelete ? (
          <button
            type="button"
            aria-label={labels.deleteAsset}
            onClick={() => onDelete(asset.id, asset.name)}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [@media(hover:none)]:opacity-100"
          >
            <X size={11} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <dl className="sr-only">
        <div><dt>{labels.originLabel}</dt><dd>{asset.source}</dd></div>
        <div><dt>{labels.functionLabel}</dt><dd>{kindLabel}</dd></div>
        <div><dt>{labels.createdLabel}</dt><dd>{asset.createdAtLabel}</dd></div>
      </dl>
    </article>
  );
}
