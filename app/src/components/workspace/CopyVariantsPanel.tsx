"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCopyVariants,
  useGenerateCopyVariants,
  useSelectCopyVariant,
} from "@/lib/hooks/use-copy-variants";

interface CopyVariantsPanelProps {
  derivationId: string;
}

const TONE_COLORS: Record<string, string> = {
  urgent: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  emotional: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  factual: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  social_proof: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  curiosity: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function CopyVariantsPanel({ derivationId }: CopyVariantsPanelProps) {
  const t = useTranslations("copyGenerator");
  const { data, isLoading } = useCopyVariants(derivationId);
  const generate = useGenerateCopyVariants(derivationId);
  const select = useSelectCopyVariant(derivationId);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generate.mutateAsync({ count: 5 });
    } finally {
      setIsGenerating(false);
    }
  };

  const variants = data?.variants ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          {t("title")}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating || generate.isPending}
          className="h-7 text-xs"
        >
          <Sparkles size={12} className="mr-1.5" />
          {isGenerating ? t("generating") : t("generate")}
        </Button>
      </div>

      {variants.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-4 text-center">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              onClick={() => select.mutate({ variantId: variant.id, isSelected: !variant.isSelected })}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                variant.isSelected
                  ? "border-[var(--accent-mint)] bg-[var(--accent-mint)]/5"
                  : "border-[var(--border-dim)] hover:border-[var(--border-medium)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {variant.headline}
                  </p>
                  {variant.ctaText && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      CTA: {variant.ctaText}
                    </p>
                  )}
                </div>
                {variant.isSelected && (
                  <Check size={16} className="text-[var(--accent-mint)] shrink-0 mt-0.5" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {variant.toneLabel && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      TONE_COLORS[variant.toneLabel] ?? "bg-[var(--surface-base)] text-[var(--text-muted)] border-[var(--border-dim)]"
                    }`}
                  >
                    {variant.toneLabel}
                  </span>
                )}
                {variant.confidenceScore != null && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {variant.confidenceScore}% confiança
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
