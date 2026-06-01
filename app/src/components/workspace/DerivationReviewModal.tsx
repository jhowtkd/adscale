"use client";

import Image from "next/image";
import { Check, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { scoreCappedForDisplay } from "@/lib/derivation-quality";
import type { Derivation } from "@/lib/mock-data";
import type { AssetWithUrl } from "@/lib/hooks/use-assets";

interface DerivationReviewModalProps {
  open: boolean;
  derivation: Derivation | null;
  baseAsset?: AssetWithUrl | null;
  styleAsset?: AssetWithUrl | null;
  isRegenerating?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerateWithFixes: () => void;
  onApprove?: () => void;
  onReject?: () => void;
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
          <Image src={asset.url} alt={label} fill className="object-cover" unoptimized />
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function DerivationReviewModal({
  open,
  derivation,
  baseAsset,
  styleAsset,
  isRegenerating = false,
  isApproving = false,
  isRejecting = false,
  onOpenChange,
  onRegenerateWithFixes,
  onApprove,
  onReject,
}: DerivationReviewModalProps) {
  const t = useTranslations("derivation");
  const tr = useTranslations("review");
  const tc = useTranslations("common");

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{tr("reviewTitle", { name: derivation.name })}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
            {derivation.imageUrl ? (
              <Image
                src={derivation.imageUrl}
                alt={derivation.name}
                fill
                className="object-contain"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-[var(--text-muted)]">
                {t("noOutputYet")}
              </div>
            )}
          </div>

          <div className="space-y-5">
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
                  <ul className="space-y-1">
                    {derivation.hardFailures.map((failure) => (
                      <li key={failure.code} className="text-xs text-rose-300/90">
                        {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {derivation.polishSuggestions && derivation.polishSuggestions.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    {tr("polishSuggestionsTitle")}
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
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("close")}
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
