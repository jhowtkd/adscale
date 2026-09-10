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

function sameInput(a: OutputReviewInput | null | undefined, b: OutputReviewInput | null | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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

/** One queued save operation — identity is captured at enqueue time so a
 * delayed save always lands on the work/output it was written for. */
type SaveOperation = {
  workItemId: string;
  outputId: string;
  input: OutputReviewInput;
};

type ChainResult = { op: SaveOperation; draft: OutputReviewDraftV1 | null };

/** Canonical server state for the current draft: the last accepted save, or
 * the persisted reviewDraft the output resumed from. */
type SavedState = { input: OutputReviewInput; draft: OutputReviewDraftV1 };

/**
 * One output's review controller: debounced server-saved draft, a frozen
 * review/confirm step, and idempotent resubmission after uncertain network
 * results. Nothing here generates without an explicit confirm, resending
 * always reuses the server-issued revisionKey, and flush() only reports a
 * revision that corresponds exactly to the current visible draft.
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
  const saveChainRef = useRef<Promise<ChainResult | null>>(Promise.resolve(null));
  const inFlightTailRef = useRef<SaveOperation | null>(null);
  const lastSavedRef = useRef<SavedState | null>(
    output.reviewDraft ? { input: draftFromOutput(output), draft: output.reviewDraft } : null,
  );
  const savesQueuedRef = useRef(0);
  const saveGenerationRef = useRef(0);
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

  const enqueueSave = useCallback((input: OutputReviewInput): Promise<OutputReviewDraftV1 | null> => {
    // Identity is frozen here: a save delayed by the chain still targets the
    // work/output the draft belonged to, never whatever is selected later.
    const op: SaveOperation = { workItemId, outputId: outputIdRef.current, input: { ...input } };
    savesQueuedRef.current += 1;
    saveGenerationRef.current += 1;
    inFlightTailRef.current = op;
    if (phaseRef.current === "editing") setPhaseSync("saving");
    setSaveState("saving");
    saveChainRef.current = saveChainRef.current
      .then(() => saveMutation.mutateAsync({
          workItemId: op.workItemId,
          outputId: op.outputId,
          expectedReviewRevision: lastSavedRef.current?.draft.revision ?? 0,
          draft: op.input,
        })
        .then((result) => {
          // A save that outlived an output switch must not corrupt the new
          // output's canonical state; its result lives server-side only.
          if (op.outputId === outputIdRef.current) {
            lastSavedRef.current = { input: op.input, draft: result.draft };
          }
          setSaveState("saved");
          return { op, draft: result.draft };
        }))
      .catch((cause) => {
        setError(t("commentSaveError"));
        setSaveState("error");
        if (isConflict(cause)) setError(t("reviewConflict"));
        return { op, draft: null };
      })
      .finally(() => {
        if (inFlightTailRef.current === op) inFlightTailRef.current = null;
        savesQueuedRef.current = Math.max(savesQueuedRef.current - 1, 0);
        if (savesQueuedRef.current === 0 && phaseRef.current === "saving") setPhaseSync("editing");
      });
    return saveChainRef.current.then((result) => result?.draft ?? null);
  }, [saveMutation, setPhaseSync, t, workItemId]);

  /**
   * Waits until the server state corresponds exactly to the current visible
   * draft. Returns that revision, or null when the current draft could not be
   * persisted — never a stale revision of older text.
   */
  const flush = useCallback(async (): Promise<OutputReviewDraftV1 | null> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (inFlightTailRef.current && sameInput(inFlightTailRef.current.input, draftRef.current)) {
      await saveChainRef.current;
    }
    if (!lastSavedRef.current || !sameInput(lastSavedRef.current.input, draftRef.current)) {
      if (dirtyRef.current) await enqueueSave(draftRef.current);
    }
    return lastSavedRef.current && sameInput(lastSavedRef.current.input, draftRef.current)
      ? lastSavedRef.current.draft
      : null;
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
      void enqueueSave(draftRef.current);
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
    // A terminal submission failure spends its revision/key: retrying means
    // minting a fresh server draft first, even for unchanged text.
    const saved = resaveAfterFailureRef.current ? null : await flush();
    const candidate = saved
      ?? (resaveAfterFailureRef.current ? await enqueueSave(draftRef.current) : null);
    resaveAfterFailureRef.current = false;
    if (startedSaving && phaseRef.current === "saving") setPhaseSync("editing");
    if (!candidate) {
      setError(t("reviewNeedsContent"));
      return;
    }
    const canReview = candidate.action !== "refine"
      || Boolean(candidate.instruction.trim())
      || candidate.annotations.length > 0;
    if (!canReview) {
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
  }, [setPhaseSync]);

  const hydrateFromOutput = useCallback((source: CreativeWorkOutput) => {
    dirtyRef.current = false;
    const next = draftFromOutput(source);
    draftRef.current = next;
    lastSavedRef.current = source.reviewDraft
      ? { input: next, draft: source.reviewDraft }
      : null;
    setDraft(next);
    setReviewed(null);
    setPhaseSync("editing");
    setError(null);
  }, [setPhaseSync]);

  const reloadDraft = useCallback(() => {
    hydrateFromOutput(output);
  }, [hydrateFromOutput, output]);

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
  // submission; switching outputs rehydrates from the new output only cleanly.
  useEffect(() => {
    if (output.id !== outputIdRef.current) {
      outputIdRef.current = output.id;
      setPendingOutputId(null);
      hydrateFromOutput(output);
      return;
    }
    if (!dirtyRef.current && phaseRef.current === "editing") {
      const next = draftFromOutput(output);
      draftRef.current = next;
      setDraft(next);
    }
  }, [hydrateFromOutput, output]);

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
