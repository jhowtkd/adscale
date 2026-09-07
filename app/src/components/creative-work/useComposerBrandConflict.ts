"use client";

import { useCallback, type MutableRefObject } from "react";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type {
  CreativeWorkBrandChoice,
  CreativeWorkBrandConflict,
  CreativeWorkItem,
} from "@/lib/hooks/use-creative-work";
import { isCreativeWorkConflict } from "./composer-state";
import type { ComposerRevisionRefresher, ComposerRevisionWriter } from "./composer-revision";

type PreparedPlan = { preparedRevision: string } | null | undefined;

export function useComposerBrandConflict({
  workIdRef,
  brandConflict,
  workflowVariant,
  resolvePending,
  resolveBrandConflictMutation,
  resolveCanonicalWorkRevision,
  setCanonicalWorkRevision,
  refreshCanonicalWorkRevision,
  blockStaleRevision,
  preparePlan,
  confirmGeneration,
  setBrandConflict,
  setAnnouncement,
  setError,
}: {
  workIdRef: MutableRefObject<string | null>;
  brandConflict: CreativeWorkBrandConflict | null;
  workflowVariant: StudioRolloutVariant;
  resolvePending: boolean;
  resolveBrandConflictMutation: {
    mutateAsync: (input: {
      workItemId: string;
      choice: CreativeWorkBrandChoice;
      expectedUpdatedAt: string;
    }) => Promise<{ work: Pick<CreativeWorkItem, "updatedAt"> }>;
  };
  resolveCanonicalWorkRevision: (workId: string) => Promise<string | null>;
  setCanonicalWorkRevision: ComposerRevisionWriter;
  refreshCanonicalWorkRevision: ComposerRevisionRefresher;
  blockStaleRevision: (workId: string) => void;
  preparePlan: () => Promise<PreparedPlan>;
  confirmGeneration: (revision: string) => Promise<unknown>;
  setBrandConflict: (value: null) => void;
  setAnnouncement: (value: string) => void;
  setError: (value: string | null) => void;
}) {
  const resolveBrandConflict = useCallback(async (choice: CreativeWorkBrandChoice) => {
    // Double-click guard: one choice in flight per conflict.
    if (!workIdRef.current || !brandConflict || resolvePending) return;
    const workItemId = workIdRef.current;
    try {
      const expectedUpdatedAt = await resolveCanonicalWorkRevision(workItemId);
      if (!expectedUpdatedAt) throw new Error("Recarregue o trabalho antes de continuar.");
      // The corrected authority is shown through a new prepared plan; only
      // the temporary control wrapper may subsequently confirm generation.
      const result = await resolveBrandConflictMutation.mutateAsync({
        workItemId,
        choice,
        expectedUpdatedAt,
      });
      if (!setCanonicalWorkRevision(workItemId, result.work.updatedAt)) {
        await refreshCanonicalWorkRevision(workItemId);
      }
      setBrandConflict(null);
      setAnnouncement("Escolha de marca salva");
      const plan = await preparePlan();
      if (workflowVariant === "control" && plan) await confirmGeneration(plan.preparedRevision);
    } catch (cause) {
      if (isCreativeWorkConflict(cause)) {
        blockStaleRevision(workItemId);
        try { await refreshCanonicalWorkRevision(workItemId); } catch { /* keep blocked */ }
      }
      setError(cause instanceof Error ? cause.message : "Falha ao salvar escolha de marca");
    }
  }, [
    blockStaleRevision,
    brandConflict,
    confirmGeneration,
    preparePlan,
    refreshCanonicalWorkRevision,
    resolveBrandConflictMutation,
    resolveCanonicalWorkRevision,
    resolvePending,
    setAnnouncement,
    setBrandConflict,
    setCanonicalWorkRevision,
    setError,
    workIdRef,
    workflowVariant,
  ]);

  return { resolveBrandConflict };
}
