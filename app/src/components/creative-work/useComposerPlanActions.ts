"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import { isApiRequestUncertain } from "@/lib/api-client";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import {
  extractCreativeWorkBrandConflict,
  extractCreativeWorkBriefingBlocked,
  type CreativeWorkBrandConflict,
  type CreativeWorkDraftItem,
  type CreativeWorkDetail,
  type CreativeWorkItem,
  type CreativeWorkQuote,
} from "@/lib/hooks/use-creative-work";
import type { CreativeWorkFactPack, InferredBriefing } from "@/server/creative-work/contracts";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";
import { isComposerPlanStale, pendingAnalysisBlocksPrepare, restylePairMissing, shouldSkipPrepare } from "./composer-prepare";
import {
  confirmGenerationDecision,
  generationLooksAccepted,
  runGuardedSubmit,
} from "./composer-submit";
import {
  signature,
  snapshotFromWork,
  type ComposerActionPhase,
  type ComposerIntent,
  type DraftSnapshot,
} from "./composer-state";

type PreparedPlanInput = { revision: string; signature: string };

type PrepareResult = {
  work: CreativeWorkDraftItem;
  quote?: CreativeWorkQuote;
  preparedPlan?: PreparedPlanProjectionV1;
  preparedRevision?: string;
  briefing?: InferredBriefing;
  briefingFactPack?: CreativeWorkFactPack;
};

type GenerateResult = {
  brandTrainingSuggestion?: string | null;
};

