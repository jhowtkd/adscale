"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { isApiRequestUncertain } from "@/lib/api-client";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import {
  creativeWorkKey,
  useGenerateReviewedRevision,
  useSaveOutputReview,
  type CreativeWorkOutput,
} from "@/lib/hooks/use-creative-work";
import type { OutputReviewDraftV1, OutputReviewInput } from "@/server/creative-work/output-review";

export type OutputReviewPhase = "editing" | "saving" | "reviewing" | "submitting" | "reconciling";

export type OutputRevisionContext = OutputReviewInput & {
  version: 1;
  reviewRevision: number;
  sourceOutputId: string;
  sourceOutputVersion: number;
};

export type { OutputReviewDraftV1, OutputReviewInput };

function emptyDraft(targetFormat: CreativeWorkOutput["targetFormat"]): OutputReviewInput {
  return { action: "refine", targetFormat, instruction: "", revisionAssetId: null, annotations: [] };
}

function draftFromOutput(output: CreativeWorkOutput): OutputReviewInput {
  const base = emptyDraft(output.targetFormat);
  const saved = output.reviewDraft;
  if (!saved) return base;
  return {
    action: saved.action,
    targetFormat: saved.targetFormat,
    instruction: saved.instruction,
    revisionAssetId: saved.revisionAssetId,
    annotations: saved.annotations.map((annotation) => ({ ...annotation })),
  };
}

function isConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as Error & { status?: unknown }).status === 409;
}

