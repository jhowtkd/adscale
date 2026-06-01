"use client";

import { useEffect, useState } from "react";
import { useCreativeAnalysis } from "@/components/campaigns/useCreativeAnalysis";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";

export type ArtCreativeLevel = "conservative" | "balanced" | "bold" | "extreme";

const CREATIVE_LEVELS: ArtCreativeLevel[] = [
  "conservative",
  "balanced",
  "bold",
  "extreme",
];

function normalizeCreativeLevel(value: string | null | undefined): ArtCreativeLevel {
  if (value && CREATIVE_LEVELS.includes(value as ArtCreativeLevel)) {
    return value as ArtCreativeLevel;
  }
  return "balanced";
}

function padCtas(values: string[]): [string, string, string] {
  return [values[0] ?? "", values[1] ?? "", values[2] ?? ""];
}

interface UseArtVariationSuggestionsInput {
  campaignId: string;
  intent: Extract<DerivationIntent, "manual_art" | "auto_art">;
  open: boolean;
  campaignCreativeLevel?: string | null;
  campaignCtaVariants?: string[] | null;
  suggestedCta?: string;
}

export function useArtVariationSuggestions({
  campaignId,
  intent,
  open,
  campaignCreativeLevel,
  campaignCtaVariants,
  suggestedCta,
}: UseArtVariationSuggestionsInput) {
  const { data: assets } = useCampaignAssets(campaignId);
  const { analyze } = useCreativeAnalysis(campaignId);
  const [creativeLevel, setCreativeLevel] = useState<ArtCreativeLevel>("balanced");
  const [ctas, setCtas] = useState<[string, string, string]>(["", "", ""]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setIsLoadingSuggestions(false);
      return;
    }

    if (initialized) return;

    const baseAsset = assets?.[0];
    const campaignCtas =
      campaignCtaVariants?.map((cta) => cta.trim()).filter(Boolean) ?? [];

    if (intent === "manual_art") {
      const manualCtas =
        campaignCtas.length > 0
          ? campaignCtas
          : suggestedCta?.trim()
            ? [suggestedCta.trim()]
            : [];
      setCreativeLevel(normalizeCreativeLevel(campaignCreativeLevel));
      setCtas(padCtas(manualCtas));
      setInitialized(true);
      return;
    }

    let cancelled = false;

    async function loadAutoSuggestions() {
      setIsLoadingSuggestions(true);

      const fallbackLevel = normalizeCreativeLevel(campaignCreativeLevel);
      const fallbackCtas =
        campaignCtas.length > 0
          ? campaignCtas
          : suggestedCta?.trim()
            ? [suggestedCta.trim()]
            : [];

      if (!baseAsset?.id) {
        if (!cancelled) {
          setCreativeLevel(fallbackLevel);
          setCtas(padCtas(fallbackCtas));
          setIsLoadingSuggestions(false);
          setInitialized(true);
        }
        return;
      }

      try {
        const result = await analyze(baseAsset.id);
        const analysis = result?.analysis;
        const suggestedLevel =
          analysis?.suggestedCreativeLevel?.value ?? fallbackLevel;
        const suggestedCtas =
          analysis?.suggestedCtas?.map((item) => item.value.trim()).filter(Boolean) ??
          fallbackCtas;

        if (!cancelled) {
          setCreativeLevel(normalizeCreativeLevel(suggestedLevel));
          setCtas(padCtas(suggestedCtas));
          setInitialized(true);
        }
      } catch {
        if (!cancelled) {
          setCreativeLevel(fallbackLevel);
          setCtas(padCtas(fallbackCtas));
          setInitialized(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSuggestions(false);
        }
      }
    }

    void loadAutoSuggestions();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    initialized,
    intent,
    assets,
    analyze,
    campaignCreativeLevel,
    campaignCtaVariants,
    suggestedCta,
  ]);

  const updateCta = (index: number, value: string) => {
    setCtas((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });
  };

  const validCtaVariants = ctas.map((cta) => cta.trim()).filter(Boolean);

  return {
    creativeLevel,
    setCreativeLevel,
    ctas,
    updateCta,
    validCtaVariants,
    isLoadingSuggestions,
    canConfirm: validCtaVariants.length > 0 && !isLoadingSuggestions,
  };
}
