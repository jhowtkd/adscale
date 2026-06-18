"use client";

import Image from "next/image";
import { Check, RefreshCw, X } from "lucide-react";
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
import { scoreCappedForDisplay } from "@/lib/derivation-quality";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { Derivation } from "@/lib/mock-data";
import type { AssetWithUrl } from "@/lib/hooks/use-assets";
import ContextualFeedbackButton from "@/components/feedback/ContextualFeedbackButton";

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
  onAddToCorpus,
}: DerivationReviewSheetProps) {
  const t = useTranslations("derivation");
  const tr = useTranslations("review");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const addToast = useAppStore((s) => s.addToast);

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
  const isInvalid = derivation.qualityVerdict === "invalid";
  const showInheritedCta =
    !derivation.ctaText &&
    (derivation.generationMode === "format_adaptation" ||
      derivation.generationMode === "restyling");
  const modeLabel = derivation.generationMode
    ? t(`generationMode.${derivation.generationMode}`)
    : tr("unknownMode");

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

          <section className="space-y-3 rounded-lg border border-[var(--border-dim)] p-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {tr("contractPanelTitle")}
            </h3>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-muted)]">{tr("generationMode")}</dt>
                <dd className="text-right text-[var(--text-primary)]">{modeLabel}</dd>
              </div>
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
            <div className="flex flex-wrap gap-4 pt-1">
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
          </section>

          <section className="space-y-3 rounded-lg border border-[var(--border-dim)] p-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {tr("qualityPanelTitle")}
            </h3>
            {derivation.qualityVerdict === "invalid" ? (
              <p className="text-xs font-semibold text-rose-400">{t("invalidOutputBadge")}</p>
            ) : null}
            {derivation.qualityVerdict === "improvable" ? (
              <p className="text-xs font-semibold text-amber-500">{t("improvableOutputBadge")}</p>
            ) : null}
            {displayScore != null ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {tr("qualityScore")}: {displayScore}
              </p>
            ) : null}
            {derivation.hardFailures && derivation.hardFailures.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  {tr("hardFailuresTitle")}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
                  {tr("blockingFailureHint")}
                </p>
                <ul className="space-y-1.5">
                  {derivation.hardFailures.map((failure) => {
                    const title = tr(`hardFailureCodes.${failure.code}` as "hardFailureCodes.cta_drift");
                    const detail =
                      failure.message && failure.message !== title
                        ? failure.message.length > 120
                          ? `${failure.message.slice(0, 117)}...`
                          : failure.message
                        : null;
                    return (
                      <li key={failure.code} className="text-xs text-rose-300/90">
                        <span className="font-medium">{title}</span>
                        {detail ? (
                          <span className="mt-0.5 block text-[11px] text-rose-300/70">{detail}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {derivation.polishSuggestions && derivation.polishSuggestions.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  {tr("polishSuggestionsTitle")}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
                  {tr("polishSuggestionHint")}
                </p>
                <ul className="space-y-1">
                  {derivation.polishSuggestions.map((suggestion) => (
                    <li key={suggestion} className="text-xs text-amber-500/90">
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
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
          <div className="flex flex-wrap gap-2">
            {isInvalid ? (
              <Button type="button" onClick={onRegenerateWithFixes} disabled={isRegenerating}>
                <RefreshCw className="size-4 mr-1" />
                {tr("regenerateWithFixesConfirm")}
              </Button>
            ) : null}
            {derivation.status === "completed" && onApprove && onReject ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onApprove}
                  disabled={isApproving || isInvalid}
                  title={isInvalid ? tr("approveBlockedInvalid") : undefined}
                >
                  <Check className="size-4 mr-1" />
                  {tc("approve")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReject}
                  disabled={isRejecting}
                >
                  <X className="size-4 mr-1" />
                  {tc("reject")}
                </Button>
              </>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
