"use client";

import { useEffect, useMemo, useState } from "react";
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

function buildManualDefaults(
  campaignCreativeLevel: string | null | undefined,
  campaignCtaVariants: string[] | null | undefined,
  suggestedCta?: string
) {
  const campaignCtas =
    campaignCtaVariants?.map((cta) => cta.trim()).filter(Boolean) ?? [];
  const manualCtas =
    campaignCtas.length > 0
      ? campaignCtas
      : suggestedCta?.trim()
        ? [suggestedCta.trim()]
        : [];

  return {
    creativeLevel: normalizeCreativeLevel(campaignCreativeLevel),
    ctas: padCtas(manualCtas),
  };
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

  const sessionId = open ? `${campaignId}:${intent}` : "";
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);

  const campaignCtas = useMemo(
    () => campaignCtaVariants?.map((cta) => cta.trim()).filter(Boolean) ?? [],
    [campaignCtaVariants]
  );

  const fallbackDefaults = useMemo(
    () =>
      buildManualDefaults(campaignCreativeLevel, campaignCtaVariants, suggestedCta),
    [campaignCreativeLevel, campaignCtaVariants, suggestedCta]
  );

  if (!open && loadedSessionId !== null) {
    setLoadedSessionId(null);
    setIsLoadingSuggestions(false);
  }

  if (open && intent === "manual_art" && loadedSessionId !== sessionId) {
    setLoadedSessionId(sessionId);
    setCreativeLevel(fallbackDefaults.creativeLevel);
    setCtas(fallbackDefaults.ctas);
    setIsLoadingSuggestions(false);
  }

  if (open && intent === "auto_art" && loadedSessionId !== sessionId) {
    setLoadedSessionId(sessionId);
    setCreativeLevel(fallbackDefaults.creativeLevel);
    setCtas(fallbackDefaults.ctas);
    setIsLoadingSuggestions(true);
  }

  useEffect(() => {
    if (!open || intent !== "auto_art" || loadedSessionId !== sessionId) {
      return;
    }

    if (!isLoadingSuggestions) {
      return;
    }

    const baseAsset = assets?.[0];
    let cancelled = false;

    async function loadAutoSuggestions() {
      if (!baseAsset?.id) {
        if (!cancelled) {
          setIsLoadingSuggestions(false);
        }
        return;
      }

      try {
        const result = await analyze(baseAsset.id);
        const analysis = result?.analysis;
        const suggestedLevel =
          analysis?.suggestedCreativeLevel?.value ?? fallbackDefaults.creativeLevel;
        const suggestedCtas =
          analysis?.suggestedCtas
            ?.map((item) => item.value.trim())
            .filter(Boolean) ?? campaignCtas;

        if (!cancelled) {
          setCreativeLevel(normalizeCreativeLevel(suggestedLevel));
          setCtas(padCtas(suggestedCtas.length > 0 ? suggestedCtas : campaignCtas));
        }
      } catch {
        if (!cancelled) {
          setCreativeLevel(fallbackDefaults.creativeLevel);
          setCtas(fallbackDefaults.ctas);
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
    intent,
    sessionId,
    loadedSessionId,
    isLoadingSuggestions,
    assets,
    analyze,
    campaignCtas,
    fallbackDefaults,
  ]);

  const updateCta = (index: number, value: string) => {
    setCtas((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });
  };

  const validCtaVariants = ctas
    .map((cta) => cta.trim())
    .flatMap((cta) => (cta ? [cta] : []));

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
