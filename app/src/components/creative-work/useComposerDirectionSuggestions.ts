"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { CreativeWorkItem, CreativeWorkQuote, CreativeWorkSource } from "@/lib/hooks/use-creative-work";
import type { CreativeDirection, CreativeDirectionPool } from "@/server/creative-work/contracts";
import {
  applySuggestedDirections,
  currentDirectionPool,
  shouldFetchDirectionSuggestions,
  toggleDirectionSelection,
  withManualDirectionInstruction,
} from "./composer-directions";
import { canonicalQuote, type ComposerIntent } from "./composer-state";

type Format = CreativeWorkItem["format"];

export function useComposerDirectionSuggestions({
  intent,
  workId,
  workIdRef,
  draftEpochRef,
  workStatus,
  sources,
  hasPersistedAiSuggestions,
  directionSuggestionRetryToken,
  intentRef,
  formatRef,
  targetFormatsRef,
  directionPoolRef,
  directionTouchedRef,
  directionSuggestionRequestedRef,
  markPlanInputEdited,
  suggestDirections,
  setDirectionPool,
  setQuote,
  setPendingDirectionSuggestions,
  setDirectionSuggestionState,
  setDirectionSuggestionRetryToken,
}: {
  intent: ComposerIntent;
  workId: string | null;
  workIdRef: MutableRefObject<string | null>;
  draftEpochRef: MutableRefObject<number>;
  workStatus: string | undefined;
  sources: readonly Pick<CreativeWorkSource, "status">[];
  hasPersistedAiSuggestions: boolean;
  directionSuggestionRetryToken: number;
  intentRef: MutableRefObject<ComposerIntent>;
  formatRef: MutableRefObject<Format>;
  targetFormatsRef: MutableRefObject<Format[]>;
  directionPoolRef: MutableRefObject<CreativeDirectionPool | null>;
  directionTouchedRef: MutableRefObject<boolean>;
  directionSuggestionRequestedRef: MutableRefObject<string | null>;
  markPlanInputEdited: () => void;
  suggestDirections: (workId: string) => Promise<{ directions: CreativeDirection[] }>;
  setDirectionPool: (value: CreativeDirectionPool | null) => void;
  setQuote: (value: CreativeWorkQuote) => void;
  setPendingDirectionSuggestions: (value: {
    directions: CreativeDirection[];
    preserveSelection: boolean;
  } | null) => void;
  setDirectionSuggestionState: (value: "idle" | "loading" | "ready" | "error") => void;
  setDirectionSuggestionRetryToken: (updater: (value: number) => number) => void;
}) {
  const requestSequenceRef = useRef(0);

  const toggleDirection = useCallback((directionId: string) => {
    if (intentRef.current !== "variations") return;
    const next = toggleDirectionSelection(currentDirectionPool(directionPoolRef.current), directionId);
    if (!next) return;
    directionTouchedRef.current = true;
    markPlanInputEdited();
    directionPoolRef.current = next;
    setDirectionPool(next);
    setQuote(canonicalQuote("variations", formatRef.current, targetFormatsRef.current, next));
  }, [directionPoolRef, directionTouchedRef, formatRef, intentRef, markPlanInputEdited, setDirectionPool, setQuote, targetFormatsRef]);

  const setManualDirectionInstruction = useCallback((manualInstruction: string) => {
    if (intentRef.current !== "variations") return;
    const next = withManualDirectionInstruction(
      currentDirectionPool(directionPoolRef.current),
      manualInstruction,
    );
    directionTouchedRef.current = true;
    markPlanInputEdited();
    directionPoolRef.current = next;
    setDirectionPool(next);
  }, [directionPoolRef, directionTouchedRef, intentRef, markPlanInputEdited, setDirectionPool]);

  const applyDirectionSuggestions = useCallback((suggestions: CreativeDirection[], preserveSelection = true) => {
    const next = applySuggestedDirections(directionPoolRef.current, suggestions, preserveSelection);
    if (!next) return;
    directionPoolRef.current = next;
    markPlanInputEdited();
    setDirectionPool(next);
    setQuote(canonicalQuote("variations", formatRef.current, targetFormatsRef.current, next));
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("ready");
  }, [directionPoolRef, formatRef, markPlanInputEdited, setDirectionPool, setPendingDirectionSuggestions, setDirectionSuggestionState, setQuote, targetFormatsRef]);

  const requestDirectionSuggestions = useCallback(() => {
    requestSequenceRef.current += 1;
    directionSuggestionRequestedRef.current = null;
    setDirectionSuggestionState("idle");
    setDirectionSuggestionRetryToken((value) => value + 1);
  }, [directionSuggestionRequestedRef, setDirectionSuggestionRetryToken, setDirectionSuggestionState]);

  const keepCurrentDirections = useCallback(() => {
    setPendingDirectionSuggestions(null);
    setDirectionSuggestionState("ready");
  }, [setPendingDirectionSuggestions, setDirectionSuggestionState]);

  useEffect(() => {
    const readySource = sources.find((source) => source.status === "ready");
    if (!shouldFetchDirectionSuggestions({
      intent,
      workId,
      hasReadySource: Boolean(readySource),
      workStatus,
      retryToken: directionSuggestionRetryToken,
      hasPersistedAiSuggestions,
      alreadyRequestedForWorkId: directionSuggestionRequestedRef.current,
    })) return;
    if (!workId) return;

    directionSuggestionRequestedRef.current = workId;
    const requestSequence = ++requestSequenceRef.current;
    const draftEpoch = draftEpochRef.current;
    const isCurrentRequest = () => requestSequenceRef.current === requestSequence
      && workIdRef.current === workId
      && draftEpochRef.current === draftEpoch
      && intentRef.current === "variations";
    setDirectionSuggestionState("loading");
    const preserveSelection = directionSuggestionRetryToken > 0;
    void suggestDirections(workId).then((result) => {
      if (!isCurrentRequest()) return;
      if (directionTouchedRef.current) {
        setPendingDirectionSuggestions({ directions: result.directions, preserveSelection });
        setDirectionSuggestionState("ready");
      } else {
        applyDirectionSuggestions(result.directions, preserveSelection);
      }
    }).catch(() => {
      if (isCurrentRequest()) setDirectionSuggestionState("error");
    });
  }, [
    applyDirectionSuggestions,
    directionSuggestionRequestedRef,
    directionSuggestionRetryToken,
    directionTouchedRef,
    draftEpochRef,
    hasPersistedAiSuggestions,
    intent,
    intentRef,
    setDirectionSuggestionState,
    setPendingDirectionSuggestions,
    sources,
    suggestDirections,
    workId,
    workIdRef,
    workStatus,
  ]);

  return {
    toggleDirection,
    setManualDirectionInstruction,
    applyDirectionSuggestions,
    requestDirectionSuggestions,
    keepCurrentDirections,
  };
}