function statusOf(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const status = (error as Error & { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * One output's review controller: debounced server-saved draft, a frozen
 * review/confirm step, and idempotent resubmission after uncertain network
 * results. Nothing here generates without an explicit confirm, and resending
 * always reuses the server-issued revisionKey.
 */
export function useOutputReview({
  workItemId,
  output,
  revisionCreditCost,
  autosaveDelayMs = 500,
}: {
  workItemId: string;
  output: CreativeWorkOutput;
  revisionCreditCost: number | null;
  autosaveDelayMs?: number;
}) {
  const t = useTranslations("dashboard.home.composer.results");
  const queryClient = useQueryClient();
  const saveMutation = useSaveOutputReview();
  const generateMutation = useGenerateReviewedRevision();

  const [draft, setDraft] = useState<OutputReviewInput>(() => draftFromOutput(output));
  const [phase, setPhase] = useState<OutputReviewPhase>("editing");
  const [error, setError] = useState<string | null>(null);
  const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);
  const [referencePending, setReferencePending] = useState(false);
  const [reviewed, setReviewed] = useState<{ draft: OutputReviewDraftV1; credits: number } | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<OutputReviewDraftV1 | null>>(Promise.resolve(null));
  const savesQueuedRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const lastRevisionRef = useRef<OutputReviewDraftV1 | null>(null);
  const confirmingRef = useRef(false);
  const referencePendingRef = useRef(false);
  referencePendingRef.current = referencePending;
  const outputIdRef = useRef(output.id);
  const phaseRef = useRef<OutputReviewPhase>("editing");
  const resaveAfterFailureRef = useRef(false);

  const setPhaseSync = useCallback((next: OutputReviewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const runSave = useCallback((input: OutputReviewInput, expectedReviewRevision: number) =>
    saveMutation.mutateAsync({ workItemId, outputId: outputIdRef.current, expectedReviewRevision, draft: input })
      .then((result) => {
        lastRevisionRef.current = result.draft;
        return result.draft;
      }), [saveMutation, workItemId]);

  const enqueueSave = useCallback((input: OutputReviewInput) => {
    savesQueuedRef.current += 1;
    saveGenerationRef.current += 1;
    if (phaseRef.current === "editing") setPhaseSync("saving");
    setSaveState("saving");
    saveChainRef.current = saveChainRef.current
      .then(() => runSave(input, lastRevisionRef.current?.revision ?? 0))
      .then((savedDraft) => {
        setSaveState("saved");
        return savedDraft;
      })
      .catch((cause) => {
        setError(t("commentSaveError"));
        setSaveState("error");
        if (isConflict(cause)) setError(t("reviewConflict"));
        return null;
      })
      .finally(() => {
        savesQueuedRef.current = Math.max(savesQueuedRef.current - 1, 0);
        if (savesQueuedRef.current === 0 && phaseRef.current === "saving") setPhaseSync("editing");
      });
    return saveChainRef.current;
  }, [runSave, setPhaseSync, t]);

  const flush = useCallback(async (): Promise<OutputReviewDraftV1 | null> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      enqueueSave(draftRef.current);
    }
    return saveChainRef.current;
  }, [enqueueSave]);

  const update = useCallback((patch: Partial<OutputReviewInput>) => {
    dirtyRef.current = true;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (phaseRef.current === "reviewing") {
      setReviewed(null);
      setPhaseSync("editing");
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      enqueueSave(draftRef.current);
    }, autosaveDelayMs);
  }, [autosaveDelayMs, enqueueSave, setPhaseSync]);

  const review = useCallback(async () => {
    if (referencePendingRef.current || confirmingRef.current) return;
    if (revisionCreditCost === null) {
      setError(t("reviewUnavailable"));
      return;
    }
    const startedSaving = phaseRef.current === "editing" || phaseRef.current === "saving";
    if (startedSaving) setPhaseSync("saving");
    const generationBefore = saveGenerationRef.current;
    const saved = await flush();
    const freshSave = saveGenerationRef.current !== generationBefore;
    if (startedSaving && phaseRef.current === "saving") setPhaseSync("editing");
    // A terminal submission failure spends its revision/key: retrying means
    // minting a fresh server draft first.
    const candidate = freshSave
      ? saved
      : resaveAfterFailureRef.current
        ? await enqueueSave(draftRef.current)
        : lastRevisionRef.current;
    resaveAfterFailureRef.current = false;
    const input = candidate
      ? {
          action: candidate.action,
          targetFormat: candidate.targetFormat,
          instruction: candidate.instruction,
          revisionAssetId: candidate.revisionAssetId,
          annotations: candidate.annotations,
        }
      : draftRef.current;
    const canReview = input.action !== "refine" || Boolean(input.instruction.trim()) || input.annotations.length > 0;
    if (!canReview || !candidate) {
      setError(t("reviewNeedsContent"));
      return;
    }
    setError(null);
    setReviewed({ draft: candidate, credits: revisionCreditCost });
    setPhaseSync("reviewing");
  }, [enqueueSave, flush, revisionCreditCost, setPhaseSync, t]);

  const reconcile = useCallback(async (frozen: { draft: OutputReviewDraftV1 }) => {
    setPhaseSync("reconciling");
    try {
      await queryClient.refetchQueries({ queryKey: creativeWorkKey(workItemId), type: "all", exact: true });
    } catch {
      // Reconciliation reads whatever the cache holds afterwards.
    }
    const detail = queryClient.getQueryData<{ outputs?: CreativeWorkOutput[] }>(creativeWorkKey(workItemId));
    const child = detail?.outputs?.find((candidate) =>
      candidate.parentOutputId === outputIdRef.current
      && candidate.revisionContext?.sourceOutputId === outputIdRef.current
      && candidate.revisionContext.reviewRevision === frozen.draft.revision);
    if (child) {
      setPendingOutputId(child.id);
      setReviewed(null);
      setError(null);
    } else {
      setError(t("reviewSubmitUnknown"));
    }
    setPhaseSync("editing");
  }, [queryClient, setPhaseSync, t, workItemId]);

  const confirm = useCallback(async () => {
    if (confirmingRef.current || !reviewed) return;
    confirmingRef.current = true;
    setPhaseSync("submitting");
    setError(null);
    const frozen = reviewed;
    try {
      const result = await generateMutation.mutateAsync({
        workItemId,
        outputId: outputIdRef.current,
        reviewRevision: frozen.draft.revision,
        revisionKey: frozen.draft.revisionKey,
        expectedCredits: frozen.credits,
      });
      setPendingOutputId(result.output.id);
      setReviewed(null);
      setPhaseSync("editing");
    } catch (cause) {
      if (isApiRequestUncertain(cause)) {
        await reconcile(frozen);
      } else if (isConflict(cause) || statusOf(cause) === 409) {
        setReviewed(null);
        setPhaseSync("editing");
        setError(t("reviewConflict"));
      } else if (statusOf(cause) === 402) {
        // Nothing was dispatched; keep the plan so the same revisionKey can
        // confirm once credits are available.
        setPhaseSync("editing");
        setError(t("reviewPaymentNeeded"));
      } else {
        // Terminal dispatch failure: replay would return the same failed
        // child, so require a deliberate fresh draft/key.
        setReviewed(null);
        resaveAfterFailureRef.current = true;
        setPhaseSync("editing");
        setError(cause instanceof Error && cause.message ? cause.message : t("reviewSubmitFailed"));
      }
    } finally {
      confirmingRef.current = false;
    }
  }, [generateMutation, reconcile, reviewed, setPhaseSync, t, workItemId]);

  const edit = useCallback(() => {
    setReviewed(null);
    setPhaseSync("editing");
  }, []);

  const reloadDraft = useCallback(() => {
    dirtyRef.current = false;
    const next = draftFromOutput(output);
    draftRef.current = next;
    setDraft(next);
    setReviewed(null);
    setPhaseSync("editing");
    setError(null);
  }, [output, setPhaseSync]);

  const attachReference = useCallback(async (file: File) => {
    setReferencePending(true);
    setError(null);
    try {
      const uploaded = await uploadChatAttachment(file);
      update({ revisionAssetId: uploaded.assetId });
      await flush();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("reviewSubmitFailed"));
    } finally {
      setReferencePending(false);
    }
  }, [flush, t, update]);

  // A refetched server draft never overwrites local edits or an in-flight
  // submission; switching outputs hydrates from the new output only cleanly.
  useEffect(() => {
    if (output.id !== outputIdRef.current) {
      outputIdRef.current = output.id;
      lastRevisionRef.current = null;
      setPendingOutputId(null);
      setReviewed(null);
      setError(null);
      dirtyRef.current = false;
      const next = draftFromOutput(output);
      draftRef.current = next;
      setDraft(next);
      setPhaseSync("editing");
      return;
    }
    if (!dirtyRef.current && phaseRef.current === "editing") {
      const next = draftFromOutput(output);
      draftRef.current = next;
      setDraft(next);
    }
  }, [output, setPhaseSync]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const isBusy = useMemo(() => phase === "submitting" || phase === "reconciling", [phase]);

  return {
    draft,
    phase,
    error,
    pendingOutputId,
    referencePending,
    isBusy,
    saving: saveMutation.isPending || phase === "saving",
    saveState,
    update,
    attachReference,
    flush,
    review,
    edit,
    confirm,
    reloadDraft,
  };
}
