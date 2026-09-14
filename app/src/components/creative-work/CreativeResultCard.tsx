"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers, Star } from "lucide-react";
import {
  categorizeCreativeWorkFailure,
  isCreativeWorkRetryEligible,
  type CreativeWorkOutput,
} from "@/lib/hooks/use-creative-work";
import {
  getArtRefinementIssue,
  getArtRefinementPresentation,
  getCreativeWorkEvaluatorSummary,
  getCreativeWorkSelectionPolicy,
} from "@/lib/creative-work-selection-policy";
import { isVisualRecipeCandidate } from "@/server/creative-work/visual-recipe";
import { ActionStatusIcon } from "@/components/animations/ActionStatusIcon";
import { copyTextToClipboard, useSharePieceReview } from "@/lib/hooks/use-piece-review-share";
import { usePieceFavorite } from "@/lib/hooks/use-piece-favorite";
import {
  useOutputPersonReferences,
  useReviewPersonFidelity,
} from "@/lib/hooks/use-person-fidelity";
import {
  personFidelitySelectionGate,
  resolvePersonFidelity,
} from "@/server/creative-work/person-fidelity";
import { studioPrimaryActionClass, studioQuietActionClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import type {
  DeterministicBrandFidelityReport,
  ResidualBrandFidelityReview,
} from "@/server/creative-work/brand-fidelity";
import type { LayerEditorAccessV1 } from "@/server/layer-editor/contracts";

export type CreativeResultCardArtRefinement = {
  status: string;
  issues: string[];
  recommendedOutputIds: string[];
} | null;

type CreativeResultCardProps = {
  output: CreativeWorkOutput;
  label: string;
  /**
   * Work-level automatic-refinement summary (plan 04, T3). Presentation only:
   * a recommendation badge, never selection. Absent on legacy works.
   */
  artRefinement?: CreativeResultCardArtRefinement;
  onRetry: (outputId: string) => void;
  onRetryRevision?: (output: CreativeWorkOutput) => void | Promise<void>;
  onApprove: (outputId: string, confirmObjective?: boolean, saveAsRecipe?: boolean) => void;
  onDownload: (outputId: string) => void;
  onRevise?: (outputId: string, instruction: string, attachment: File | null) => void | Promise<void>;
  isRetrying?: boolean;
  isApproving?: boolean;
  approvalError?: boolean;
  isRevising?: boolean;
  hidePreview?: boolean;
  canLayerize?: boolean;
  onLayerize?: (outputId: string, retry?: boolean, operationId?: string) => Promise<"accepted" | "terminal" | "uncertain" | void> | void;
  onDownloadLayerized?: (outputId: string, format: "psd" | "zip") => void;
  isLayerizing?: boolean;
  onOpenLayerEditor?: (outputId: string) => void;
  layerEditorAccess?: LayerEditorAccessV1;
  isMobile?: boolean;
};

const secondaryActionClass = `${studioQuietActionClass} min-h-[var(--control-touch)] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm`;

export function CreativeResultCard({
  output,
  label,
  artRefinement = null,
  onRetry,
  onRetryRevision,
  onApprove,
  onDownload,
  onRevise,
  isRetrying = false,
  isApproving = false,
  approvalError = false,
  isRevising = false,
  hidePreview = false,
  canLayerize = false,
  onDownloadLayerized,
  onOpenLayerEditor,
  layerEditorAccess,
  isMobile = false,
}: CreativeResultCardProps) {
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSelection, setConfirmingSelection] = useState(false);
  const [reviewShare, setReviewShare] = useState<{ url: string; copied: boolean } | null>(null);
  const [saveAsRecipe, setSaveAsRecipe] = useState(false);
  const t = useTranslations("dashboard.home.composer.results");
  const tCommon = useTranslations("common");
  const statusLabel = (status: CreativeWorkOutput["status"]) => t(`status.${status}`);
  const isCompleted = output.status === "completed" && (output.hasOutput ?? Boolean(output.outputKey));
  const shareReview = useSharePieceReview();
  const favorite = usePieceFavorite(output.workItemId, output.id, isCompleted);
  const isRevision = Boolean(output.parentOutputId);
  // R-008: failure categories are stable and typed; the free retry exists
  // only while the durable image-call budget has a call (R-006).
  const failureCategory = output.status === "failed"
    ? categorizeCreativeWorkFailure(output.failureCode)
    : null;
  const retryEligible = isCreativeWorkRetryEligible(output);
  // R-008: `inconclusive` is an available output with a review signal — never
  // a failure, never an objective approval.
  const selectionPolicy = isCompleted ? getCreativeWorkSelectionPolicy(output.quality, output.id) : null;
  const objectiveVerdict = selectionPolicy?.verdict === "legacy" ? null : selectionPolicy?.verdict ?? null;
  const evaluatorSummary = objectiveVerdict === "inconclusive"
    ? getCreativeWorkEvaluatorSummary(output.quality)
    : null;
  const layerization = output.layerization;
  const layerizeRemaining = layerEditorAccess?.layerize?.remaining ?? null;
  const hasReadyLayers = layerization?.status === "completed" || Boolean(output.layerEditor);
  const canOpenEditor = Boolean(onOpenLayerEditor) && !isMobile && isCompleted && (hasReadyLayers || canLayerize);
  const needsLayerizeQuota = canOpenEditor && !hasReadyLayers;
  const editDisabled = needsLayerizeQuota && layerizeRemaining === 0;
  const canSaveAsRecipe = isCompleted && isVisualRecipeCandidate({
    format: output.targetFormat,
    quality: output.quality,
  });
  const storedBrandFidelity = output.quality?.brandFidelity as {
    deterministic?: DeterministicBrandFidelityReport;
    residual?: ResidualBrandFidelityReview;
  } | undefined;
  const deterministicBrandFidelity = storedBrandFidelity?.deterministic?.deterministic === true
    && Array.isArray(storedBrandFidelity.deterministic.checks)
    ? storedBrandFidelity.deterministic
    : null;
  const residualBrandFidelity = storedBrandFidelity?.residual?.advisoryOnly === true
    && Array.isArray(storedBrandFidelity.residual.signals)
    ? storedBrandFidelity.residual
    : null;
  // Named-person fidelity (plan 03, T3): the assessment block persisted on
  // the output, the approved reference photos beside it, and the specific
  // human review. Doubt renders its own review surface instead of the
  // generic objective-failed banner — approval needs this review, not a
  // new image. A confirmed mismatch still needs a new image.
  const personFidelity = isCompleted ? resolvePersonFidelity(output.quality) : null;
  const personFidelityGate = personFidelitySelectionGate(personFidelity, output.id);
  const personReferences = useOutputPersonReferences(
    output.workItemId,
    output.id,
    isCompleted && personFidelity !== null,
  );
  const personReview = useReviewPersonFidelity(output.workItemId, output.id);
  const personNameById = new Map(
    (personReferences.data ?? []).map((person) => [person.personId, person.name]),
  );
  // Automatic art refinement (plan 04, T3): progress while a revision runs,
  // the best valid version once it settles, and an explicit manual round on
  // request. The recommendation never selects: approval keeps its own guard.
  const refinement = getArtRefinementPresentation(output.id, artRefinement);
  const ownIssue = isCompleted ? getArtRefinementIssue(output.quality) : null;
  const runningIssue = refinement.status === "running"
    ? (refinement.issues[0] ?? ownIssue)
    : null;
  const showBest = isCompleted && refinement.isRecommended && refinement.status !== "running";
  const bestIssues = showBest ? refinement.issues : [];

  return (
    <div
      data-testid="proposal-level"
      data-level={output.creativeLevel}
      data-status={output.status}
      role="listitem"
      className="flex flex-col gap-3 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          <span data-testid="proposal-level-name">{label}</span>
          <span className="ml-1 text-[var(--text-muted)]">· {output.targetFormat ?? "4:5"} · {t("variationShort", { count: output.versionNumber ?? 1 })}</span>
        </p>
        <span className="flex items-center gap-2">
          {isCompleted ? (
            <button
              type="button"
              data-testid="favorite-piece"
              aria-pressed={favorite.isFavorite}
              aria-label={favorite.isError ? tCommon("retry") : favorite.isFavorite ? t("unfavorite") : t("favorite")}
              title={favorite.isError ? tCommon("error") : favorite.isFavorite ? t("unfavoriteHint") : t("favoriteHint")}
              disabled={favorite.isPending}
              onClick={() => favorite.toggle()}
              className={studioQuietActionClass}
            >
              <Star className="size-4" fill={favorite.isFavorite ? "currentColor" : "none"} aria-hidden="true" />
            </button>
          ) : null}
          <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[var(--text-caption)] uppercase tracking-wider text-[var(--text-muted)]">
            {statusLabel(output.status)}
          </span>
        </span>
      </header>

      {!hidePreview ? <div className="w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]" style={{ aspectRatio: (output.targetFormat ?? "4:5").replace(":", " / ") }}>
        {isCompleted ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/creative-work/${output.workItemId}/outputs/${output.id}/download`}
            alt={t("proposalAlt", { label })}
            className="h-full w-full object-contain"
          />
        ) : (
          <div role="status" className="flex h-full flex-col items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
            {output.status === "failed" ? (
              <>
                <span>{t("failedGeneration")}</span>
                {/* One live region per failure: the typed category rides the
                    same status announcement instead of a second role=alert. */}
                <span data-testid="failure-category" className="text-[var(--danger-text)]">
                  {t(`failure.${failureCategory}`)}
                </span>
              </>
            ) : t("generating")}
          </div>
        )}
      </div> : null}

      {objectiveVerdict === "inconclusive" ? (
        <div
          role="note"
          data-testid="review-recommended"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <p className="text-xs font-medium text-[var(--text-secondary)]">{t("reviewRecommended")}</p>
          {evaluatorSummary ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{evaluatorSummary}</p>
          ) : null}
        </div>
      ) : null}

      {runningIssue ? (
        <p
          role="status"
          data-testid="art-refinement-running"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-secondary)]"
        >
          {t("artRefinementRunning", { issue: runningIssue })}
        </p>
      ) : null}

      {showBest ? (
        <div
          data-testid="art-refinement-best"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <p className="text-xs font-medium text-[var(--text-secondary)]">{t("artRefinementBest")}</p>
          {bestIssues.map((issue) => (
            <p key={issue} className="mt-0.5 text-xs text-[var(--text-muted)]">
              {t("artRefinementNeedsReview", { issue })}
            </p>
          ))}
          {onRevise ? (
            <button
              type="button"
              className={`${secondaryActionClass} mt-2`}
              onClick={() => setEditing(true)}
            >
              {t("artRefinementReviewMore")}
            </button>
          ) : null}
        </div>
      ) : null}

      {selectionPolicy && !selectionPolicy.selectable && personFidelityGate !== "needs_review" ? (
        <div
          role="note"
          data-testid="objective-selection-blocked"
          className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-text)]"
        >
          <p className="font-medium">{t("objectiveFailed")}</p>
          <p className="mt-0.5">{t("objectiveFailedNext")}</p>
        </div>
      ) : null}

      {personFidelity ? (
        <section
          data-testid="person-fidelity"
          aria-label={t("personFidelityTitle")}
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">{t("personFidelityTitle")}</h3>
          {(personReferences.data ?? []).length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={t("personFidelityTitle")}>
              {(personReferences.data ?? []).map((person) => (
                <li key={person.personId} className="flex items-center gap-2">
                  {person.primaryPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.primaryPhotoUrl} alt={person.name} className="h-12 w-12 rounded object-cover" />
                  ) : null}
                  <span className="text-xs text-[var(--text-secondary)]">{person.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
            {personFidelity.findings.map((finding) => (
              <li key={finding.personId}>
                <p>
                  <span className="font-medium text-[var(--text-secondary)]">
                    {personNameById.get(finding.personId) ?? finding.personId}
                  </span>
                  {" · "}
                  {t(`personFidelityStatus.${finding.status}`)}
                </p>
                {finding.issue ? <p>{finding.issue}</p> : null}
                {finding.evidence.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </li>
            ))}
          </ul>
          {personFidelityGate === "blocked" ? (
            <p role="note" className="mt-2 text-xs text-[var(--danger-text)]">{t("personFidelityBlocked")}</p>
          ) : null}
          {personFidelity.review ? (
            <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">
              {personFidelity.review.accepted ? t("personFidelityAccepted") : t("personFidelityRejected")}
            </p>
          ) : null}
          {personFidelityGate === "needs_review" && personFidelity.review === undefined ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={personReview.isPending}
                onClick={() => personReview.review({ referenceHash: personFidelity.referenceHash, accepted: true })}
                className={secondaryActionClass}
              >
                {t("personFidelityConfirm")}
              </button>
              <button
                type="button"
                disabled={personReview.isPending}
                onClick={() => personReview.review({ referenceHash: personFidelity.referenceHash, accepted: false })}
                className={secondaryActionClass}
              >
                {t("personFidelityReject")}
              </button>
            </div>
          ) : null}
          {personReview.isError ? (
            <p role="alert" className="mt-2 text-xs text-[var(--danger-text)]">{t("personFidelityReviewFailed")}</p>
          ) : null}
        </section>
      ) : null}

      {selectionPolicy?.verdict === "legacy" && selectionPolicy.selectable ? (
        <div role="note" data-testid="legacy-selection-review" className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {t("legacyReviewRequired")}
        </div>
      ) : null}

      {deterministicBrandFidelity ? (
        <section
          data-testid="brand-fidelity-deterministic"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">{t("brandFidelityTitle")}</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {deterministicBrandFidelity.checks.map((brandCheck) => (
              <li key={brandCheck.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">{t(`brandFidelityCheck.${brandCheck.id}`)}</span>
                  <span className={brandCheck.state === "nonconforming" ? "text-[var(--danger-text)]" : "text-[var(--text-muted)]"}>
                    {t(`brandFidelityState.${brandCheck.state}`)}
                  </span>
                </div>
                {brandCheck.evidence.length > 0 ? (
                  <p className="break-all text-[var(--text-caption)] text-[var(--text-muted)]">
                    {brandCheck.evidence.map((item) => item.path).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {residualBrandFidelity && residualBrandFidelity.status !== "clear" ? (
        <section
          role="note"
          data-testid="brand-fidelity-residual"
          className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2"
        >
          <h3 className="text-xs font-medium text-[var(--text-secondary)]">
            {t(residualBrandFidelity.status === "suspected" ? "visualSuspicionTitle" : "visualInconclusiveTitle")}
          </h3>
          <ul className="mt-1 space-y-1 text-xs text-[var(--text-muted)]">
            {residualBrandFidelity.signals.map((signal) => (
              <li key={`${signal.classification}:${signal.code}`}>
                <p>{signal.note}</p>
                <p>{signal.confidence === null
                  ? t("visualNoConfidence")
                  : t("visualConfidence", { value: Math.round(signal.confidence * 100) })}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {output.status === "failed" ? (
        isRevision ? (
          onRetryRevision ? (
            <button type="button" className={secondaryActionClass} disabled={isRevising} onClick={() => onRetryRevision(output)}>
              {t("retry")}
            </button>
          ) : null
        ) : retryEligible ? (
          <button type="button" className={secondaryActionClass} disabled={isRetrying} onClick={() => onRetry(output.id)}>
            {t("retryProposal")}
          </button>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{t("retryUnavailable")}</p>
        )
      ) : null}

      {isCompleted ? (
        <>
          <div className="flex flex-col gap-2">
            {selectionPolicy?.selectable ? (
              <button
                type="button"
                className={studioPrimaryActionClass}
                title={t("approveHint")}
                aria-busy={isApproving}
                disabled={isApproving || output.isSelected}
                onClick={() => {
                  if (selectionPolicy.requiresConfirmation && !confirmingSelection) {
                    setConfirmingSelection(true);
                    return;
                  }
                  if (selectionPolicy.requiresConfirmation) onApprove(output.id, true, saveAsRecipe);
                  else onApprove(output.id, false, saveAsRecipe);
                }}
              >
                <ActionStatusIcon state={isApproving ? "pending" : output.isSelected ? "success" : approvalError ? "error" : "idle"} />
                {isApproving
                  ? t("approving")
                  : output.isSelected
                    ? t("approved")
                    : approvalError
                      ? t("retry")
                      : selectionPolicy.requiresConfirmation
                        ? confirmingSelection ? t("confirmApproval") : t("reviewBeforeApprove")
                        : t("approve")}
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryActionClass} title={t("downloadHint")} onClick={() => onDownload(output.id)}>{t("download")}</button>
            <button
              type="button"
              className={secondaryActionClass}
              data-testid="share-for-review"
              title={t("shareHint")}
              disabled={shareReview.isPending}
              onClick={() => {
                if (reviewShare) {
                  void copyTextToClipboard(reviewShare.url).then((copied) => {
                    setReviewShare({ url: reviewShare.url, copied });
                  });
                  return;
                }
                void shareReview.mutateAsync({ workId: output.workItemId, outputId: output.id })
                  .then((result) => setReviewShare({ url: result.shareUrl, copied: result.copied }))
                  .catch(() => setReviewShare(null));
              }}
            >
              {shareReview.isPending
                ? t("sharingForReview")
                : reviewShare?.copied
                  ? t("sharedForReview")
                  : reviewShare
                    ? t("copyReviewLinkAgain")
                    : t("shareForReview")}
            </button>
            {canOpenEditor ? (
              <button type="button" className={secondaryActionClass} disabled={editDisabled} onClick={() => onOpenLayerEditor?.(output.id)}>
                <Layers className="size-4" aria-hidden="true" />
                {t("editImage")}
              </button>
            ) : null}
            {layerization?.status === "completed" && onDownloadLayerized ? <button type="button" className={`${secondaryActionClass} border-[var(--focus-ring)]`} onClick={() => onDownloadLayerized(output.id, "psd")}>{t("downloadPsdWithLayers", { count: layerization.layers.length })}</button> : null}
            {onRevise ? <button type="button" className={secondaryActionClass} title={t("refineHint")} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{t("refine")}</button> : null}
            </div>
          </div>
          {reviewShare ? (
            <div data-testid="review-share-url-panel" className="space-y-2">
              {reviewShare.copied ? null : (
                <p role="status" className="text-sm text-[var(--warning-text)]">{t("reviewShareCopyFailed")}</p>
              )}
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                {t("reviewShareUrlLabel")}
                <input
                  data-testid="review-share-url"
                  readOnly
                  value={reviewShare.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]"
                />
              </label>
            </div>
          ) : null}
          {canSaveAsRecipe && selectionPolicy?.selectable && !output.isSelected ? (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                data-testid="save-as-recipe"
                checked={saveAsRecipe}
                onChange={(event) => setSaveAsRecipe(event.target.checked)}
              />
              {t("saveAsRecipe")}
            </label>
          ) : null}
          {needsLayerizeQuota && layerizeRemaining !== null ? <p className="text-xs text-[var(--text-secondary)]">{t("layerizeQuotaRemaining", { count: layerizeRemaining })}</p> : null}
          {editing && onRevise ? (
            <form
              className="space-y-3 rounded-[var(--radius-control)] bg-[var(--surface-raised)] p-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (submitting || isRevising) return;
                setSubmitting(true);
                try {
                  await onRevise(output.id, instruction.trim(), attachment);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                {t("revisionInstruction")}
                <textarea
                  aria-label={t("revisionInstruction")}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-2 font-normal"
                />
              </label>
              <label className="block text-sm text-[var(--text-secondary)]">
                {t("optionalAttachment")}
                <input
                  aria-label={t("optionalAttachment")}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-xs"
                />
              </label>
              <button type="submit" className={studioPrimaryActionClass} disabled={!instruction.trim() || isRevising || submitting}>
                {t("generateVariation")}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
