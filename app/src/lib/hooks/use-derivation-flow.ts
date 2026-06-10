"use client";

import { useCallback, useState } from "react";

/** @deprecated Used by art-variation suggestions only; derivation config lives in StrategyRecipePanel. */
export type DerivationIntent =
  | "manual_art"
  | "auto_art"
  | "single_format"
  | "batch_format";

export function useDerivationFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const openDerivePanel = useCallback(() => {
    setSessionKey((session) => session + 1);
    setIsOpen(true);
  }, []);

  const closeFlow = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isDerivePanelOpen: isOpen,
    derivePanelSession: sessionKey,
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
