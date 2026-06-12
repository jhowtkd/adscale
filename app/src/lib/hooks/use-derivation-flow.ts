"use client";

import { useCallback, useState } from "react";
import type { StrategyRecipePrefill } from "@/lib/hooks/use-strategy-recipe";

/** @deprecated Used by art-variation suggestions only; derivation config lives in StrategyRecipePanel. */
export type DerivationIntent =
  | "manual_art"
  | "auto_art"
  | "single_format"
  | "batch_format";

export function useDerivationFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [recipePrefill, setRecipePrefill] = useState<StrategyRecipePrefill | null>(
    null
  );

  const openDerivePanel = useCallback((prefill?: StrategyRecipePrefill | null) => {
    setRecipePrefill(prefill ?? null);
    setSessionKey((session) => session + 1);
    setIsOpen(true);
  }, []);

  const closeFlow = useCallback(() => {
    setIsOpen(false);
    setRecipePrefill(null);
  }, []);

  return {
    isDerivePanelOpen: isOpen,
    derivePanelSession: sessionKey,
    recipePrefill,
    openDerivePanel,
    closeFlow,
    /** @deprecated use isDerivePanelOpen */
    isStrategyRecipeOpen: isOpen,
    /** @deprecated use derivePanelSession */
    strategyRecipeSession: sessionKey,
    /** @deprecated use openDerivePanel */
    openChooser: openDerivePanel,
  };
}
