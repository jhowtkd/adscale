"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const HIGHLIGHT_DURATION_MS = 2500;

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
    campaignCtaVariants?.flatMap((cta) => {
      const trimmed = cta.trim();
      return trimmed ? [trimmed] : [];
    }) ?? [];
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

function computeHighlightState(
  initial: { creativeLevel: ArtCreativeLevel; ctas: [string, string, string] },
  next: { creativeLevel: ArtCreativeLevel; ctas: [string, string, string] }
) {
  const ctaIndices = ([0, 1, 2] as const).filter((index) => next.ctas[index] !== initial.ctas[index]);
  return {
    creativeLevel: next.creativeLevel !== initial.creativeLevel,
    ctaIndices,
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
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [aiSuggestionsApplied, setAiSuggestionsApplied] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<{
    creativeLevel: boolean;
    ctaIndices: number[];
  }>({ creativeLevel: false, ctaIndices: [] });

  const sessionId = open ? `${campaignId}:${intent}` : "";
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const sessionBaselineRef = useRef<{
    creativeLevel: ArtCreativeLevel;
    ctas: [string, string, string];
  } | null>(null);

  const campaignCtas = useMemo(
    () =>
      campaignCtaVariants?.flatMap((cta) => {
        const trimmed = cta.trim();
        return trimmed ? [trimmed] : [];
      }) ?? [],
    [campaignCtaVariants]
  );

  const fallbackDefaults = useMemo(
    () =>
      buildManualDefaults(campaignCreativeLevel, campaignCtaVariants, suggestedCta),
    [campaignCreativeLevel, campaignCtaVariants, suggestedCta]
  );

  useEffect(() => {
    if (!open) {
      setLoadedSessionId(null);
      setIsLoadingSuggestions(false);
      setSuggestionsError(null);
      setAiSuggestionsApplied(false);
      setHighlightedFields({ creativeLevel: false, ctaIndices: [] });
      sessionBaselineRef.current = null;
      return;
    }

    if (loadedSessionId === sessionId) {
      return;
    }

    setLoadedSessionId(sessionId);
    setSuggestionsError(null);
    setAiSuggestionsApplied(false);
    setHighlightedFields({ creativeLevel: false, ctaIndices: [] });
    sessionBaselineRef.current = {
      creativeLevel: fallbackDefaults.creativeLevel,
      ctas: fallbackDefaults.ctas,
    };
    setCreativeLevel(fallbackDefaults.creativeLevel);
    setCtas(fallbackDefaults.ctas);
    setIsLoadingSuggestions(intent === "auto_art");
  }, [open, sessionId, loadedSessionId, intent, fallbackDefaults]);

  const applyDefaults = useCallback(() => {
    setCreativeLevel(fallbackDefaults.creativeLevel);
    setCtas(fallbackDefaults.ctas);
    setAiSuggestionsApplied(false);
    setHighlightedFields({ creativeLevel: false, ctaIndices: [] });
  }, [fallbackDefaults]);

  const retrySuggestions = useCallback(() => {
    if (intent !== "auto_art" || !open) {
      return;
    }
    setSuggestionsError(null);
    setAiSuggestionsApplied(false);
    setHighlightedFields({ creativeLevel: false, ctaIndices: [] });
    sessionBaselineRef.current = {
      creativeLevel: fallbackDefaults.creativeLevel,
      ctas: fallbackDefaults.ctas,
    };
    setCreativeLevel(fallbackDefaults.creativeLevel);
    setCtas(fallbackDefaults.ctas);
    setIsLoadingSuggestions(true);
  }, [intent, open, fallbackDefaults]);

  useEffect(() => {
    if (!open || intent !== "auto_art" || loadedSessionId !== sessionId || !isLoadingSuggestions) {
      return;
    }

    const baseline = sessionBaselineRef.current ?? fallbackDefaults;
    const baseAsset = assets?.[0];
    let cancelled = false;

    async function loadAutoSuggestions() {
      if (!baseAsset?.id) {
        if (!cancelled) {
          applyDefaults();
          setIsLoadingSuggestions(false);
        }
        return;
      }

      try {
        const result = await analyze(baseAsset.id);
        if (!cancelled && result?.status === "failed") {
          applyDefaults();
          setSuggestionsError(result.message ?? "failed");
          setIsLoadingSuggestions(false);
          return;
        }

        const analysis = result?.analysis;
        const suggestedLevel =
          analysis?.suggestedCreativeLevel?.value ?? fallbackDefaults.creativeLevel;
        const suggestedCtas =
          analysis?.suggestedCtas?.flatMap((item) => {
            const trimmed = item.value.trim();
            return trimmed ? [trimmed] : [];
          }) ?? campaignCtas;

        const nextLevel = normalizeCreativeLevel(suggestedLevel);
        const nextCtas = padCtas(suggestedCtas.length > 0 ? suggestedCtas : campaignCtas);

        if (!cancelled) {
          setCreativeLevel(nextLevel);
          setCtas(nextCtas);
          setSuggestionsError(null);
          setAiSuggestionsApplied(true);
          setHighlightedFields(computeHighlightState(baseline, { creativeLevel: nextLevel, ctas: nextCtas }));
        }
      } catch (error) {
        if (!cancelled) {
          applyDefaults();
          setSuggestionsError(error instanceof Error ? error.message : "failed");
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
    applyDefaults,
  ]);

  useEffect(() => {
    const hasHighlights =
      highlightedFields.creativeLevel || highlightedFields.ctaIndices.length > 0;
    if (!hasHighlights) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedFields({ creativeLevel: false, ctaIndices: [] });
    }, HIGHLIGHT_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedFields]);

  const updateCta = (index: number, value: string) => {
    setCtas((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });
  };

  const validCtaVariants = useMemo(
    () =>
      ctas.flatMap((cta) => {
        const trimmed = cta.trim();
        return trimmed ? [trimmed] : [];
      }),
    [ctas]
  );

  return {
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
    canConfirm: validCtaVariants.length > 0 && !isLoadingSuggestions,
  };
}
