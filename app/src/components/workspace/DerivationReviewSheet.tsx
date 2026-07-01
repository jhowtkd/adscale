"use client";

import Image from "next/image";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { scoreCappedForDisplay } from "@/lib/derivation-display";
import {
  getExportDisplay,
  getOlharDisplay,
  isNormalApprovalBlocked,
  MIN_DIRECTION_REASON_LENGTH,
  type ReviewDecision,
  validateDirectionReason,
  verdictBadgeClassName,
} from "@/lib/derivation-display";
import { DerivationAutoRetryBadge } from "@/components/workspace/DerivationAutoRetryBadge";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { Derivation } from "@/lib/mock-data";
import type { AssetWithUrl } from "@/lib/hooks/use-assets";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";
import { cn } from "@/lib/utils";

type DerivationWithWorkspace = Derivation & { workspaceId?: string };

const CORPUS_API_ERROR_CODES = [
  "missing_client_profile",
  "invalid_derivation",
  "invalid_derivation_campaign",
  "invalid_campaign",
  "forbidden_corpus_payload",
  "validation_error",
  "duplicate_corpus_item",
  "invalid_quality_snapshot",
] as const;

const OLHAR_AXIS_KEYS = [
  ["figura", "olharAxisFigura"],
  ["gestalt", "olharAxisGestalt"],
  ["voz", "olharAxisVoz"],
  ["convite", "olharAxisConvite"],
] as const;

interface DerivationReviewSheetProps {
  open: boolean;
  derivation: Derivation | null;
  workspaceId?: string;
  campaignId?: string;
  clientProfileId?: string | null;
  campaignClient?: string | null;
  baseAsset?: AssetWithUrl | null;
  styleAsset?: AssetWithUrl | null;
  isRegenerating?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  isAddingToCorpus?: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerateWithFixes: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onSubmitDecision?: (input: {
    decision: ReviewDecision;
    directionReason?: string;
    overrideReason?: string;
  }) => void;
  onAddToCorpus?: () => void;
}

function AssetThumb({
  asset,
  label,
  emptyLabel,
}: {
  asset?: AssetWithUrl | null;
  label: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      {asset?.url ? (
        <div className="relative aspect-square w-20 overflow-hidden rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)]">
          <Image
            src={asset.url}
            alt={label}
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">{emptyLabel}</p>
      )}
    </div>
  );
}

