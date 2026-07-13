"use client";

import { useCallback, useState } from "react";

export type WorkspaceSurfaceState = "setup" | "trabalho";

/**
 * Briefing vs work surface navigation (Phase 6 / item 48).
 * Narrow interface: only stage transitions, no generation/review side effects.
 */
export function useWorkspaceNavigation() {
  const [workspaceState, setWorkspaceState] =
    useState<WorkspaceSurfaceState>("setup");

  const goToSetup = useCallback(() => setWorkspaceState("setup"), []);
  const goToTrabalho = useCallback(() => setWorkspaceState("trabalho"), []);

  return {
    workspaceState,
    setWorkspaceState,
    goToSetup,
    goToTrabalho,
  };
}

/** Auto-promote setup → trabalho once derivations exist. */
export function resolveVisibleWorkspaceState(
  workspaceState: WorkspaceSurfaceState,
  opts: {
    isLoading: boolean;
    isNew: boolean;
    derivationCount: number;
  }
): WorkspaceSurfaceState {
  if (
    !opts.isLoading &&
    !opts.isNew &&
    opts.derivationCount > 0 &&
    workspaceState === "setup"
  ) {
    return "trabalho";
  }
  return workspaceState;
}
