"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Wand2, LayoutTemplate, Paintbrush, Lightbulb, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSuggestCtas, useSuggestCreativeLevel, type CampaignContext } from "@/lib/hooks/use-generation-suggestions";

export interface GenerationConfig {
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  targetFormats: string[];
  ctaVariants: [string, string, string];
}

interface GenerationStepProps {
  campaignId: string;
  campaignContext?: CampaignContext;
  initialData?: Partial<GenerationConfig>;
  onContinue: (data: GenerationConfig) => void;
  onBack: () => void;
}

const generationModes = [
  {
    value: "art_variation" as const,
    label: "modes.artVariation.label",
    description: "modes.artVariation.description",
    icon: Paintbrush,
  },
  {
    value: "format_adaptation" as const,
    label: "modes.formatAdaptation.label",
    description: "modes.formatAdaptation.description",
    icon: LayoutTemplate,
  },
  {
    value: "restyling" as const,
    label: "modes.restyling.label",
    description: "modes.restyling.description",
    icon: Wand2,
  },
];

const creativeLevels = [
  {
    value: "conservative" as const,
    label: "creativeLevel.conservative",
    description: "creativeLevel.contract.conservative",
    icon: Shield,
  },
  {
    value: "balanced" as const,
    label: "creativeLevel.balanced",
    description: "creativeLevel.contract.balanced",
    icon: Lightbulb,
  },
  {
    value: "bold" as const,
    label: "creativeLevel.bold",
    description: "creativeLevel.contract.bold",
    icon: Zap,
  },
  {
    value: "extreme" as const,
    label: "creativeLevel.extreme",
    description: "creativeLevel.contract.extreme",
    icon: Sparkles,
  },
];

