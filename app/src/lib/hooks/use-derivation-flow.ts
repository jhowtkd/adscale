"use client";

import { useCallback, useMemo, useState } from "react";

export type DerivationIntent =
  | "manual_art"
  | "auto_art"
  | "single_format"
  | "batch_format";

export type DerivationFlowStep = "strategy_recipe" | "chooser" | DerivationIntent;

export function useDerivationFlow() {
  const [activeStep, setActiveStep] = useState<DerivationFlowStep | null>(null);
  const [strategyRecipeSession, setStrategyRecipeSession] = useState(0);

  const openChooser = useCallback(() => {
    setStrategyRecipeSession((session) => session + 1);
    setActiveStep("strategy_recipe");
  }, []);

  const openLegacyChooser = useCallback(() => {
    setActiveStep("chooser");
  }, []);

  const selectIntent = useCallback((intent: DerivationIntent) => {
    setActiveStep(intent);
  }, []);

  const backToChooser = useCallback(() => {
    setActiveStep("chooser");
  }, []);

  const closeFlow = useCallback(() => {
    setActiveStep(null);
  }, []);

  const isStrategyRecipeOpen = activeStep === "strategy_recipe";
  const isChooserOpen = activeStep === "chooser";
  const isArtConfigOpen =
    activeStep === "manual_art" || activeStep === "auto_art";
  const isFormatConfigOpen =
    activeStep === "single_format" || activeStep === "batch_format";

  const selectedIntent = useMemo((): DerivationIntent | null => {
    if (
      activeStep === null ||
      activeStep === "chooser" ||
      activeStep === "strategy_recipe"
    ) {
      return null;
    }
    return activeStep;
  }, [activeStep]);

  const artConfigIntent = useMemo((): Extract<
    DerivationIntent,
    "manual_art" | "auto_art"
  > | null => {
    if (activeStep === "manual_art" || activeStep === "auto_art") {
      return activeStep;
    }
    return null;
  }, [activeStep]);

  const formatConfigIntent = useMemo((): Extract<
    DerivationIntent,
    "single_format" | "batch_format"
  > | null => {
    if (activeStep === "single_format" || activeStep === "batch_format") {
      return activeStep;
    }
    return null;
  }, [activeStep]);

  return {
    activeStep,
    selectedIntent,
    isStrategyRecipeOpen,
    isChooserOpen,
    isArtConfigOpen,
    isFormatConfigOpen,
    artConfigIntent,
    formatConfigIntent,
    strategyRecipeSession,
    openChooser,
    openLegacyChooser,
    selectIntent,
    backToChooser,
    closeFlow,
  };
}