export function useComposerPlanActions({
  workIdRef,
  intentRef,
  requestRef,
  submitGuardRef,
  preparedPlanInputRef,
  setPreparedPlanInput,
  planInputEditEpochRef,
  lastPersistedRef,
  detailQuery,
  invalidatedPlanRevision,
  captureSnapshot,
  flushAutosave,
  prepareMutation,
  generateMutation,
  setCanonicalWorkRevision,
  setActionPhase,
  setError,
  setBrandConflict,
  setBrandTrainingSuggestion,
  setAnnouncement,
  setInferredBriefingContext,
  setFormat,
  formatRef,
  setQuote,
  setPreparedPlanCycle,
  recordCanonicalEvent,
  recordStudioEvent,
  tHome,
  studioSessionId,
  workflowVariant,
  submissionBlocked,
  onGenerationAccepted,
}: {
  workIdRef: RefObject<string | null>;
  intentRef: MutableRefObject<ComposerIntent>;
  requestRef: MutableRefObject<string>;
  submitGuardRef: MutableRefObject<boolean>;
  preparedPlanInputRef: MutableRefObject<PreparedPlanInput | null>;
  setPreparedPlanInput: (value: PreparedPlanInput | null) => void;
  planInputEditEpochRef: MutableRefObject<number>;
  lastPersistedRef: MutableRefObject<string | null>;
  detailQuery: {
    data?: CreativeWorkDetail;
    refetch: () => Promise<{ data?: CreativeWorkDetail }>;
  };
  invalidatedPlanRevision: string | null;
  captureSnapshot: () => DraftSnapshot;
  flushAutosave: () => Promise<string | null>;
  prepareMutation: { mutateAsync: (input: { workItemId: string }) => Promise<PrepareResult> };
  generateMutation: {
    mutateAsync: (input: {
      workItemId: string;
      preparedRevision: string;
      studioSessionId?: string;
      rolloutVariant?: StudioRolloutVariant;
    }) => Promise<GenerateResult>;
  };
  setCanonicalWorkRevision: (workId: string, updatedAt: Date | string) => unknown;
  setActionPhase: (value: ComposerActionPhase) => void;
  setError: (value: string | null) => void;
  setBrandConflict: (value: CreativeWorkBrandConflict | null) => void;
  setBrandTrainingSuggestion: (value: string | null) => void;
  setAnnouncement: (value: string) => void;
  setInferredBriefingContext: (value: { briefing: InferredBriefing; factPack: CreativeWorkFactPack } | null) => void;
  setFormat: (value: CreativeWorkDetail["work"]["format"]) => void;
  formatRef: MutableRefObject<CreativeWorkDetail["work"]["format"]>;
  setQuote: (value: CreativeWorkQuote) => void;
  setPreparedPlanCycle: (updater: (cycle: number) => number) => void;
  recordCanonicalEvent: (
    name: string,
    workId: string,
    payload?: Record<string, string | number | boolean>,
  ) => void;
  recordStudioEvent: (name: string, payload?: Record<string, string | number | boolean>) => void;
  tHome: (key: "restylePairError") => string;
  studioSessionId?: string;
  workflowVariant: StudioRolloutVariant;
  submissionBlocked: () => boolean;
  onGenerationAccepted?: () => void;
}) {
  const preparePlanCommand = useCallback(async (): Promise<PreparedPlanProjectionV1 | null> => {
    const current = detailQuery.data?.work;
    const currentPlan = detailQuery.data?.preparedPlan ?? null;
    const preparedInput = currentPlan && preparedPlanInputRef.current?.revision === currentPlan.preparedRevision
      ? preparedPlanInputRef.current
      : null;
    const planIsStale = isComposerPlanStale({
      currentPlanRevision: currentPlan?.preparedRevision ?? null,
      invalidatedPlanRevision,
      preparedSignature: preparedInput?.signature ?? null,
      currentSignature: signature(captureSnapshot()),
    });
    if (shouldSkipPrepare({
      status: current?.status,
      outputCount: detailQuery.data?.outputs.length ?? 0,
      planIsStale,
    })) return currentPlan;
    if (pendingAnalysisBlocksPrepare(detailQuery.data?.sources ?? [])) {
      setError("Aguarde a análise da arte terminar antes de gerar.");
      return null;
    }
    if (restylePairMissing({
      intent: intentRef.current,
      request: requestRef.current,
      sources: detailQuery.data?.sources ?? [],
    })) {
      setError(tHome("restylePairError"));
      return null;
    }
    setActionPhase("saving");
    const prepareEditEpoch = planInputEditEpochRef.current;
    setError(null);
    setBrandConflict(null);
    try {
      const id = await flushAutosave();
      if (!id) {
        setError("Não foi possível criar o rascunho. Confirme a marca e tente de novo.");
        return null;
      }
      const pendingSources = pendingAnalysisBlocksPrepare(detailQuery.data?.sources ?? []);
      if (pendingSources) {
        setError("Aguarde a análise da arte terminar antes de gerar.");
        return null;
      }
      setActionPhase("preparing");
      const prepared = await prepareMutation.mutateAsync({ workItemId: id });
      if (prepared.briefing && prepared.briefingFactPack) {
        setInferredBriefingContext({ briefing: prepared.briefing, factPack: prepared.briefingFactPack });
      }
      lastPersistedRef.current = signature(snapshotFromWork(prepared.work));
      setCanonicalWorkRevision(prepared.work.id, prepared.work.updatedAt);
      if (prepared.quote) setQuote(prepared.quote);
      formatRef.current = prepared.work.format;
      setFormat(prepared.work.format);
      const preparedRevision = prepared.preparedPlan?.preparedRevision ?? prepared.preparedRevision;
      if (!preparedRevision) throw new Error("Preparação sem revisão");
      setPreparedPlanInput({
        revision: preparedRevision,
        signature: prepareEditEpoch === planInputEditEpochRef.current
          ? signature(captureSnapshot())
          : `stale:${prepareEditEpoch}`,
      });
      recordCanonicalEvent("briefing_ready", id, { protocol: prepared.preparedPlan?.protocol ?? "carousel" });
      return prepared.preparedPlan
        ?? await detailQuery.refetch().then((refetched) => refetched.data?.preparedPlan ?? null);
    } catch (cause) {
      const conflict = extractCreativeWorkBrandConflict(cause);
      if (conflict) setBrandConflict(conflict);
      else {
        const blocked = extractCreativeWorkBriefingBlocked(cause);
        if (blocked) setInferredBriefingContext({ briefing: blocked.briefing, factPack: blocked.factPack });
        setError(cause instanceof Error ? cause.message : "Falha ao preparar plano");
      }
      return null;
    } finally {
      setActionPhase("idle");
    }
  }, [
    captureSnapshot,
    detailQuery,
    flushAutosave,
    formatRef,
    intentRef,
    invalidatedPlanRevision,
    lastPersistedRef,
    planInputEditEpochRef,
    prepareMutation,
    preparedPlanInputRef,
    setPreparedPlanInput,
    recordCanonicalEvent,
    requestRef,
    setActionPhase,
    setBrandConflict,
    setCanonicalWorkRevision,
    setError,
    setFormat,
    setInferredBriefingContext,
    setQuote,
    tHome,
  ]);

  const confirmGenerationCommand = useCallback(async (preparedRevision?: string): Promise<void> => {
    const current = detailQuery.data?.work;
    const id = current?.id ?? workIdRef.current;
    const revision = preparedRevision ?? detailQuery.data?.preparedPlan?.preparedRevision;
    const preparedInput = preparedPlanInputRef.current;
    const decision = confirmGenerationDecision({
      workId: id,
      preparedRevision: revision,
      preparedSignature: preparedInput && preparedInput.revision === revision
        ? preparedInput.signature
        : null,
      currentSignature: signature(captureSnapshot()),
      status: current?.status,
      outputCount: detailQuery.data?.outputs.length ?? 0,
    });
    if (decision === "revise") {
      setError("Revise o plano antes de gerar.");
      return;
    }
    if (decision === "skip" || !id || !revision) return;
    setActionPhase("submitting");
    setError(null);
    try {
      const generated = await generateMutation.mutateAsync({
        workItemId: id,
        preparedRevision: revision,
        ...(studioSessionId ? { studioSessionId } : {}),
        rolloutVariant: workflowVariant,
      });
      setBrandConflict(null);
      setBrandTrainingSuggestion(generated.brandTrainingSuggestion ?? null);
      setAnnouncement("Geração iniciada");
      recordStudioEvent("studio_plan_confirmed", { creativeWorkId: id });
      onGenerationAccepted?.();
    } catch (cause) {
      if (isApiRequestUncertain(cause) && workIdRef.current) {
        setActionPhase("reconciling");
        try {
          const reconciled = await detailQuery.refetch();
          const detail = reconciled.data;
          if (detail && generationLooksAccepted({
            status: detail.work.status,
            outputCount: detail.outputs.length,
            carouselSlideCount: detail.carouselSlides?.length ?? 0,
          })) {
            setError(null);
            setAnnouncement("Geração aceita; acompanhando o processamento");
            onGenerationAccepted?.();
          } else setError("A geração não foi confirmada. Tente gerar novamente.");
        } catch {
          setError("Não foi possível confirmar o estado da geração. Atualize e tente novamente.");
        }
      } else setError(cause instanceof Error ? cause.message : "Falha ao gerar");
    } finally {
      setActionPhase("idle");
    }
  }, [
    captureSnapshot,
    detailQuery,
    generateMutation,
    preparedPlanInputRef,
    recordStudioEvent,
    setActionPhase,
    setAnnouncement,
    setBrandConflict,
    setBrandTrainingSuggestion,
    setError,
    studioSessionId,
    workIdRef,
    workflowVariant,
    onGenerationAccepted,
  ]);

  const preparePlan = useCallback(async () => {
    return await runGuardedSubmit(submitGuardRef, submissionBlocked(), async () => {
      const plan = await preparePlanCommand();
      if (plan) setPreparedPlanCycle((cycle) => cycle + 1);
      return plan;
    }) ?? null;
  }, [preparePlanCommand, setPreparedPlanCycle, submissionBlocked, submitGuardRef]);

  const confirmGeneration = useCallback(async (preparedRevision?: string) => {
    await runGuardedSubmit(submitGuardRef, submissionBlocked(), () => confirmGenerationCommand(preparedRevision));
  }, [confirmGenerationCommand, submissionBlocked, submitGuardRef]);

  const generateLegacy = useCallback(async () => {
    await runGuardedSubmit(submitGuardRef, submissionBlocked(), async () => {
      const plan = await preparePlanCommand();
      if (!plan) return;
      await confirmGenerationCommand(plan.preparedRevision);
    });
  }, [confirmGenerationCommand, preparePlanCommand, submissionBlocked, submitGuardRef]);

  return { preparePlan, confirmGeneration, generateLegacy };
}