export default function GenerationStep({
  campaignId,
  campaignContext,
  initialData,
  onContinue,
  onBack,
}: GenerationStepProps) {
  const t = useTranslations("generation");
  const tCommon = useTranslations("common");

  const targetFormatOptions = [
    { id: "1:1", label: "1:1", description: t("formatSquare") },
    { id: "4:5", label: "4:5", description: t("formatPortrait") },
    { id: "9:16", label: "9:16", description: t("formatStories") },
  ];

  const [config, setConfig] = useState<GenerationConfig>({
    generationMode: initialData?.generationMode ?? "art_variation",
    creativeLevel: initialData?.creativeLevel ?? "balanced",
    targetFormats: initialData?.targetFormats ?? ["1:1"],
    ctaVariants: initialData?.ctaVariants ?? ["", "", ""],
  });

  const [ctaSuggestions, setCtaSuggestions] = useState<Array<{ value: string; confidence: string } | null>>([
    null,
    null,
    null,
  ]);

  const suggestCtas = useSuggestCtas(campaignId);
  const { data: creativeLevelSuggestion, isLoading: isLoadingCreativeLevel } = useSuggestCreativeLevel(campaignId);

  const handleSuggestCtas = useCallback(async () => {
    if (!campaignContext) return;

    try {
      const result = await suggestCtas.mutateAsync({
        campaignContext,
        existingCtas: config.ctaVariants.filter(Boolean),
      });

      const suggestions = result.suggestions.slice(0, 3);
      setCtaSuggestions([
        suggestions[0] ?? null,
        suggestions[1] ?? null,
        suggestions[2] ?? null,
      ]);
    } catch {
      // Silently fail - user can still type manually
      setCtaSuggestions([null, null, null]);
    }
  }, [campaignContext, config.ctaVariants, suggestCtas]);

  // Auto-suggest CTAs when component mounts if we have context
  const hasAutoSuggested = useRef(false);
  useEffect(() => {
    if (campaignContext && campaignId !== "new" && !hasAutoSuggested.current) {
      hasAutoSuggested.current = true;
      // Defer to next tick to avoid setState-during-render warning
      queueMicrotask(() => {
        handleSuggestCtas();
      });
    }
  }, [campaignContext, campaignId, handleSuggestCtas]);

  const updateField = <K extends keyof GenerationConfig>(field: K, value: GenerationConfig[K]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplySuggestion = (index: number, value: string) => {
    const next: [string, string, string] = [...config.ctaVariants] as [string, string, string];
    next[index] = value;
    updateField("ctaVariants", next);
  };

  const handleApplyAllSuggestions = () => {
    const next: [string, string, string] = ctaSuggestions.map((s, i) =>
      s?.value ? s.value : config.ctaVariants[i]
    ) as [string, string, string];
    updateField("ctaVariants", next);
  };

  const handleApplyCreativeLevelSuggestion = () => {
    if (creativeLevelSuggestion?.suggestedLevel) {
      updateField("creativeLevel", creativeLevelSuggestion.suggestedLevel);
    }
  };

  const hasSuggestions = ctaSuggestions.some((s) => s !== null);
  const hasCreativeLevelSuggestion = creativeLevelSuggestion?.suggestedLevel && creativeLevelSuggestion.suggestedLevel !== config.creativeLevel;

  return (
    <div className="max-w-[720px] mx-auto space-y-8">
      {/* ---- Derivation Mode ---- */}
      <section className="animate-fade-in space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("derivationMode")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {generationModes.map((mode) => {
            const Icon = mode.icon;
            const isSelected = config.generationMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => updateField("generationMode", mode.value)}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg border px-4 py-4 text-left transition-all duration-200",
                  isSelected
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] ring-1 ring-[var(--accent-mint)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <Icon
                  size={20}
                  className={cn(
                    "transition-colors",
                    isSelected ? "text-[var(--accent-mint)]" : "text-[var(--text-muted)]"
                  )}
                />
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)] block">
                    {t(mode.label)}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {t(mode.description)}
                  </span>
                </div>
                {isSelected && (
                  <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-[var(--accent-mint)]" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Creativity Profile ---- */}
      <section className="animate-fade-in space-y-3" style={{ animationDelay: "100ms" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("creativityProfile")}</h2>
          {isLoadingCreativeLevel && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Sparkles size={12} className="animate-pulse" />
              {t("analyzing")}
            </span>
          )}
          {hasCreativeLevelSuggestion && (
            <button
              type="button"
              onClick={handleApplyCreativeLevelSuggestion}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
            >
              <Sparkles size={12} />
              {t("applySuggestion")}
            </button>
          )}
        </div>
        {hasCreativeLevelSuggestion && creativeLevelSuggestion.reasoning && (
          <div className="rounded-lg border border-[var(--accent-mint)]/20 bg-[var(--accent-mint)]/5 px-3 py-2">
            <p className="text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--accent-mint)]">{t("aiSuggestion")}:</span>{" "}
              {creativeLevelSuggestion.reasoning}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {creativeLevels.map((level) => {
            const Icon = level.icon;
            const isSelected = config.creativeLevel === level.value;
            return (
              <button
                key={level.value}
                type="button"
                onClick={() => updateField("creativeLevel", level.value)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200",
                  isSelected
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] ring-1 ring-[var(--accent-mint)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <Icon
                  size={18}
                  className={cn(
                    "mt-0.5 shrink-0",
                    isSelected ? "text-[var(--accent-mint)]" : "text-[var(--text-muted)]"
                  )}
                />
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)] block">
                    {t(level.label)}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {t(level.description)}
                  </span>
                </div>
                {isSelected && (
                  <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-[var(--accent-mint)]" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---- Output Format ---- */}
      {config.generationMode !== "format_adaptation" && (
        <section className="animate-fade-in space-y-3" style={{ animationDelay: "200ms" }}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("outputFormat")}</h2>
          <div className="flex flex-wrap gap-2">
            {targetFormatOptions.map((fmt) => {
              const isSelected = config.targetFormats.includes(fmt.id);
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => {
                    const current = config.targetFormats;
                    const next = isSelected
                      ? current.filter((f) => f !== fmt.id)
                      : [...current, fmt.id];
                    if (next.length > 0) {
                      updateField("targetFormats", next);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-200",
                    isSelected
                      ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
                      : "border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isSelected ? "bg-[var(--accent-mint)]" : "bg-[var(--text-muted)]"
                    )}
                  />
                  {fmt.label}
                  <span className="text-xs opacity-60">{fmt.description}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-muted)]">{t("formatHelp")}</p>
        </section>
      )}

      {/* ---- CTA per Piece ---- */}
      <section className="animate-fade-in space-y-4" style={{ animationDelay: "300ms" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("ctaPerPiece")}</h2>
          {hasSuggestions && (
            <button
              type="button"
              onClick={handleApplyAllSuggestions}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
            >
              <Sparkles size={14} />
              {t("useAllSuggestions")}
            </button>
          )}
        </div>

        {config.ctaVariants.map((cta, idx) => (
          <div key={idx} className="space-y-2">
            <Label className="text-[11px] text-[var(--text-muted)]">
              {config.generationMode === "format_adaptation"
                ? t("ctaFormat", { format: config.targetFormats[idx] ?? "" })
                : t("ctaPiece", { number: idx + 1 })}
            </Label>
            <Input
              placeholder={t("ctaPlaceholder")}
              value={cta}
              onChange={(e) => {
                const next: [string, string, string] = [...config.ctaVariants] as [string, string, string];
                next[idx] = e.target.value;
                updateField("ctaVariants", next);
              }}
              className={cn(
                "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                "focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]"
              )}
            />
            {ctaSuggestions[idx] && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">{t("suggestion")}:</span>
                <button
                  type="button"
                  onClick={() => handleApplySuggestion(idx, ctaSuggestions[idx]!.value)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    ctaSuggestions[idx]!.confidence === "high"
                      ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)] border border-[var(--accent-mint)]/20 hover:bg-[var(--accent-mint)]/20"
                      : ctaSuggestions[idx]!.confidence === "medium"
                      ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20 hover:bg-[var(--accent-blue)]/20"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)] hover:bg-[var(--surface-base)]"
                  )}
                >
                  <Sparkles size={10} />
                  {ctaSuggestions[idx]!.value}
                </button>
              </div>
            )}
          </div>
        ))}

        {suggestCtas.isPending && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Sparkles size={14} className="animate-pulse" />
            {t("generatingSuggestions")}
          </div>
        )}
      </section>

      {/* ---- Actions ---- */}
      <div className="flex items-center justify-between pt-4 animate-fade-in" style={{ animationDelay: "400ms" }}>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)] active:scale-[0.98]"
        >
          {tCommon("back")}
        </button>
        <button
          type="button"
          onClick={() => onContinue(config)}
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
        >
          {tCommon("continue")}
        </button>
      </div>
    </div>
  );
}
