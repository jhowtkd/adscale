"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { CreativeSourceChip } from "./CreativeSourceChip";
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
  const isRestyle = composer.intent === "restyle";
  const isVariations = composer.intent === "variations";
  const isSingle = composer.intent === "single";
  const isFormatAdaptation = composer.intent === "format_adaptation";
  const readyVariationSource = isVariations
    ? composer.sources.find((source) => source.status === "ready") ?? null
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
        : composer.state === "generating"
          ? t("actionGenerating")
          : null;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    void composer.addFiles(Array.from(event.dataTransfer.files));
  };

  if (composer.workError) {
    return (
      <section className="rounded-[var(--radius-object)] border border-[var(--danger-border)] bg-[var(--surface-raised)] p-6 text-center">
        <p role="alert" className="text-sm font-medium text-[var(--danger-text)]">{t("invalidWork")}</p>
        <Link href="/" className="mt-4 inline-flex rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)]">
          {t("startNew")}
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="creative-composer-title" className="space-y-4">
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
        <div className={cn("flex flex-wrap items-center justify-between gap-3", isSingle && "mt-3 border-t border-[var(--border-subtle)] pt-3")}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              id="creative-composer-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple={isSingle}
              tabIndex={-1}
              aria-label={isRestyle ? t("restyleAddArt") : t("addArt")}
              className="sr-only"
              onChange={(event) => void composer.addFiles(event.target.files, isRestyle ? "content" : undefined)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Paperclip size={16} aria-hidden="true" />
              {composer.isUploading ? t("uploading") : isRestyle ? t("restyleAddArt") : t("addArt")}
            </button>
            {isRestyle ? <>
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
              <button
                type="button"
                onClick={() => styleInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              >
                <Paperclip size={16} aria-hidden="true" />
                {t("addStyleReference")}
              </button>
            </> : null}
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{t("dropHint")}</span>
          </div>
          <button
            type="button"
            disabled={!composer.canGenerate || Boolean(pendingLabel)}
            onClick={() => void composer.generate()}
            className={cn(
              "inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Sparkles size={16} aria-hidden="true" />
            {pendingLabel ?? (isRestyle
              ? t("generateRestyle", { credits: composer.quote.credits })
              : t("generate", { count: composer.quote.unitCount, credits: composer.quote.credits }))}
          </button>
        </div>
      </div>

      {composer.sources.length > 0 ? (
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
