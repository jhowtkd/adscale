"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import type { CreativeWorkSource } from "@/lib/hooks/use-creative-work";

export type CreativeSourcePreviewCardProps = {
  label: string;
  source: CreativeWorkSource | null;
  isUploading: boolean;
  onChoose: () => void;
  onDrop: (files: FileList | File[]) => void;
  onRetry: () => void;
  onRemove: () => void;
};

export function CreativeSourcePreviewCard({
  label,
  source,
  isUploading,
  onChoose,
  onDrop,
  onRetry,
  onRemove,
}: CreativeSourcePreviewCardProps) {
  const t = useTranslations("dashboard.home.composer");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [trackedPreviewUrl, setTrackedPreviewUrl] = useState(source?.previewUrl);

  if (source?.previewUrl !== trackedPreviewUrl) {
    setTrackedPreviewUrl(source?.previewUrl);
    setPreviewFailed(false);
  }

  const hasPreview = Boolean(source?.previewUrl) && !previewFailed;
  const isOriginal = label === t("originalArt");
  const addLabel = isOriginal ? t("addOriginalArt") : t("addStyleArt");
  const removeLabel = isOriginal ? t("removeOriginalArt") : t("removeStyleArt");

  const statusLabel = isUploading
    ? t("sourceUploading")
    : source?.status === "uploaded"
      ? t("sourceStatus_uploaded")
      : source?.status === "analyzing"
        ? t("sourceStatus_analyzing")
        : source?.status === "ready"
          ? t("sourceReady")
          : source?.status === "failed"
            ? t("sourceStatus_failed")
            : null;

  return (
    <article
      className="flex flex-col overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-inset)]"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          {label}
        </span>
        {source ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            {t("removeSource")}
          </button>
        ) : null}
      </div>

      <div className="relative m-3 aspect-[4/5] overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-base)]">
        {hasPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated asset route, not a static CDN path
          <img
            src={source!.previewUrl!}
            alt={label}
            onError={() => setPreviewFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : source ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">
            {t("previewUnavailable")}
          </div>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            aria-label={addLabel}
            className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <Paperclip size={18} aria-hidden="true" />
            {addLabel}
          </button>
        )}
      </div>

      {statusLabel ? (
        <p role="status" aria-live="polite" className="px-3 pb-3 text-xs text-[var(--text-muted)]">
          {statusLabel}
        </p>
      ) : null}

      {source?.status === "failed" ? (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-[var(--accent-primary-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            {t("retrySource")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