function BulletList({
  items,
  tone,
}: {
  items: string[];
  tone: "positive" | "negative";
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "text-xs leading-snug",
            tone === "positive" ? "text-emerald-400/90" : "text-rose-300/90"
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function resolveCorpusApiError(
  translateError: (key: string) => string,
  body: { error?: string; code?: string }
): string {
  const code =
    body.code ??
    ((body.error && (CORPUS_API_ERROR_CODES as readonly string[]).includes(body.error))
      ? body.error
      : undefined);
  if (
    code &&
    (CORPUS_API_ERROR_CODES as readonly string[]).includes(code)
  ) {
    return translateError(code);
  }
  return body.error ?? translateError("corpusAddFailed");
}

export default function DerivationReviewSheet({
  open,
  derivation,
  workspaceId,
  campaignId,
  baseAsset,
  styleAsset,
  isRegenerating = false,
  isApproving = false,
  isRejecting = false,
  isAddingToCorpus = false,
  onOpenChange,
  onRegenerateWithFixes,
  onApprove,
  onReject,
  onSubmitDecision,
  onAddToCorpus,
}: DerivationReviewSheetProps) {
  const t = useTranslations("derivation");
  const tr = useTranslations("review");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const addToast = useAppStore((s) => s.addToast);
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);
  const [directionReason, setDirectionReason] = useState("");
  const [directionReasonError, setDirectionReasonError] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideReasonError, setOverrideReasonError] = useState<string | null>(null);

  const effectiveWorkspaceId =
    workspaceId ?? (derivation as DerivationWithWorkspace | null)?.workspaceId;
  const effectiveCampaignId = campaignId ?? derivation?.campaignId;

  const addToCorpusMutation = useMutation({
    mutationFn: async () => {
      if (!derivation || !effectiveWorkspaceId || !effectiveCampaignId) {
        throw new Error(te("corpusMissingContext"));
      }
      const res = await apiFetch("/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: effectiveWorkspaceId,
          campaignId: effectiveCampaignId,
          derivationId: derivation.id,
        }),
      });
      if (res.status === 403) {
        return { skipped: true as const };
      }
      if (res.status === 409) {
        throw new Error(te("duplicate_corpus_item"));
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        throw new Error(resolveCorpusApiError(te, err));
      }
      return { skipped: false as const };
    },
    onSuccess: (result) => {
      if (result.skipped) return;
      addToast("success", tr("corpusAddSuccess"));
      onAddToCorpus?.();
    },
    onError: (error: Error) => {
      addToast("error", error.message);
    },
  });

  const corpusPending = isAddingToCorpus || addToCorpusMutation.isPending;
  const corpusEligible =
    Boolean(effectiveWorkspaceId) &&
    Boolean(effectiveCampaignId) &&
    derivation?.status === "completed" &&
    Boolean(derivation?.imageUrl ?? derivation?.outputKey);

  if (!derivation) {
    return null;
  }

  const displayScore = scoreCappedForDisplay(
    derivation.qualityScore,
    derivation.qualityVerdict
  );
  const olhar = derivation.olharVerdict;
  const exportStatus = derivation.exportStatus;
  const olharDisplay = getOlharDisplay(olhar);
  const exportDisplay = getExportDisplay(exportStatus);
  const approvalBlocked = isNormalApprovalBlocked(derivation);
  const legacyInvalid = derivation.qualityVerdict === "invalid" && !olhar;
  const showInheritedCta =
    !derivation.ctaText &&
    (derivation.generationMode === "format_adaptation" ||
      derivation.generationMode === "restyling");
  const modeLabel = derivation.generationMode
    ? t(`generationMode.${derivation.generationMode}`)
    : tr("unknownMode");
  const whatWorks = olhar?.whatWorks?.length
    ? olhar.whatWorks
    : derivation.polishSuggestions ?? [];
  const whatBlocks = olhar?.whatBlocks?.length
    ? olhar.whatBlocks
    : derivation.hardFailures?.map((failure) => {
        const title = tr(`hardFailureCodes.${failure.code}` as "hardFailureCodes.cta_drift");
        return failure.message && failure.message !== title
          ? `${title}: ${failure.message}`
          : title;
      }) ?? [];

  const submitDecision = (decision: ReviewDecision) => {
    if (decision === "quase_regenerar" || decision === "nao_entra") {
      if (!validateDirectionReason(directionReason)) {
        setDirectionReasonError(
          tr("directionReasonRequired", { min: String(MIN_DIRECTION_REASON_LENGTH) })
        );
        setPendingDecision(decision);
        return;
      }
    }

    setDirectionReasonError(null);
    if (onSubmitDecision) {
      onSubmitDecision({
        decision,
        directionReason:
          decision === "quase_regenerar" || decision === "nao_entra"
            ? directionReason.trim()
            : undefined,
      });
      return;
    }

    if (decision === "entra") {
      onApprove?.();
      return;
    }
    onReject?.();
  };

  const decisionPending =
    pendingDecision === "entra"
      ? isApproving
      : pendingDecision === "nao_entra" || pendingDecision === "quase_regenerar"
        ? isRejecting || isRegenerating
        : isApproving || isRejecting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>{tr("reviewTitle", { name: derivation.name })}</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="relative aspect-square w-full max-w-md mx-auto overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
            {derivation.imageUrl ? (
              <Image
                src={derivation.imageUrl}
                alt={derivation.name}
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-[var(--text-muted)]">
                {t("noOutputYet")}
              </div>
            )}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {tr("olharPanelTitle")}
              </h3>
              <DerivationAutoRetryBadge
                derivation={derivation}
                className="inline-flex items-center rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-400"
              />
              {olharDisplay ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                    verdictBadgeClassName(olharDisplay.tone)
                  )}
                >
                  {tr(olharDisplay.labelKey)}
                </span>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">{tr("notYetEvaluated")}</span>
              )}
            </div>

            {olhar?.axes ? (
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {OLHAR_AXIS_KEYS.map(([axisKey, labelKey]) => (
                  <div key={axisKey} className="rounded-md border border-[var(--border-dim)] px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {tr(labelKey)}
                    </dt>
                    <dd className="text-sm font-semibold text-[var(--text-primary)]">
                      {olhar.axes[axisKey]}/3
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          {olhar?.directionNote ? (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {tr("directionNoteTitle")}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {olhar.directionNote}
              </p>
            </section>
          ) : null}

          {(whatWorks.length > 0 || whatBlocks.length > 0) && (
            <section className="grid gap-4 sm:grid-cols-2">
              {whatWorks.length > 0 ? (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {tr("whatWorksTitle")}
                  </h3>
                  <BulletList items={whatWorks} tone="positive" />
                </div>
              ) : null}
              {whatBlocks.length > 0 ? (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {tr("whatBlocksTitle")}
                  </h3>
                  <BulletList items={whatBlocks} tone="negative" />
                </div>
              ) : null}
            </section>
          )}

          {derivation.status === "completed" && (onSubmitDecision || (onApprove && onReject)) ? (
            <section className="space-y-3 border-t border-[var(--border-dim)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {tr("decisionTitle")}
              </h3>
              {(pendingDecision === "quase_regenerar" || pendingDecision === "nao_entra") && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="direction-reason"
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {tr("directionReasonLabel")}
                  </label>
                  <textarea
                    id="direction-reason"
                    value={directionReason}
                    onChange={(event) => {
                      setDirectionReason(event.target.value);
                      if (directionReasonError && validateDirectionReason(event.target.value)) {
                        setDirectionReasonError(null);
                      }
                    }}
                    rows={3}
                    placeholder={tr("directionReasonPlaceholder")}
                    className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  />
                  {directionReasonError ? (
                    <p className="text-xs text-rose-400">{directionReasonError}</p>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setPendingDecision("entra");
                    submitDecision("entra");
                  }}
                  disabled={decisionPending || approvalBlocked}
                  title={approvalBlocked ? tr("approveBlockedInvalid") : undefined}
                >
                  {tr("decisionEntra")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (pendingDecision !== "quase_regenerar") {
                      setPendingDecision("quase_regenerar");
                      return;
                    }
                    submitDecision("quase_regenerar");
                  }}
                  disabled={decisionPending}
                >
                  {tr("decisionQuaseRegenerar")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (pendingDecision !== "nao_entra") {
                      setPendingDecision("nao_entra");
                      return;
                    }
                    submitDecision("nao_entra");
                  }}
                  disabled={decisionPending}
                >
                  {tr("decisionNaoEntra")}
                </Button>
              </div>
              {legacyInvalid ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRegenerateWithFixes}
                  disabled={isRegenerating}
                  className="px-0 text-[var(--accent-blue)]"
                >
                  <RefreshCw className="size-4 mr-1" />
                  {tr("regenerateWithFixesConfirm")}
                </Button>
              ) : null}
              {approvalBlocked ? (
                <div
                  className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
                  role="region"
                  aria-label={tr("overrideApprovalAction")}
                >
                  <p className="text-xs leading-relaxed text-amber-400">{tr("overrideWarning")}</p>
                  {overrideMode ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="override-reason"
                        className="text-xs font-medium text-[var(--text-secondary)]"
                      >
                        {tr("overrideReasonLabel")}
                      </label>
                      <textarea
                        id="override-reason"
                        value={overrideReason}
                        onChange={(event) => {
                          setOverrideReason(event.target.value);
                          if (
                            overrideReasonError &&
                            validateDirectionReason(event.target.value)
                          ) {
                            setOverrideReasonError(null);
                          }
                        }}
                        rows={3}
                        placeholder={tr("overrideReasonPlaceholder")}
                        className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                      {overrideReasonError ? (
                        <p className="text-xs text-rose-400">{overrideReasonError}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!overrideMode) {
                        setOverrideMode(true);
                        return;
                      }
                      if (!validateDirectionReason(overrideReason)) {
                        setOverrideReasonError(
                          tr("overrideReasonRequired", {
                            min: String(MIN_DIRECTION_REASON_LENGTH),
                          })
                        );
                        return;
                      }
                      setOverrideReasonError(null);
                      setPendingDecision("entra");
                      if (onSubmitDecision) {
                        onSubmitDecision({
                          decision: "entra",
                          overrideReason: overrideReason.trim(),
                        });
                        return;
                      }
                      onApprove?.();
                    }}
                    disabled={decisionPending}
                  >
                    {tr("overrideApprovalAction")}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <details className="rounded-lg border border-[var(--border-dim)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
              {tr("exportDetailsToggle")}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {tr("exportPanelTitle")}
                </span>
                {exportDisplay ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                      verdictBadgeClassName(exportDisplay.tone)
                    )}
                  >
                    {tr(exportDisplay.labelKey)}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">{tr("notYetEvaluated")}</span>
                )}
              </div>
              {exportStatus?.issues?.length ? (
                <BulletList
                  items={exportStatus.issues.map((issue) => issue.message)}
                  tone="negative"
                />
              ) : null}
              {exportStatus?.setupIssues?.length ? (
                <BulletList
                  items={exportStatus.setupIssues.map((issue) => issue.message)}
                  tone="negative"
                />
              ) : null}
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">{tr("targetFormat")}</dt>
                  <dd className="text-right text-[var(--text-primary)]">
                    {derivation.format ?? tr("notSpecified")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">{tr("ctaContract")}</dt>
                  <dd className="text-right text-[var(--text-primary)]">
                    {derivation.ctaText ??
                      (showInheritedCta ? tr("ctaInheritedFromBase") : tr("notSpecified"))}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-4">
                <AssetThumb
                  asset={baseAsset}
                  label={tr("baseAsset")}
                  emptyLabel={tr("assetNotAvailable")}
                />
                {derivation.generationMode === "restyling" ? (
                  <AssetThumb
                    asset={styleAsset}
                    label={tr("styleReference")}
                    emptyLabel={tr("styleNotProvided")}
                  />
                ) : null}
              </div>
            </div>
          </details>

          <details className="rounded-lg border border-[var(--border-dim)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
              {tr("scoreDetailsToggle")}
            </summary>
            <div className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
              {displayScore != null ? (
                <p>
                  {tr("qualityScore")}: {displayScore}
                </p>
              ) : null}
              {derivation.qualityVerdict === "improvable" ? (
                <p className="text-amber-500">{t("improvableOutputBadge")}</p>
              ) : null}
              {derivation.scoreIssues?.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              <div className="space-y-2 border-t border-[var(--border-dim)] pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {tr("contractContextTitle")}
                </p>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--text-muted)]">{tr("generationMode")}</dt>
                    <dd className="text-right text-[var(--text-primary)]">{modeLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </details>
        </SheetBody>

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("close")}
            </Button>
            <ContextualFeedbackButton
              contextKind="derivation"
              campaignId={derivation.campaignId}
              derivationId={derivation.id}
              assetRefs={
                derivation.outputKey
                  ? [
                      {
                        kind: "derivation_output",
                        id: derivation.id,
                        key: derivation.outputKey,
                      },
                    ]
                  : undefined
              }
            />
            {corpusEligible ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={corpusPending}
                onClick={() => addToCorpusMutation.mutate()}
              >
                {corpusPending ? tr("corpusAdding") : tr("addToCorpus")}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
