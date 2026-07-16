"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreativeSourceChip } from "./CreativeSourceChip";
import { useCreativeComposer, type ComposerIntent } from "./useCreativeComposer";

const FORMATS = ["1:1", "4:5", "9:16"] as const;

export function CreativeComposer({ initialWorkId, preset }: { initialWorkId?: string; preset?: ComposerIntent }) {
  const t = useTranslations("dashboard.home.composer");
  const { composerRef, ...composer } = useCreativeComposer({ initialWorkId });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reviewSourceId, setReviewSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (preset && preset !== composer.intent) composer.selectIntent(preset);
  }, [composer, preset]);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    void composer.addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <section aria-labelledby="creative-composer-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 id="creative-composer-title" className="text-2xl font-semibold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("subtitle")}</p>
        </div>
        <span className="rounded-full bg-[var(--surface-inset)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {t("brand")}: {composer.brandName ?? t("noBrand")}
        </span>
      </div>

      <div
        data-testid="creative-composer-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]"
      >
        <label htmlFor="creative-composer-request" className="sr-only">{t("requestLabel")}</label>
        <textarea
          ref={composerRef}
          id="creative-composer-request"
          aria-label={t("requestLabel")}
          value={composer.request}
          onChange={(event) => composer.setRequest(event.target.value)}
          placeholder={t("placeholder")}
          rows={5}
          className="w-full resize-y bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              id="creative-composer-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => void composer.addFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Paperclip size={16} aria-hidden="true" />
              {composer.isUploading ? t("uploading") : t("addArt")}
            </button>
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{t("dropHint")}</span>
          </div>
          <button
            type="button"
            disabled={!composer.canGenerate}
            onClick={() => void composer.generate()}
            className={cn(
              "inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Sparkles size={16} aria-hidden="true" />
            {t("generate", { count: composer.quote.unitCount, credits: composer.quote.credits })}
          </button>
        </div>
      </div>

      {composer.sources.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {composer.sources.map((source) => (
            <div key={source.id}>
              <CreativeSourceChip
                source={source}
                onUsageChange={(usage) => void composer.updateSource(source.id, usage)}
                onReview={() => setReviewSourceId((current) => current === source.id ? null : source.id)}
                onRetry={() => void composer.retrySource(source.id)}
                onRemove={() => void composer.removeSource(source.id)}
              />
              {reviewSourceId === source.id ? (
                <pre className="mt-2 overflow-auto rounded-[var(--radius-control)] bg-[var(--surface-inset)] p-3 text-xs text-[var(--text-secondary)]">
                  {JSON.stringify({ content: source.contentAnalysis, style: source.styleAnalysis }, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <details className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]">
          {t("optionalSettings")}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--text-secondary)]">
            <span className="mb-1 block">{t("format")}</span>
            <select
              value={composer.format}
              onChange={(event) => composer.setFormat(event.target.value as typeof composer.format)}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="mb-1 text-sm text-[var(--text-secondary)]">{t("targetFormats")}</legend>
            <div className="flex flex-wrap gap-3">
              {FORMATS.map((value) => (
                <label key={value} className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={composer.targetFormats.includes(value)}
                    onChange={() => composer.toggleTargetFormat(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      {composer.error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{composer.error}</p> : null}
      <p role="status" aria-live="polite" className="sr-only">{composer.announcement || composer.state}</p>
    </section>
  );
}
