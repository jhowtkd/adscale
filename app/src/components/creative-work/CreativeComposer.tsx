"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Paperclip, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ActiveBrandSwitcher from "@/components/layout/ActiveBrandSwitcher";
import { AnimatedDisplayValue } from "@/components/animations/AnimatedDisplayValue";
import { CreativeSourceChip } from "./CreativeSourceChip";
import { DictationButton } from "./DictationButton";
import { PieceReferenceStrip } from "./PieceReferenceStrip";
import { CreativeSourcePreviewCard } from "./CreativeSourcePreviewCard";
import { CreativeVariationBrief } from "./CreativeVariationBrief";
import CreativeProposalGrid from "@/components/quick-tools/create-post/CreativeProposalGrid";
import { CarouselComposer } from "./CarouselComposer";
import { BrandVisualRecipes } from "./BrandVisualRecipes";
import { StudioPieceWorkspace } from "./StudioPieceWorkspace";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";

const FORMATS = ["1:1", "4:5", "9:16"] as const;

export function CreativeComposer({ composer, composerRef, hideSourceUpload = false, layout = "studio", workflowVariant = "control", resultsOnly = false, chrome = "full", resultsContainer = null, primaryActionRef, controlsActive = true }: {
  composer: CreativeComposerViewModel;
  composerRef: CreativeComposerModel["composerRef"];
  /** Briefing-first entry keeps the canonical request but omits source upload. */
  hideSourceUpload?: boolean;
  layout?: "studio" | "piece";
  workflowVariant?: "control" | "progressive";
  /** Progressive results stay visible while plan/configuration remains collapsed. */
  resultsOnly?: boolean;
  /** Palco owns request, attach and generate; stage chrome keeps configure/results only. */
  chrome?: "full" | "stage";
  resultsContainer?: HTMLElement | null;
  primaryActionRef?: RefObject<HTMLButtonElement | null>;
  /** When false, carousel auto-focus skips hidden/inert controls. Never gates data. */
  controlsActive?: boolean;
}) {
  const t = useTranslations("dashboard.home.composer");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  /** Ditado: texto limpo entra na posição do cursor, sem apagar nada (#351). */
  const insertDictation = useCallback(
    (text: string) => {
      const area = composerRef.current;
      const current = composer.request;
      if (!area) {
        composer.setRequest(current ? `${current} ${text}` : text);
        return;
      }
      const start = area.selectionStart ?? current.length;
      const end = area.selectionEnd ?? current.length;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const joinLeft = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const joinRight = after.length > 0 && !/^\s/.test(after) ? " " : "";
      composer.setRequest(`${before}${joinLeft}${text}${joinRight}${after}`);
      const cursor = before.length + joinLeft.length + text.length;
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(cursor, cursor);
      });
    },
    [composer, composerRef]
  );
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
      (primaryActionRef?.current ?? generateButtonRef.current)?.focus();
    }
  }, [composer.brandConflict, composer.actionPhase, primaryActionRef]);
  const stageChrome = chrome === "stage";
  const isRestyle = composer.intent === "restyle";
  const isVariations = composer.intent === "variations";
  const isSingle = composer.intent === "single";
  const isCarousel = composer.intent === "carousel";
  const carouselStyleSource = isCarousel
    ? composer.sources.find((source) => source.usage === "style") ?? null
    : null;
  const pieceReferenceActionsLocked = composer.settingsLocked
    || composer.isUploading
    || composer.sourceMutationPending
    || composer.actionPhase !== "idle";
  const isFormatAdaptation = composer.intent === "format_adaptation";
  const pieceReferenceSources = isSingle ? composer.sources.filter((source) => source.assetId && source.pieceReference) : [];
  const legacySingleSources = isSingle ? composer.sources.filter((source) => !source.pieceReference) : [];
  // The manual-instruction textarea only exists while the "Direcionamentos
  // manuais" section is open — collapsed by default, never mounted outside it.
  const [manualDirectionsOpen, setManualDirectionsOpen] = useState(false);
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
  const title = isCarousel
    ? t("carousel.title")
    : isRestyle
      ? t("restyleTitle")
      : isVariations
        ? t("variationsTitle")
        : isFormatAdaptation
          ? t("formatAdaptationTitle")
          : t("title");
  const subtitle = isCarousel
    ? t("carousel.subtitle")
    : isRestyle
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
  const inferredBriefing = composer.inferredBriefing;
  const briefingStateLabels = {
    sourced: t("briefingStateSourced"),
    inferred: t("briefingStateInferred"),
    unknown: t("briefingStateUnknown"),
  } as const;
  const briefingReadinessLabels = {
    ready: t("briefingReadinessReady"),
    exploratory: t("briefingReadinessExploratory"),
    blocked: t("briefingReadinessBlocked"),
  } as const;
  const briefingConfidenceLabels = {
    high: t("briefingConfidenceHigh"),
    medium: t("briefingConfidenceMedium"),
    low: t("briefingConfidenceLow"),
  } as const;
  const briefingFields = inferredBriefing ? [
    ["message", t("briefingMessage"), inferredBriefing.message],
    ["objective", t("briefingObjective"), inferredBriefing.objective],
    ["audience", t("briefingAudience"), inferredBriefing.audience],
    ["offer", t("briefingOffer"), inferredBriefing.offer],
    ["tone", t("briefingTone"), inferredBriefing.tone],
    ["constraints", t("briefingConstraints"), inferredBriefing.constraints],
  ] as const : [];
  const briefingUnknown = t("briefingUnknown");
  const briefingFactPack = composer.briefingFactPack;
  const briefingProvenance = briefingFactPack ? [
    t("briefingProvenanceRequest"),
    ...(briefingFactPack.identity.brandName
      ? [t("briefingProvenanceBrand", { brand: briefingFactPack.identity.brandName })]
      : []),
    ...Array.from(new Set(
      briefingFactPack.facts
        .filter((fact) => fact.origin === "source" && fact.sourceId)
        .map((fact) => t("briefingProvenanceSource", {
          source: composer.sources.find((source) => source.id === fact.sourceId)?.name ?? fact.sourceId!,
        })),
    )),
  ] : [];
  const variationPanelClass = "flex h-full flex-col rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4";
  const variationDirections = isVariations && directions ? (
    <fieldset
      className={variationPanelClass}
      data-testid="variation-directions-region"
    >
      <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{t("directionsTitle")}</legend>
      <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-secondary)]">{t("directionsHint")}</p>
      {composer.directionSuggestionState === "loading" ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">{t("directionsLoading")}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={t("directionsTitle")}>
        {directions.directions.map((direction, index) => {
          const selected = directions.selectedIds.includes(direction.id);
          const fillsLastRow = directions.directions.length % 2 === 1
            && index === directions.directions.length - 1;
          return (
            <button
              key={direction.id}
              type="button"
              aria-label={direction.label}
              aria-pressed={selected}
              disabled={!selected && directions.selectedIds.length >= 5}
              onClick={() => composer.toggleDirection(direction.id)}
              className={cn(
                "group min-h-28 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
                fillsLastRow && "sm:col-span-2",
                selected
                  ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)] ring-1 ring-inset ring-[var(--selection-border)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
              )}
            >
              <span className="text-sm font-semibold text-[var(--text-primary)]">{direction.label}</span>
              <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">{direction.instruction}</span>
            </button>
          );
        })}
      </div>
      {composer.pendingDirectionSuggestions ? (
        <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-inset)] p-3">
          <p className="text-sm text-[var(--text-secondary)]">{t("directionsReady")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const pending = composer.pendingDirectionSuggestions!;
                composer.applyDirectionSuggestions(pending.directions, pending.preserveSelection);
              }}
              className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("applyDirections")}
            </button>
            <button
              type="button"
              onClick={composer.keepCurrentDirections}
              className="rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("keepDirections")}
            </button>
          </div>
        </div>
      ) : null}
      {composer.directionSuggestionState === "error" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          <span>{t("directionsUnavailable")}</span>
          <button type="button" onClick={composer.requestDirectionSuggestions} className="font-semibold text-[var(--text-secondary)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t("retryDirections")}</button>
        </div>
      ) : composer.directionSuggestionState === "ready" && !composer.pendingDirectionSuggestions ? (
        <button type="button" onClick={composer.requestDirectionSuggestions} className="mt-3 text-sm font-semibold text-[var(--text-secondary)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t("suggestAgain")}</button>
      ) : null}
      <details
        className="mt-4 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 transition-colors open:bg-[var(--surface-base)]"
        onToggle={(event) => setManualDirectionsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t("manualDirections")}</summary>
        {manualDirectionsOpen ? (
          <textarea
            aria-label={t("manualDirections")}
            value={directions.manualInstruction ?? ""}
            onChange={(event) => composer.setManualDirectionInstruction(event.target.value)}
            placeholder={t("manualDirectionsPlaceholder")}
            rows={3}
            className="mt-2 w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
        ) : null}
      </details>
    </fieldset>
  ) : null;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    void composer.addFiles(Array.from(event.dataTransfer.files));
  };

  const resultsContent = composer.outputs.length > 0 ? (
    <section {...(!resultsOnly ? { "aria-labelledby": "creative-results-title" } : {})} className="space-y-4">
      <div className={cn("flex flex-wrap items-center justify-between gap-3", layout === "piece" && "sr-only")}>
        {!resultsOnly ? <div>
          <h2 id="creative-results-title" className="text-lg font-semibold text-[var(--text-primary)]">{t("results.title")}</h2>
          <p className="text-sm text-[var(--text-muted)]">{t("results.subtitle")}</p>
        </div> : null}
      </div>
      {layout === "piece" && !isCarousel ? (
        <StudioPieceWorkspace composer={composer} />
      ) : (
        <CreativeProposalGrid
          outputs={composer.outputs}
          artRefinement={composer.artRefinement}
          layout={layout}
          onRetry={composer.retryOutput}
          onRetryRevision={composer.retryRevisionOutput}
          onApprove={composer.approveOutput}
          onDownload={composer.downloadOutput}
          canLayerize={composer.canLayerize}
          layerEditorAccess={composer.layerEditorAccess}
          onLayerize={composer.layerizeOutput}
          onDownloadLayerized={composer.downloadLayerizedOutput}
          isLayerizing={composer.isLayerizingOutput}
          onRevise={composer.reviseOutput}
          isRetrying={composer.isRetryingOutput}
          isApproving={composer.isApprovingOutput}
          approvalErrorOutputId={composer.approvalErrorOutputId}
          isRevising={composer.isRevisingOutput}
          onLayerEditorPublished={composer.refreshOutputs}
        />
      )}
      <div className={cn("flex", layout === "piece" ? "justify-start" : "justify-end")}>
        <label className="text-sm text-[var(--text-secondary)]">
          <span className="sr-only">{t("results.campaignLabel")}</span>
          <select
            aria-label={t("results.campaignLabel")}
            value={composer.campaignId ?? ""}
            onChange={(event) => void composer.linkCampaign(event.target.value || null)}
            className={cn(
              "text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              layout === "piece"
                ? "border-0 bg-transparent py-1 text-xs text-[var(--text-muted)]"
                : "rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2",
            )}
          >
            <option value="">{t("results.noCampaign")}</option>
            {composer.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </label>
      </div>
    </section>
  ) : null;
  const results = resultsContainer && stageChrome && resultsContent
    ? createPortal(resultsContent, resultsContainer)
    : resultsContent;

  if (composer.workError) {
    return (
      <section id="creative-composer" className="rounded-[var(--radius-object)] border border-[var(--danger-border)] bg-[var(--surface-raised)] p-6 text-center">
        <p role="alert" className="text-sm font-medium text-[var(--danger-text)]">{t("invalidWork")}</p>
        <Link href="/" className="mt-4 inline-flex rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {t("startNew")}
        </Link>
      </section>
    );
  }

  if (resultsOnly) return results;

  if (layout === "piece" && isVariations && results && !composer.brandConflict) {
    return (
      <section id="creative-composer" aria-label={title} className="flex scroll-mt-24 flex-col gap-5">
        {results}

        {readyVariationSource ? (
          <CreativeVariationBrief
            source={readyVariationSource}
            request={composer.request}
            brandName={composer.brandName}
            onSave={({ contentAnalysis, styleAnalysis }) => composer.editSource(
              readyVariationSource.id,
              contentAnalysis,
              styleAnalysis,
            )}
          />
        ) : null}

        {composer.error ? <p className="text-sm text-[var(--danger-text)]" role="alert">{composer.error}</p> : null}
        <p role="status" aria-live="polite" className="sr-only">{composer.announcement ?? composer.state}</p>
      </section>
    );
  }

  return (
    <section
      id="creative-composer"
      aria-labelledby={stageChrome || layout === "piece" ? undefined : "creative-composer-title"}
      aria-label={layout === "piece" ? title : undefined}
      className={cn("space-y-4 scroll-mt-24", layout === "piece" && "flex flex-col")}
    >
      {stageChrome ? <h2 id="creative-composer-title" className="sr-only">{title}</h2> : layout === "piece" ? null : (
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 id="creative-composer-title" className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <span className="rounded-full bg-[var(--surface-inset)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {t("brand")}: {composer.brandName ?? t("noBrand")}
        </span>
      </div>
      )}

      {layout === "piece" && !isCarousel ? results : null}

      {isCarousel ? (
        <CarouselComposer
          carousel={composer.carousel}
          composerRef={composerRef}
          request={composer.request}
          onRequestChange={composer.setRequest}
          styleSource={carouselStyleSource}
          styleUploadPending={composer.isUploading}
          onAddStyleFiles={(files) => void composer.addFiles(files, "style")}
          onRetryStyleSource={carouselStyleSource ? () => void composer.retrySource(carouselStyleSource.id) : undefined}
          onRemoveStyleSource={carouselStyleSource ? () => void composer.removeSource(carouselStyleSource.id) : undefined}
          approvedRevision={composer.carousel.approvedRevision}
          requestOwner={stageChrome ? "host" : "self"}
          resultsContainer={resultsContainer}
          active={controlsActive}
        />
      ) : (<>
      {composer.intent === "single" && composer.brandIdentity && (composer.clientProfileId || composer.brandIdentity.source === "snapshot") ? (
        <section
          data-testid="brand-identity"
          className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
        >
          <h2 className="text-sm font-medium text-[var(--text-primary)]">{t("brandIdentityTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {composer.brandIdentity.mode === "published" && composer.brandIdentity.versionNumber
              ? t("brandIdentityPublished", { version: composer.brandIdentity.versionNumber })
              : t("brandIdentityLegacy")}
            {" · "}
            {composer.brandIdentity.source === "snapshot" ? t("brandIdentityFrozen") : t("brandIdentityLive")}
          </p>
          {composer.brandIdentity.assets.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
              {composer.brandIdentity.assets.map((asset) => (
                <li key={asset.referenceId}>
                  {asset.label} · {t(`brandIdentity${asset.usageMode === "exact" ? "Exact" : asset.usageMode === "rule" ? "Rule" : "Reference"}`)}
                  {asset.reasons.length > 0 ? ` · ${asset.reasons.join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

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
            <div id="creative-composer-original-source" tabIndex={-1}>
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
            </div>

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
      ) : stageChrome && !(isSingle && !hideSourceUpload && pieceReferenceSources.length > 0) ? null : (
        <div
          id="creative-composer-dropzone"
          data-testid="creative-composer-dropzone"
          tabIndex={-1}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="rounded-[var(--radius-object)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
        >
          {isSingle && !stageChrome ? <>
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
            <div className="mt-2 flex justify-end">
              <DictationButton workId={composer.workId ?? undefined} onInsert={insertDictation} />
            </div>
          </> : null}
          {isSingle && !hideSourceUpload ? <PieceReferenceStrip
            sources={pieceReferenceSources}
            assetSourceCount={composer.sources.filter((source) => Boolean(source.assetId)).length}
            disabled={pieceReferenceActionsLocked}
            uploading={composer.isUploading}
            onAdd={(files) => void composer.addFiles(files)}
            onUpdate={composer.updatePieceReference}
            onReplace={composer.replacePieceReference}
            onRetry={composer.retrySource}
            onRemove={composer.removeSource}
            onPromote={composer.promotePieceReference}
          /> : null}
          {!stageChrome && !hideSourceUpload && !isSingle ? <div className={cn("flex flex-wrap items-center gap-3", isSingle && "mt-3 border-t border-[var(--border-subtle)] pt-3")}>
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
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <Paperclip size={16} aria-hidden="true" />
              {composer.isUploading ? t("uploading") : t("addArt")}
            </button>
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{t("dropHint")}</span>
          </div> : null}
        </div>
      )}

      {!isRestyle && !isVariations && (!isSingle || legacySingleSources.length > 0) && composer.sources.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(isSingle ? legacySingleSources : composer.sources).map((source) => (
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

      {isVariations && composer.sources.length > 0 ? (
        <section
          aria-label={t("variationsTitle")}
          className="grid min-w-0 items-start gap-4 lg:grid-cols-2 lg:items-stretch"
          data-testid="variation-workspace"
        >
          <div className="flex h-full min-w-0 flex-col space-y-4" data-testid="variation-reference-context">
            <div className={cn(variationPanelClass, "min-w-0 space-y-4")} data-testid="variation-reference-panel">
              {composer.sources.map((source) => (
                <CreativeSourceChip
                  key={source.id}
                  source={source}
                  onUsageChange={(usage) => void composer.updateSource(source.id, usage)}
                  onRetry={() => void composer.retrySource(source.id)}
                  onRemove={() => void composer.removeSource(source.id)}
                  simple
                  fullPreview
                />
              ))}
              {readyVariationSource ? (
                <CreativeVariationBrief
                  source={readyVariationSource}
                  request={composer.request}
                  brandName={composer.brandName}
                  onSave={({ contentAnalysis, styleAnalysis }) => composer.editSource(
                    readyVariationSource.id,
                    contentAnalysis,
                    styleAnalysis,
                  )}
                />
              ) : null}
            </div>
          </div>
          <div className="flex h-full min-w-0 flex-col space-y-4" data-testid="variation-guidance">
            {variationDirections}
          </div>
        </section>
      ) : variationDirections}

      {isSingle && inferredBriefing ? (
        <section
          aria-labelledby="inferred-briefing-title"
          aria-busy={composer.actionPhase !== "idle"}
          className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
          data-testid="inferred-briefing"
        >
          <h2 id="inferred-briefing-title" className="text-base font-semibold text-[var(--text-primary)]">
            {t("inferredBriefingTitle")}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t("inferredBriefingSentence", {
              message: inferredBriefing.message.value ?? briefingUnknown,
              objective: inferredBriefing.objective.value ?? briefingUnknown,
              audience: inferredBriefing.audience.value ?? briefingUnknown,
              offer: inferredBriefing.offer.value ?? briefingUnknown,
              tone: inferredBriefing.tone.value ?? briefingUnknown,
              constraints: inferredBriefing.constraints.value ?? briefingUnknown,
            })}
          </p>
          {briefingProvenance.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]" aria-label={t("briefingProvenance")}>
              {briefingProvenance.join(" · ")}
            </p>
          ) : null}
          <dl className="mt-4 grid gap-3 sm:grid-cols-2" aria-label={t("briefingFieldsLabel")}>
            {briefingFields.map(([key, label, field]) => (
              <div key={key} data-testid={`inferred-briefing-${key}`} data-state={field.state}>
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
                <dd className="mt-1 text-sm text-[var(--text-primary)]">
                  <input
                    aria-label={label}
                    defaultValue={field.value ?? ""}
                    placeholder={briefingUnknown}
                    onBlur={(event) => void composer.editBriefingField(key, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    disabled={composer.briefingEditState === "saving"}
                    className="w-full rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
                  />
                  <span className="sr-only">{field.value ?? briefingUnknown}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {briefingStateLabels[field.state]}
                    {field.confidence ? ` · ${briefingConfidenceLabels[field.confidence]}` : ""}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-[var(--text-secondary)]" role="status" aria-label={t("briefingStatus")}>
            {t("briefingReadiness")}: <strong>{briefingReadinessLabels[inferredBriefing.readiness]}</strong>
            {" · "}
            {t("briefingConfidence")}: <strong>{briefingConfidenceLabels[inferredBriefing.confidence]}</strong>
          </p>
          {composer.briefingEditState !== "idle" ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
              {composer.briefingEditState === "saving"
                ? t("actionSaving")
                : composer.briefingEditState === "saved"
                  ? t("briefingEditSaved")
                  : t("briefingEditError")}
            </p>
          ) : null}
          {composer.workId && briefingFactPack?.facts.some((fact) => fact.class === "product" && fact.value.trim()) && briefingFactPack.facts.some((fact) => fact.class === "offer" && fact.value.trim()) ? (
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              data-testid="save-commercial-offer"
              onSubmit={(event) => {
                event.preventDefault();
                const raw = String(new FormData(event.currentTarget).get("validUntil") ?? "");
                const parsed = Date.parse(raw);
                if (!Number.isFinite(parsed)) return;
                void composer.saveCommercialOffer(new Date(parsed).toISOString());
              }}
            >
              <label className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
                {t("offers.validUntil")}
                <input
                  name="validUntil"
                  type="datetime-local"
                  required
                  disabled={composer.settingsLocked}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
                />
              </label>
              <button
                type="submit"
                disabled={composer.settingsLocked}
                className="shrink-0 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("offers.save")}
              </button>
            </form>
          ) : null}
        </section>
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
            className="text-sm font-semibold text-[var(--text-secondary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
              className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("brandConflictChoiceSource", { brand: composer.brandConflict.detectedBrand })}
            </button>
            <button
              type="button"
              disabled={composer.isResolvingBrandConflict}
              onClick={() => void composer.resolveBrandConflict("active")}
              className="inline-flex min-h-[var(--control-touch)] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("brandConflictChoiceActive", { brand: composer.brandConflict.activeBrand || composer.brandName || "" })}
            </button>
          </div>
        </fieldset>
      ) : null}

      {isFormatAdaptation ? (
        <fieldset className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
          <legend className="px-1 text-sm font-medium text-[var(--text-primary)]">
            {t("targetFormats")}
          </legend>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("targetFormatsHelp")}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {FORMATS.map((value) => (
              <label key={value} className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" checked={composer.targetFormats.includes(value)} onChange={() => composer.toggleTargetFormat(value)} />
                {value}
              </label>
            ))}
          </div>
        </fieldset>
      ) : !isRestyle ? <details className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4" data-testid="creative-optional-settings">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {t("optionalSettings")}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm text-[var(--text-secondary)]">
            <div className="mb-1">
              <label htmlFor="creative-composer-format">{t("format")}</label>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("formatHelp")}</p>
            </div>
            <select
              id="creative-composer-format"
              disabled={composer.settingsLocked}
              value={composer.formatMode === "auto" ? "auto" : composer.format}
              onChange={(event) => event.target.value === "auto"
                ? composer.setFormatAuto()
                : composer.setFormat(event.target.value as typeof composer.format)}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <option value="auto">{t("formatAuto", { format: composer.format })}</option>
              {FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          {isSingle ? (
            <div className="text-sm text-[var(--text-secondary)]">
              <label className="mb-1 block" htmlFor="creative-composer-text-layout">{t("textLayout")}</label>
              <select
                id="creative-composer-text-layout"
                disabled={composer.settingsLocked}
                value={composer.textLayout}
                onChange={(event) => composer.setTextLayout(event.target.value as typeof composer.textLayout)}
                className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {(["top", "center", "bottom", "side"] as const).map((layout) => (
                  <option key={layout} value={layout}>{t(`textLayout_${layout}`)}</option>
                ))}
              </select>
            </div>
          ) : null}
          {isSingle && composer.fontOptions.length > 0 ? (
            <div className="text-sm text-[var(--text-secondary)]">
              <label className="mb-1 block" htmlFor="creative-composer-brand-font">{t("brandFont")}</label>
              <select
                id="creative-composer-brand-font"
                disabled={composer.settingsLocked}
                value={composer.fontAssetKey ?? (composer.fontOptions.length === 1 ? composer.fontOptions[0]!.assetKey : "")}
                onChange={(event) => composer.setFontAssetKey(event.target.value || null)}
                className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {composer.fontOptions.length > 1 ? <option value="">{t("brandFontChoose")}</option> : null}
                {composer.fontOptions.map((font) => (
                  <option key={font.assetKey} value={font.assetKey}>
                    {font.family} · {font.weight}{font.style === "italic" ? " · italic" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {isSingle ? (
            <BrandVisualRecipes
              recipes={composer.visualRecipes ?? []}
              offers={composer.commercialOffers ?? []}
              disabled={composer.settingsLocked}
              onUse={(recipeId) => void composer.instantiateRecipe(recipeId)}
              onUseOffer={(offerId) => void composer.instantiateOffer(offerId)}
            />
          ) : null}
          <fieldset>
            <legend className="mb-1 text-sm text-[var(--text-secondary)]">
              {t("targetFormats")}
            </legend>
            <p className="mb-2 text-xs text-[var(--text-muted)]">{t("targetFormatsHelp")}</p>
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

      {stageChrome ? null : <div
        className="flex justify-end"
        data-testid="creative-generate-action"
      >
        <button
          ref={generateButtonRef}
          type="button"
          aria-busy={Boolean(pendingLabel)}
          disabled={!composer.canGenerate || Boolean(pendingLabel)}
          onClick={() => void (workflowVariant === "progressive" ? composer.preparePlan() : composer.generateLegacy())}
          className={cn(
            "inline-flex min-h-[var(--control-touch)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] sm:w-auto",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Sparkles size={16} aria-hidden="true" />
          {pendingLabel ?? (
            <AnimatedDisplayValue
              value={
                workflowVariant === "progressive"
                  ? t("continuePlan")
                  : isRestyle
                  ? t("generateRestyle")
                  : t("generate", {
                      count: composer.quote.unitCount,
                    })
              }
            />
          )}
        </button>
      </div>}

      </>)}

      {layout === "studio" && !isCarousel ? results : null}

      {stageChrome ? null : composer.error ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-[var(--danger-text)]">{composer.error}</p>
          {composer.retryInitialTemplate ? (
            <button
              type="button"
              onClick={composer.retryInitialTemplate}
              className="rounded-[var(--radius-control)] px-2 py-1 text-sm font-semibold text-[var(--danger-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {t("retryTemplate")}
            </button>
          ) : null}
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={pendingLabel ? "text-sm font-medium text-[var(--info-text)]" : "sr-only"}
      >
        {pendingLabel ?? composer.announcement ?? composer.state}
      </p>
    </section>
  );
}
