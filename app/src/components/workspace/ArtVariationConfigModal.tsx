"use client";

import { useCallback, useId, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Palette, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";
import {
  useArtVariationSuggestions,
  type ArtCreativeLevel,
} from "@/lib/hooks/use-art-variation-suggestions";

const CTA_FIELD_KEYS = ["primary", "secondary", "tertiary"] as const;

const SHELL_KEY: Record<
  Extract<DerivationIntent, "manual_art" | "auto_art">,
  "manualArt" | "autoArt"
> = {
  manual_art: "manualArt",
  auto_art: "autoArt",
};

const CREATIVE_LEVELS: ArtCreativeLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

export interface ArtVariationConfig {
  creativeLevel: ArtCreativeLevel;
  ctaVariants: string[];
}

interface ArtVariationConfigModalProps {
  open: boolean;
  intent: Extract<DerivationIntent, "manual_art" | "auto_art">;
  campaignId: string;
  campaignCreativeLevel?: string | null;
  campaignCtaVariants?: string[] | null;
  suggestedCta?: string;
  isSubmitting?: boolean;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (config: ArtVariationConfig) => void;
}

export default function ArtVariationConfigModal({
  open,
  intent,
  campaignId,
  campaignCreativeLevel,
  campaignCtaVariants,
  suggestedCta,
  isSubmitting,
  onBack,
  onClose,
  onConfirm,
}: ArtVariationConfigModalProps) {
  const t = useTranslations("workspace.derivar");
  const tBriefing = useTranslations("briefing");
  const tGeneration = useTranslations("generation");
  const shellKey = SHELL_KEY[intent];
  const creativeLevelGroupId = useId();

  const {
    creativeLevel,
    setCreativeLevel,
    ctas,
    updateCta,
    validCtaVariants,
    isLoadingSuggestions,
    suggestionsError,
    retrySuggestions,
    aiSuggestionsApplied,
    highlightedFields,
    canConfirm,
  } = useArtVariationSuggestions({
    campaignId,
    intent,
    open,
    campaignCreativeLevel,
    campaignCtaVariants,
    suggestedCta,
  });

  const formDisabled = intent === "auto_art" && isLoadingSuggestions;

  const handleCreativeLevelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = CREATIVE_LEVELS.indexOf(creativeLevel);
      if (currentIndex < 0) {
        return;
      }

      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % CREATIVE_LEVELS.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + CREATIVE_LEVELS.length) % CREATIVE_LEVELS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = CREATIVE_LEVELS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      setCreativeLevel(CREATIVE_LEVELS[nextIndex]);
    },
    [creativeLevel, setCreativeLevel]
  );

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      creativeLevel,
      ctaVariants: validCtaVariants.slice(0, 3),
    });
  };

  const showAutoStatus =
    intent === "auto_art" && !isLoadingSuggestions && !suggestionsError;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--accent-green)]" />
            {t(`config.${shellKey}.title`)}
          </DialogTitle>
          <DialogDescription>{t(`config.${shellKey}.description`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {intent === "auto_art" && isLoadingSuggestions && (
            <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Loader2 size={14} className="animate-spin shrink-0" />
              {tGeneration("generatingSuggestions")}
            </p>
          )}

          {intent === "auto_art" && suggestionsError && (
            <div
              role="alert"
              className={cn(
                "rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3",
                "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              )}
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t("config.autoArt.suggestionsFailed")}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {t("config.autoArt.usingCampaignDefaults")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={retrySuggestions}
                disabled={isSubmitting || isLoadingSuggestions}
                className="shrink-0"
              >
                {t("config.autoArt.retrySuggestions")}
              </Button>
            </div>
          )}

          {showAutoStatus && (
            <p className="text-xs text-[var(--text-secondary)]">
              {aiSuggestionsApplied
                ? t("config.autoArt.suggestionsApplied")
                : t("config.autoArt.usingCampaignDefaults")}
            </p>
          )}

          <fieldset
            disabled={formDisabled || isSubmitting}
            className={cn(
              "space-y-5 border-0 p-0 m-0 min-w-0",
              formDisabled && "pointer-events-none opacity-60"
            )}
          >
          <div>
            <span
              id={creativeLevelGroupId}
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              {tGeneration("creativityProfile")}
            </span>
            <div
              role="radiogroup"
              aria-labelledby={creativeLevelGroupId}
              className="mt-2 grid grid-cols-2 gap-2"
              onKeyDown={handleCreativeLevelKeyDown}
            >
              {CREATIVE_LEVELS.map((level) => {
                const isSelected = creativeLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setCreativeLevel(level)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                        : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--accent-green)]/50",
                      highlightedFields.creativeLevel &&
                        isSelected &&
                        "ring-1 ring-[var(--accent-green)]/40"
                    )}
                  >
                    <span className="block text-sm font-medium text-[var(--text-primary)]">
                      {tBriefing(`creativeLevel.${level}`)}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-secondary)]">
                      {tBriefing(`creativeLevel.contract.${level}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("ctaVariants")}
            </Label>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {tBriefing("ctaHelpArt")}
            </p>
            <div className="mt-3 space-y-2">
              {CTA_FIELD_KEYS.map((fieldKey, index) => {
                const isHighlighted = highlightedFields.ctaIndices.includes(index);
                const label =
                  index === 0
                    ? tBriefing("ctaRequired")
                    : tBriefing("ctaOptional", { number: index + 1 });

                return (
                  <div key={fieldKey}>
                    <Label
                      htmlFor={`art-cta-${fieldKey}`}
                      className="text-xs text-[var(--text-secondary)]"
                    >
                      {label}
                    </Label>
                    <Input
                      id={`art-cta-${fieldKey}`}
                      value={ctas[index]}
                      onChange={(event) => updateCta(index, event.target.value)}
                      placeholder={tGeneration("ctaPlaceholder")}
                      className={cn(
                        "mt-1",
                        isHighlighted &&
                          "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          </fieldset>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            {t("actions.back")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
            className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
          >
            {isSubmitting ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
