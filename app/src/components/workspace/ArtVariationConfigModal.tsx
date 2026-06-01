"use client";

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

  const {
    creativeLevel,
    setCreativeLevel,
    ctas,
    updateCta,
    validCtaVariants,
    isLoadingSuggestions,
    canConfirm,
  } = useArtVariationSuggestions({
    campaignId,
    intent,
    open,
    campaignCreativeLevel,
    campaignCtaVariants,
    suggestedCta,
  });

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      creativeLevel,
      ctaVariants: validCtaVariants.slice(0, 3),
    });
  };

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
          <div>
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tGeneration("creativityProfile")}
            </Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CREATIVE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setCreativeLevel(level)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    creativeLevel === level
                      ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                      : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--accent-green)]/50"
                  )}
                >
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {tBriefing(`creativeLevel.${level}`)}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-secondary)]">
                    {tBriefing(`creativeLevel.contract.${level}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("ctaVariants")}
            </Label>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {tBriefing("ctaHelpArt")}
            </p>
            {intent === "auto_art" && isLoadingSuggestions && (
              <p className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Loader2 size={14} className="animate-spin" />
                {tGeneration("generatingSuggestions")}
              </p>
            )}
            <div className="mt-3 space-y-2">
              {CTA_FIELD_KEYS.map((fieldKey, index) => (
                <div key={fieldKey}>
                  <Label
                    htmlFor={`art-cta-${fieldKey}`}
                    className="sr-only"
                  >
                    {tBriefing("ctaPiece", { number: index + 1 })}
                  </Label>
                  <Input
                    id={`art-cta-${fieldKey}`}
                    value={ctas[index]}
                    onChange={(event) => updateCta(index, event.target.value)}
                    placeholder={tGeneration("ctaPlaceholder")}
                    disabled={isLoadingSuggestions}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            {t("actions.back")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t("actions.cancel")}
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
