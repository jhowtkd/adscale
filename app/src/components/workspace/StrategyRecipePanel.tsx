"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
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
import { useStrategyRecipe } from "@/lib/hooks/use-strategy-recipe";
import { useRecordBetaEvent } from "@/lib/hooks/use-record-beta-event";
import type { CreativeReadinessResult } from "@/server/ai/creative-readiness";
import {
  STRATEGY_RECIPE_IDS,
  type BrandKitSnapshot,
  type CampaignRecipeContext,
  type RecipeCreativeLevel,
  type StrategyRecipeId,
} from "@/server/ai/strategy-recipes";

const CREATIVE_LEVELS: RecipeCreativeLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

interface StrategyRecipePanelProps {
  campaignId: string;
  open: boolean;
  recipeSessionKey?: number;
  readiness?: CreativeReadinessResult | null;
  brandKit?: BrandKitSnapshot | null;
  campaign?: CampaignRecipeContext | null;
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
  isSubmitting,
  onClose,
  onGeneratePreview,
}: StrategyRecipePanelProps) {
  const t = useTranslations("strategyRecipes");
  const { recordEvent } = useRecordBetaEvent(campaignId);
  const completedRef = useRef(false);
  const tradeoffViewedRef = useRef(false);

  const STAGE_PROPS = { stage: "strategy_recipe", missionKey: "strategy_recipe" } as const;

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

  const handleGeneratePreview = (
    patch: ReturnType<typeof useStrategyRecipe>["campaignPatch"]
  ) => {
    completedRef.current = true;
    recordEvent("cockpit_stage_completed", STAGE_PROPS);
    onGeneratePreview(patch);
  };

  const recipe = useStrategyRecipe({
    readiness,
    brandKit,
    campaign,
    resetKey: open ? recipeSessionKey : undefined,
  });

  const ctaValue = useMemo(
    () => recipe.resolvedConfig.ctaVariants.join(", "),
    [recipe.resolvedConfig.ctaVariants]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                      ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
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
                      <span className="shrink-0 rounded-full bg-[var(--accent-green-dim)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--accent-green-text)]">
                        {t("recommended")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-[var(--border-dim)] p-3 space-y-3">
            <p className="text-xs font-medium text-[var(--text-primary)]">
              {t("overridesTitle")}
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-[var(--text-secondary)]">
                {t("creativeLevel")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {CREATIVE_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => recipe.setCreativeLevel(level)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs capitalize",
                      recipe.resolvedConfig.creativeLevel === level
                        ? "border-[var(--accent-green)] text-[var(--accent-green-text)]"
                        : "border-[var(--border-dim)] text-[var(--text-secondary)]"
                    )}
                  >
                    {t(`levels.${level}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-ctas" className="text-xs text-[var(--text-secondary)]">
                {t("ctaVariants")}
              </Label>
              <Input
                id="recipe-ctas"
                value={ctaValue}
                onChange={(e) =>
                  recipe.setCtaVariants(
                    e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                  )
                }
                placeholder={t("ctaPlaceholder")}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => recipe.setGenerationMode("art_variation")}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs",
                  recipe.resolvedConfig.generationMode === "art_variation"
                    ? "border-[var(--accent-green)]"
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
                  recipe.resolvedConfig.generationMode === "format_adaptation"
                    ? "border-[var(--accent-green)]"
                    : "border-[var(--border-dim)]"
                )}
              >
                {t("modeFormat")}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[var(--surface-raised)] p-3 text-xs text-[var(--text-secondary)]">
            <p>{t("creditPreview", { credits: recipe.previewCredits })}</p>
            <p className="mt-1">
              {t("creditBatchEstimate", { credits: recipe.batchCredits })}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={isSubmitting || recipe.resolvedConfig.ctaVariants.length === 0}
            onClick={() => handleGeneratePreview(recipe.campaignPatch)}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {t("generatePreview")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
