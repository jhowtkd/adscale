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

/** One queued save operation — identity and CAS baseline are captured at
 * enqueue time so a delayed save always lands on the work/output it was
 * written for, with the revision chain of its own session. */
type SaveOperation = {
  workItemId: string;
  outputId: string;
  input: OutputReviewInput;
  baselineRevision: number;
  previous: SaveOperation | null;
  resolvedRevision: number | null;
};

type ChainResult = { op: SaveOperation; draft: OutputReviewDraftV1 | null };

/** Canonical server state for the current draft: the last accepted save, or
 * the persisted reviewDraft the output resumed from. */
type SavedState = { input: OutputReviewInput; draft: OutputReviewDraftV1 };

/** A scheduled-but-not-fired debounce carries its own session: it must
 * still land on the output it was typed for, even after a switch. */
type PendingSession = {
  workItemId: string;
  outputId: string;
  baselineRevision: number;
};

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
  const [referencePending, setReferencePendingState] = useState(false);
  const [reviewed, setReviewed] = useState<{ draft: OutputReviewDraftV1; credits: number } | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(null);

  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimerSessionRef = useRef<PendingSession | null>(null);
  const saveChainRef = useRef<Promise<ChainResult | null>>(Promise.resolve(null));
  const inFlightTailRef = useRef<SaveOperation | null>(null);
  const chainTailRef = useRef<SaveOperation | null>(null);
  const lastSavedRef = useRef<SavedState | null>(
    output.reviewDraft ? { input: draftFromOutput(output), draft: output.reviewDraft } : null,
  );
  const savesQueuedRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const confirmingRef = useRef(false);
  const referencePendingRef = useRef(false);
  const outputIdRef = useRef(output.id);
  const phaseRef = useRef<OutputReviewPhase>("editing");
  const resaveAfterFailureRef = useRef(false);
  const freshSeedRef = useRef<{ targetOutputId: string; from: OutputReviewInput } | null>(null);

  /** Ref mirror updates happen only inside callbacks, never during render. */
  const setReferencePending = useCallback((value: boolean) => {
    referencePendingRef.current = value;
    setReferencePendingState(value);
  }, []);

  const setPhaseSync = useCallback((next: OutputReviewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const enqueueSave = useCallback((input: OutputReviewInput, session?: PendingSession): Promise<OutputReviewDraftV1 | null> => {
    // Session captured here: identity, the draft snapshot AND the CAS
    // baseline. Execution never reads global state, so a queued save keeps
    // its own output and revision chain across output switches.
    const op: SaveOperation = {
      workItemId: session?.workItemId ?? workItemId,
      outputId: session?.outputId ?? outputIdRef.current,
      input: { ...input },
      baselineRevision: session?.baselineRevision ?? lastSavedRef.current?.draft.revision ?? 0,
      previous: chainTailRef.current,
      resolvedRevision: null,
    };
    chainTailRef.current = op;
    savesQueuedRef.current += 1;
    saveGenerationRef.current += 1;
    inFlightTailRef.current = op;
    const ownsCurrentOutput = () => op.outputId === outputIdRef.current;
    if (ownsCurrentOutput()) {
      if (phaseRef.current === "editing") setPhaseSync("saving");
      setSaveState("saving");
    }
    saveChainRef.current = saveChainRef.current
      .then(() => {
        // Same-output ops chain on the previous op's returned revision; an op
        // enqueued after a switch falls back to its own captured baseline.
        const expectedReviewRevision = op.previous && op.previous.outputId === op.outputId
          ? op.previous.resolvedRevision ?? op.previous.baselineRevision
          : op.baselineRevision;
        return saveMutation.mutateAsync({
          workItemId: op.workItemId,
          outputId: op.outputId,
          expectedReviewRevision,
          draft: op.input,
        });
      })
      .then((result) => {
        op.resolvedRevision = result.draft.revision;
        // A save that outlived an output switch must not corrupt the new
        // output's canonical state; its result lives server-side only.
        if (ownsCurrentOutput()) {
          lastSavedRef.current = { input: op.input, draft: result.draft };
          setSaveState("saved");
          // Persisted text equals the visible draft again — no longer dirty.
          if (sameInput(draftRef.current, op.input)) dirtyRef.current = false;
        }
        return { op, draft: result.draft };
      })
      .catch((cause) => {
        if (ownsCurrentOutput()) {
          setError(t("commentSaveError"));
          setSaveState("error");
          if (isConflict(cause)) setError(t("reviewConflict"));
        }
        return { op, draft: null };
      })
      .finally(() => {
        if (inFlightTailRef.current === op) inFlightTailRef.current = null;
        if (chainTailRef.current === op) chainTailRef.current = null;
        savesQueuedRef.current = Math.max(savesQueuedRef.current - 1, 0);
        if (savesQueuedRef.current === 0 && phaseRef.current === "saving" && ownsCurrentOutput()) {
          setPhaseSync("editing");
        }
      });
    return saveChainRef.current.then((result) => result?.draft ?? null);
  }, [saveMutation, setPhaseSync, t, workItemId]);

  /**
   * Waits until the server state corresponds exactly to the current visible
   * draft. Returns that revision, or null when the current draft could not be
   * persisted — never a stale revision of older text.
   */
  const flush = useCallback(async (): Promise<OutputReviewDraftV1 | null> => {
    // Only the current session's pending debounce is flushed now; a timer
    // captured for a previous output still fires and saves its own edit.
    if (saveTimerRef.current && pendingTimerSessionRef.current?.outputId === outputIdRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      pendingTimerSessionRef.current = null;
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
    // Capture the whole session at scheduling: identity AND CAS baseline. The
    // debounce lands the edit on its own output even if the user switches
    // pieces before it fires.
    const scheduledSession: PendingSession = {
      workItemId,
      outputId: outputIdRef.current,
      baselineRevision: lastSavedRef.current?.draft.revision ?? 0,
    };
    const scheduledInput = next;
    pendingTimerSessionRef.current = scheduledSession;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      pendingTimerSessionRef.current = null;
      void enqueueSave(scheduledInput, scheduledSession);
    }, autosaveDelayMs);
  }, [autosaveDelayMs, enqueueSave, setPhaseSync, workItemId]);

  /** Cancels the current session's pending debounce so it can never fire
   * after the plan froze (a later timer must not save a newer revision). */
  const cancelPendingDebounce = useCallback(() => {
    if (saveTimerRef.current && pendingTimerSessionRef.current?.outputId === outputIdRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      pendingTimerSessionRef.current = null;
    }
  }, []);

  const review = useCallback(async () => {
    if (referencePendingRef.current || confirmingRef.current) return;
    if (revisionCreditCost === null) {
      setError(t("reviewUnavailable"));
      return;
    }
    // The fresh-key path also consumes the debounce HERE, before freezing:
    // otherwise confirm could use revision N while the timer still saves N+1.
    cancelPendingDebounce();
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
  }, [cancelPendingDebounce, enqueueSave, flush, revisionCreditCost, setPhaseSync, t]);

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

  /** Marks the currently hydrated draft as spent: the next review mints a
   * fresh server draft (new revision/key) instead of replaying a consumed
   * revision — e.g. retrying a failed child on its base.
   * `from` (the failed child's frozen revisionContext) seeds the new attempt
   * only when the base has no draft of its own; a newer base draft is never
   * overwritten silently. */
  const beginFreshDraftAttempt = useCallback((options?: {
    targetOutputId?: string;
    from?: OutputReviewInput;
  }) => {
    resaveAfterFailureRef.current = true;
    const targetOutputId = options?.targetOutputId ?? outputIdRef.current;
    if (options?.from && targetOutputId === outputIdRef.current && !lastSavedRef.current) {
      const seeded: OutputReviewInput = {
        action: options.from.action,
        targetFormat: options.from.targetFormat,
        instruction: options.from.instruction,
        revisionAssetId: options.from.revisionAssetId,
        annotations: options.from.annotations.map((annotation) => ({ ...annotation })),
      };
      draftRef.current = seeded;
      dirtyRef.current = true;
      setDraft(seeded);
    }
    if (options?.from && targetOutputId !== outputIdRef.current) {
      freshSeedRef.current = { targetOutputId, from: options.from };
    }
  }, []);

  /** True while local edits may not be persisted yet — callers gate piece
   * switching on this plus a successful flush. */
  const hasUnsavedChanges = useCallback(() => dirtyRef.current, []);

  /** Ends the current save session and rehydrates the canonical refs from the
   * given output; callers decide which UI state to reset on top. A pending
   * debounce survives: it belongs to its own captured session. */
  const hydrateRefsFrom = useCallback((source: CreativeWorkOutput) => {
    chainTailRef.current = null;
    dirtyRef.current = false;
    // The new output starts with a clean save indicator; late responses from
    // the previous output are guarded and never touch its state.
    setSaveState(null);
    const next = draftFromOutput(source);
    draftRef.current = next;
    lastSavedRef.current = source.reviewDraft
      ? { input: next, draft: source.reviewDraft }
      : null;
    setDraft(next);
    return next;
  }, []);

  const hydrateFromOutput = useCallback((source: CreativeWorkOutput) => {
    hydrateRefsFrom(source);
    setReviewed(null);
    setPhaseSync("editing");
    setError(null);
  }, [hydrateRefsFrom, setPhaseSync]);

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
  }, [flush, setReferencePending, t, update]);

  // A refetched server draft never overwrites local edits or an in-flight
  // submission; when clean, it rehydrates BOTH the text and the canonical
  // revision (lastSavedRef) so the next review uses the server's CAS.
  useEffect(() => {
    if (output.id !== outputIdRef.current) {
      outputIdRef.current = output.id;
      setPendingOutputId(null);
      hydrateFromOutput(output);
      // A retry-through-review seeding aimed at this output lands right after
      // its hydration: the frozen context becomes the visible (dirty) draft.
      const seed = freshSeedRef.current;
      if (seed && seed.targetOutputId === output.id) {
        freshSeedRef.current = null;
        if (!lastSavedRef.current) {
          const seeded: OutputReviewInput = {
            action: seed.from.action,
            targetFormat: seed.from.targetFormat,
            instruction: seed.from.instruction,
            revisionAssetId: seed.from.revisionAssetId,
            annotations: seed.from.annotations.map((annotation) => ({ ...annotation })),
          };
          draftRef.current = seeded;
          dirtyRef.current = true;
          setDraft(seeded);
        }
      }
      return;
    }
    if (!dirtyRef.current && phaseRef.current === "editing") {
      // Same output: keep any visible error; just realign text + revision.
      hydrateRefsFrom(output);
      setReviewed(null);
    }
  }, [hydrateFromOutput, hydrateRefsFrom, output]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingTimerSessionRef.current = null;
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
    hasUnsavedChanges,
    review,
    edit,
    beginFreshDraftAttempt,
    confirm,
    reloadDraft,
  };
}
