"use client";

import { useCallback, type MutableRefObject } from "react";
import type { CreativeWorkBriefingField, CreativeWorkBriefingOverrides, CreativeWorkFactPack, InferredBriefing } from "@/server/creative-work/contracts";
import type { ComposerIntent } from "./composer-state";

export function useComposerBriefing({
  workIdRef,
  intentRef,
  briefingOverridesRef,
  briefingVersionRef,
  inferredBriefing,
  currentWork,
  editBriefingMutation,
  markPlanInputEdited,
  setBriefingEditState,
  setInferredBriefingContext,
  setAnnouncement,
  setError,
}: {
  workIdRef: MutableRefObject<string | null>;
  intentRef: MutableRefObject<ComposerIntent>;
  briefingOverridesRef: MutableRefObject<CreativeWorkBriefingOverrides | undefined>;
  briefingVersionRef: MutableRefObject<number | undefined>;
  inferredBriefing: InferredBriefing | null;
  currentWork?: { id: string; status: string; updatedAt: Date | string } | null;
  editBriefingMutation: {
    mutateAsync: (input: {
      workItemId: string;
      field: CreativeWorkBriefingField;
      value: string | null;
      expectedUpdatedAt: string;
    }) => Promise<{
      briefingOverrides: CreativeWorkBriefingOverrides;
      briefingVersion: number;
      briefing: InferredBriefing;
      briefingFactPack: CreativeWorkFactPack;
    }>;
  };
  markPlanInputEdited: () => void;
  setBriefingEditState: (state: "idle" | "saving" | "saved" | "error") => void;
  setInferredBriefingContext: (value: { briefing: InferredBriefing; factPack: CreativeWorkFactPack } | null) => void;
  setAnnouncement: (value: string) => void;
  setError: (value: string | null) => void;
}) {
  const editBriefingField = useCallback(async (field: CreativeWorkBriefingField, value: string) => {
    const id = workIdRef.current;
    if (!id || !currentWork || currentWork.status !== "draft" || intentRef.current !== "single" || !inferredBriefing) return;
    markPlanInputEdited();
    setBriefingEditState("saving");
    setError(null);
    try {
      const edited = await editBriefingMutation.mutateAsync({
        workItemId: id,
        field,
        value: value.trim() || null,
        expectedUpdatedAt: new Date(currentWork.updatedAt).toISOString(),
      });
      briefingOverridesRef.current = edited.briefingOverrides;
      briefingVersionRef.current = edited.briefingVersion;
      setInferredBriefingContext({ briefing: edited.briefing, factPack: edited.briefingFactPack });
      setBriefingEditState("saved");
      setAnnouncement("Briefing salvo");
    } catch (cause) {
      setBriefingEditState("error");
      setError(cause instanceof Error ? cause.message : "Falha ao salvar o briefing");
    }
  }, [
    briefingOverridesRef,
    briefingVersionRef,
    currentWork,
    editBriefingMutation,
    inferredBriefing,
    intentRef,
    markPlanInputEdited,
    setAnnouncement,
    setBriefingEditState,
    setError,
    setInferredBriefingContext,
    workIdRef,
  ]);

  return { editBriefingField };
}
