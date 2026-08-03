"use client";

import { useCallback, useEffect, useId, useRef, useState, startTransition, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useStrategyRecipe,
  type StrategyRecipePrefill,
} from "@/lib/hooks/use-strategy-recipe";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import {
  useArtVariationSuggestions,
  type ArtCreativeLevel,
} from "@/lib/hooks/use-art-variation-suggestions";
import {
  DERIVATION_FORMATS,
  type DerivationFormat,
} from "@/lib/derivation-display";
import {
  STRATEGY_RECIPE_IDS,
  type BrandKitSnapshot,
  type CampaignRecipeContext,
  type RecipeCreativeLevel,
  type RecipeReadinessSnapshot,
} from "@/lib/domain/strategy-recipe-types";

const CREATIVE_LEVELS: RecipeCreativeLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

const CTA_FIELD_KEYS = ["primary", "secondary", "tertiary"] as const;

const FORMAT_I18N_KEY: Record<DerivationFormat, "square" | "portrait" | "stories"> = {
  "1:1": "square",
  "4:5": "portrait",
  "9:16": "stories",
};

interface StrategyRecipePanelProps {
  campaignId: string;
  open: boolean;
  recipeSessionKey?: number;
  readiness?: RecipeReadinessSnapshot | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
  campaignCreativeLevel?: string | null;
  suggestedCta?: string;
  initialPrefill?: StrategyRecipePrefill | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onGeneratePreview: (patch: ReturnType<typeof useStrategyRecipe>["campaignPatch"]) => void;
}

