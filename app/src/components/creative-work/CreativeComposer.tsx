"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { CreativeSourceChip } from "./CreativeSourceChip";
import { CreativeSourcePreviewCard } from "./CreativeSourcePreviewCard";
import { CreativeVariationBrief } from "./CreativeVariationBrief";
import CreativeProposalGrid from "@/components/quick-tools/create-post/CreativeProposalGrid";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";

const FORMATS = ["1:1", "4:5", "9:16"] as const;

export function CreativeComposer({ composer, composerRef }: {
  composer: CreativeComposerViewModel;
  composerRef: CreativeComposerModel["composerRef"];
}) {
  const t = useTranslations("dashboard.home.composer");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  // R-008: when the brand conflict appears, focus moves to the choice so
  // keyboard/screen-reader users land on the only pending decision.
  const brandConflictChoiceRef = useRef<HTMLButtonElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const hadBrandConflictRef = useRef(false);
  useEffect(() => {
    if (composer.brandConflict) {
      hadBrandConflictRef.current = true;
      brandConflictChoiceRef.current?.focus();
      return;
    }
    // Restore focus only once the resumed submit settles back to idle —
    // while it runs, the generate button is disabled and unfocusable.
    if (hadBrandConflictRef.current && composer.actionPhase === "idle") {
      hadBrandConflictRef.current = false;
      generateButtonRef.current?.focus();
    }
  }, [composer.brandConflict, composer.actionPhase]);
  const isRestyle = composer.intent === "restyle";
  const isVariations = composer.intent === "variations";
  const isSingle = composer.intent === "single";
  const isFormatAdaptation = composer.intent === "format_adaptation";
  const directions = composer.directionPool;
  const readyVariationSource = isVariations
    ? composer.sources.find((source) => source.status === "ready") ?? null
    : null;
  const originalSource = isRestyle
    ? composer.sources.find((source) => source.usage === "content")
      ?? composer.sources.find((source) => source.usage === "both")
      ?? null
    : null;
  const styleSource = isRestyle
    ? composer.sources.find((source) => source.usage === "style") ?? null
    : null;
  const title = isRestyle
    ? t("restyleTitle")
    : isVariations
      ? t("variationsTitle")
      : isFormatAdaptation
        ? t("formatAdaptationTitle")
        : t("title");
  const subtitle = isRestyle
    ? t("restyleSubtitle")
    : isVariations
      ? t("variationsSubtitle")
      : isFormatAdaptation
        ? t("formatAdaptationSubtitle")
        : t("subtitle");
  const pendingLabel = composer.actionPhase === "saving"
    ? t("actionSaving")
    : composer.actionPhase === "preparing"
      ? t("actionPreparing")
      : composer.actionPhase === "submitting"
        ? t("actionSubmitting")
        : composer.actionPhase === "reconciling"
          ? t("actionReconciling")
          : composer.state === "generating"
            ? t("actionGenerating")
            : null;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    void composer.addFiles(Array.from(event.dataTransfer.files));
  };

  if (composer.workError) {
    return (
      <section id="creative-composer" className="rounded-[var(--radius-object)] border border-[var(--danger-border)] bg-[var(--surface-raised)] p-6 text-center">
        <p role="alert" className="text-sm font-medium text-[var(--danger-text)]">{t("invalidWork")}</p>
        <Link href="/" className="mt-4 inline-flex rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)]">
          {t("startNew")}
        </Link>
      </section>
    );
  }

  return (
    <section id="creative-composer" aria-labelledby="creative-composer-title" className="space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 id="creative-composer-title" className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <span className="rounded-full bg-[var(--surface-inset)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {t("brand")}: {composer.brandName ?? t("noBrand")}
        </span>
      </div>

      {composer.requiresBrandSelection && !composer.workId ? (
        <div className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">{t("selectBrandMessage")}</p>
          <ActiveBrandSwitcher id="active-brand-switcher-inline" />
        </div>
      ) : null}

      {isRestyle ? (
        <>
          <input
            ref={fileInputRef}
            id="creative-composer-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            tabIndex={-1}
            aria-label={t("restyleAddArt")}
            className="sr-only"
            onChange={(event) => void composer.addFiles(event.target.files, "content")}
          />
          <input
            ref={styleInputRef}
            id="creative-composer-style-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            tabIndex={-1}
            aria-label={t("addStyleReference")}
            className="sr-only"
            onChange={(event) => void composer.addFiles(event.target.files, "style")}
          />

          <div
            className="grid gap-4 sm:grid-cols-2"
            data-testid="restyle-source-grid"
          >
            <CreativeSourcePreviewCard
              label={t("originalArt")}
              source={originalSource}
              isUploading={composer.isUploading && !originalSource}
              onChoose={() => fileInputRef.current?.click()}
              onDrop={(files) => void composer.addFiles(files, "content")}
              onRetry={() => {
                if (originalSource) void composer.retrySource(originalSource.id);
              }}
              onRemove={() => {
                if (originalSource) void composer.removeSource(originalSource.id);
              }}
            />

            <CreativeSourcePreviewCard
              label={t("styleReference")}
              source={styleSource}
              isUploading={composer.isUploading && !styleSource}
              onChoose={() => styleInputRef.current?.click()}
              onDrop={(files) => void composer.addFiles(files, "style")}
              onRetry={() => {
                if (styleSource) void composer.retrySource(styleSource.id);
              }}
              onRemove={() => {
                if (styleSource) void composer.removeSource(styleSource.id);
              }}
            />
          </div>
        </>
      ) : (
        <div
          data-testid="creative-composer-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]"
        >
          {isSingle ? <>
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
          </> : null}
          <div className={cn("flex flex-wrap items-center gap-3", isSingle && "mt-3 border-t border-[var(--border-subtle)] pt-3")}>
            <input
              ref={fileInputRef}
              id="creative-composer-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple={isSingle}
              tabIndex={-1}
              aria-label={t("addArt")}
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
        </div>
      )}

      {!isRestyle && composer.sources.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {composer.sources.map((source) => (
            <CreativeSourceChip
              key={source.id}
              source={source}
              onUsageChange={(usage) => void composer.updateSource(source.id, usage)}
              onRetry={() => void composer.retrySource(source.id)}
              onRemove={() => void composer.removeSource(source.id)}
              simple={!isSingle}
            />
          ))}
        </div>
      ) : null}

      {readyVariationSource ? (
        <CreativeVariationBrief
          source={readyVariationSource}
          value={composer.request}
          onChange={composer.setRequest}
          textareaRef={composerRef}
        />
      ) : null}

      {isVariations && directions ? (
        <fieldset className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <legend className="px-1 text-sm font-medium text-[var(--text-primary)]">{t("directionsTitle")}</legend>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("directionsHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("directionsTitle")}>
            {directions.directions.map((direction) => {
              const selected = directions.selectedIds.includes(direction.id);
              return (
                <button
                  key={direction.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!selected && directions.selectedIds.length >= 5}
                  onClick={() => composer.toggleDirection(direction.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50",
                    selected
                      ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary-text)]"
                      : "border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
                  )}
                >
                  {direction.label}
                </button>
              );
            })}
          </div>
          <details className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface-inset)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">{t("manualDirections")}</summary>
            <textarea
              aria-label={t("manualDirections")}
              value={directions.manualInstruction ?? ""}
              onChange={(event) => composer.setManualDirectionInstruction(event.target.value)}
              placeholder={t("manualDirectionsPlaceholder")}
              rows={3}
              className="mt-2 w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            />
          </details>
        </fieldset>
      ) : null}

      {composer.brandTrainingSuggestion ? (
        <aside className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">{t("brandTrainingSuggestion")}</p>
          <Link
            href={{
              pathname: "/brand-kit",
              query: {
                mode: "training",
                ...(composer.clientProfileId ? { clientProfileId: composer.clientProfileId } : {}),
              },
            }}
            className="text-sm font-semibold text-[var(--accent-primary-text)] hover:underline"
          >
            {t("brandTrainingCta")}
          </Link>
        </aside>
      ) : null}

      {composer.brandConflict ? (
        <fieldset
          aria-describedby="brand-conflict-description"
          className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
          data-testid="brand-conflict-choice"
        >
          <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
            {t("brandConflictTitle")}
          </legend>
          <p id="brand-conflict-description" className="mt-1 text-sm text-[var(--text-secondary)]">
            {t("brandConflictDescription", { brand: composer.brandConflict.detectedBrand })}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              ref={brandConflictChoiceRef}
              type="button"
              disabled={composer.isResolvingBrandConflict}
              onClick={() => void composer.resolveBrandConflict("source")}
              className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("brandConflictChoiceSource", { brand: composer.brandConflict.detectedBrand })}
            </button>
            <button
              type="button"
              disabled={composer.isResolvingBrandConflict}
              onClick={() => void composer.resolveBrandConflict("active")}
              className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("brandConflictChoiceActive", { brand: composer.brandConflict.activeBrand || composer.brandName || "" })}
            </button>
          </div>
        </fieldset>
      ) : null}

      {isFormatAdaptation ? (
        <fieldset className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <legend className="px-1 text-sm font-medium text-[var(--text-primary)]">{t("targetFormats")}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {FORMATS.map((value) => (
              <label key={value} className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" checked={composer.targetFormats.includes(value)} onChange={() => composer.toggleTargetFormat(value)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>
      ) : !isRestyle ? <details className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]">
          {t("optionalSettings")}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--text-secondary)]">
            <span className="mb-1 block">{t("format")}</span>
            <select
              value={composer.formatMode === "auto" ? "auto" : composer.format}
              onChange={(event) => event.target.value === "auto"
                ? composer.setFormatAuto()
                : composer.setFormat(event.target.value as typeof composer.format)}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <option value="auto">{t("formatAuto", { format: composer.format })}</option>
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
      </details> : null}

      <div
        className="flex justify-end"
        data-testid="creative-generate-action"
      >
        <button
          ref={generateButtonRef}
          type="button"
          aria-busy={Boolean(pendingLabel)}
          disabled={!composer.canGenerate || Boolean(pendingLabel)}
          onClick={() => void composer.generate()}
          className={cn(
            "inline-flex min-h-[var(--control-touch)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] sm:w-auto",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Sparkles size={16} aria-hidden="true" />
          {pendingLabel ?? (
            isRestyle
              ? t("generateRestyle", { credits: composer.quote.credits })
              : t("generate", {
                  count: composer.quote.unitCount,
                  credits: composer.quote.credits,
                })
          )}
        </button>
      </div>

      {composer.outputs.length > 0 ? (
        <section aria-labelledby="creative-results-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="creative-results-title" className="text-lg font-semibold text-[var(--text-primary)]">Resultados</h2>
              <p className="text-sm text-[var(--text-muted)]">Cada resultado fica salvo assim que termina.</p>
            </div>
            <label className="text-sm text-[var(--text-secondary)]">
              <span className="sr-only">Agrupar em campanha</span>
              <select
                aria-label="Agrupar em campanha"
                value={composer.campaignId ?? ""}
                onChange={(event) => void composer.linkCampaign(event.target.value || null)}
                className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <option value="">Sem campanha</option>
                {composer.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
          </div>
          <CreativeProposalGrid
            outputs={composer.outputs}
            onRetry={composer.retryOutput}
            onRetryRevision={composer.retryRevisionOutput}
            onApprove={composer.approveOutput}
            onDownload={composer.downloadOutput}
            onRevise={composer.reviseOutput}
            isRetrying={composer.isRetryingOutput}
            isApproving={composer.isApprovingOutput}
            isRevising={composer.isRevisingOutput}
          />
        </section>
      ) : null}

      {composer.error ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-[var(--danger-text)]">{composer.error}</p>
          {composer.retryInitialTemplate ? (
            <button
              type="button"
              onClick={composer.retryInitialTemplate}
              className="rounded-[var(--radius-control)] px-2 py-1 text-sm font-semibold text-[var(--danger-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {t("retryTemplate")}
            </button>
          ) : null}
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={pendingLabel ? "text-sm font-medium text-[var(--accent-primary-text)]" : "sr-only"}
      >
        {pendingLabel ?? composer.announcement ?? composer.state}
      </p>
    </section>
  );
}