export default function StrategyRecipePanel({
  campaignId,
  open,
  recipeSessionKey,
  readiness,
  brandKit,
  campaign,
  campaignCreativeLevel,
  suggestedCta,
  initialPrefill,
  isSubmitting,
  onClose,
  onGeneratePreview,
}: StrategyRecipePanelProps) {
  const t = useTranslations("strategyRecipes");
  const tBriefing = useTranslations("briefing");
  const tGeneration = useTranslations("generation");
  const tWorkspace = useTranslations("workspace.derivar");
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const completedRef = useRef(false);
  const tradeoffViewedRef = useRef(false);
  const creativeLevelGroupId = useId();

  const STAGE_PROPS = { stage: "strategy_recipe", missionKey: "strategy_recipe" } as const;

  const recipe = useStrategyRecipe({
    readiness,
    brandKit,
    campaign,
    enabled: open,
    resetKey: open ? recipeSessionKey : undefined,
    initialPrefill: open ? initialPrefill : null,
  });

  const isArtMode = recipe.resolvedConfig.generationMode === "art_variation";

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
    intent: "auto_art",
    open: open && isArtMode,
    campaignCreativeLevel: campaignCreativeLevel ?? campaign?.creativeLevel,
    campaignCtaVariants: campaign?.ctaVariants,
    suggestedCta,
  });

  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    tradeoffViewedRef.current = false;
    recordEvent("cockpit_stage_entered", STAGE_PROPS);
    if (!tradeoffViewedRef.current) {
      tradeoffViewedRef.current = true;
      recordEvent("recipe_tradeoff_viewed", STAGE_PROPS);
    }
    return () => {
      if (!completedRef.current) {
        recordEvent("cockpit_stage_abandoned", STAGE_PROPS);
      }
    };
  }, [open, recordEvent]);

  const handleClose = () => {
    if (!completedRef.current) {
      recordEvent("cockpit_stage_abandoned", STAGE_PROPS);
    }
    onClose();
  };

  const buildPreviewPatch = useCallback(
    (selectedFormats: DerivationFormat[]) => {
      if (isArtMode) {
        return {
          generationMode: "art_variation" as const,
          creativeLevel: creativeLevel as RecipeCreativeLevel,
          ctaVariants: validCtaVariants.slice(0, 3),
        };
      }
      return {
        ...recipe.campaignPatch,
        generationMode: "format_adaptation" as const,
        targetFormats: selectedFormats,
      };
    },
    [isArtMode, creativeLevel, validCtaVariants, recipe.campaignPatch]
  );

  const [selectedFormats, setSelectedFormats] = useState<DerivationFormat[]>([
    ...DERIVATION_FORMATS,
  ]);

  useEffect(() => {
    if (!open) return;
    startTransition(() => {
      setSelectedFormats([...DERIVATION_FORMATS]);
    });
  }, [open, recipeSessionKey]);

  const handleCreativeLevelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = CREATIVE_LEVELS.indexOf(creativeLevel as RecipeCreativeLevel);
      if (currentIndex < 0) return;

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
      setCreativeLevel(CREATIVE_LEVELS[nextIndex] as ArtCreativeLevel);
    },
    [creativeLevel, setCreativeLevel]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {recipe.isError ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--status-error)]/30 bg-[var(--status-error)]/10 px-3 py-2"
            >
              <p className="text-xs text-[var(--text-primary)]">
                {t("surfaceError")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void recipe.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : null}

          {/* Phase 6 / S09: credits from server resolve surface (not client-estimated) */}
          <div
            role="status"
            data-testid="strategy-recipe-credits"
            className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          >
            <p data-testid="strategy-recipe-preview-credits">
              {recipe.isLoading
                ? t("creditPreview", { credits: "…" })
                : t("creditPreview", { credits: recipe.previewCredits })}
            </p>
            <p
              data-testid="strategy-recipe-batch-credits"
              className="mt-0.5 text-[var(--text-primary)]"
            >
              {recipe.isLoading
                ? t("creditBatchEstimate", { credits: "…" })
                : t("creditBatchEstimate", { credits: recipe.batchCredits })}
            </p>
          </div>

          <div className="space-y-2">
            {STRATEGY_RECIPE_IDS.map((id) => {
              const ranked = recipe.rankedRecipes.find((r) => r.id === id);
              const selected = recipe.selectedRecipeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    recipe.selectRecipe(id);
                    recordEvent("recipe_selected", {
                      ...STAGE_PROPS,
                      recipeId: id,
                    });
                  }}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                      : "border-[var(--border-dim)] hover:border-[var(--border-medium)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {t(`recipes.${id}.name`)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t(`recipes.${id}.tradeoff`)}
                      </p>
                    </div>
                    {ranked?.recommended && (
                      <span className="shrink-0 rounded-full bg-[var(--selection-bg)] px-2 py-0.5 font-mono text-[var(--text-caption)] uppercase tracking-wide text-[var(--selection-text)]">
                        {t("recommended")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 rounded-lg border border-[var(--border-dim)] p-3">
            <p className="text-xs font-medium text-[var(--text-primary)]">
              {t("overridesTitle")}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => recipe.setGenerationMode("art_variation")}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs",
                  isArtMode
                    ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)]"
                    : "border-[var(--border-dim)]"
                )}
              >
                {t("modeArt")}
              </button>
              <button
                type="button"
                onClick={() => recipe.setGenerationMode("format_adaptation")}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs",
                  !isArtMode
                    ? "border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)]"
                    : "border-[var(--border-dim)]"
                )}
              >
                {t("modeFormat")}
              </button>
            </div>

            {isArtMode ? (
              <div className="space-y-4">
                {suggestionsError ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--status-processing-dot)_35%,transparent)] bg-[var(--status-queued-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {tWorkspace("config.autoArt.suggestionsFailed")}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {tWorkspace("config.autoArt.usingCampaignDefaults")}
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
                      {tWorkspace("config.autoArt.retrySuggestions")}
                    </Button>
                  </div>
                ) : null}

                {isLoadingSuggestions ? (
                  <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    {tGeneration("generatingSuggestions")}
                  </p>
                ) : aiSuggestionsApplied ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {tWorkspace("config.autoArt.suggestionsApplied")}
                  </p>
                ) : null}

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
                      const levelLabel = tBriefing(`creativeLevel.${level}`);
                      const contractLabel = tBriefing(`creativeLevel.contract.${level}`);

                      return (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          onClick={() => setCreativeLevel(level as ArtCreativeLevel)}
                          className={cn(
                            "min-h-11 rounded-lg border px-3 py-2.5 text-left text-xs",
                            isSelected
                              ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                              : "border-[var(--border-dim)]",
                            highlightedFields.creativeLevel &&
                              isSelected &&
                              "ring-1 ring-[var(--focus-ring)]"
                          )}
                        >
                          <span className="block font-medium text-[var(--text-primary)]">
                            {levelLabel}
                          </span>
                          <span className="mt-0.5 block text-[var(--text-secondary)]">
                            {contractLabel}
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
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {tBriefing("ctaHelpArt")}
                  </p>
                  <div className="mt-3 space-y-3">
                    {CTA_FIELD_KEYS.map((fieldKey, index) => {
                      const label =
                        index === 0
                          ? tBriefing("ctaRequired")
                          : tBriefing("ctaOptional", { number: index + 1 });

                      return (
                        <div key={fieldKey}>
                          <Label
                            htmlFor={`recipe-cta-${fieldKey}`}
                            className="text-xs text-[var(--text-secondary)]"
                          >
                            {label}
                          </Label>
                          <Input
                            id={`recipe-cta-${fieldKey}`}
                            value={ctas[index]}
                            onChange={(event) => updateCta(index, event.target.value)}
                            placeholder={tGeneration("ctaPlaceholder")}
                            aria-required={index === 0}
                            className={cn(
                              "mt-1.5",
                              highlightedFields.ctaIndices.includes(index) &&
                                "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <FormatSelectionFields
                key={recipeSessionKey ?? "default"}
                labels={{ title: t("targetFormatsLabel"), help: t("targetFormatsHelp") }}
                selectedFormats={selectedFormats}
                onSelectedFormatsChange={setSelectedFormats}
              />
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={
              isSubmitting ||
              recipe.isError ||
              (isArtMode
                ? !canConfirm || isLoadingSuggestions
                : selectedFormats.length === 0)
            }
            onClick={() => {
              completedRef.current = true;
              recordEvent("cockpit_stage_completed", STAGE_PROPS);
              onGeneratePreview(
                buildPreviewPatch(isArtMode ? [] : selectedFormats)
              );
            }}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {t("generateVariations")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatSelectionFields({
  labels,
  selectedFormats,
  onSelectedFormatsChange,
}: {
  labels: { title: string; help: string };
  selectedFormats: DerivationFormat[];
  onSelectedFormatsChange: (formats: DerivationFormat[]) => void;
}) {
  const tBriefing = useTranslations("briefing");

  const toggleFormat = (format: DerivationFormat) => {
    const isSelected = selectedFormats.includes(format);
    if (isSelected) {
      if (selectedFormats.length === 1) return;
      onSelectedFormatsChange(selectedFormats.filter((item) => item !== format));
      return;
    }
    onSelectedFormatsChange([...selectedFormats, format]);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-[var(--text-secondary)]">{labels.title}</Label>
      <p className="text-xs text-[var(--text-muted)]">{labels.help}</p>
      {DERIVATION_FORMATS.map((format) => {
        const labelKey = FORMAT_I18N_KEY[format];
        const isSelected = selectedFormats.includes(format);
        return (
          <label
            key={format}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              isSelected
                ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                : "border-[var(--border-dim)] bg-[var(--surface-base)]"
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--selection-text)]"
              checked={isSelected}
              onChange={() => toggleFormat(format)}
              aria-label={tBriefing(`targetFormats.${labelKey}.label`)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {tBriefing(`targetFormats.${labelKey}.label`)}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                {tBriefing(`targetFormats.${labelKey}.description`)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
