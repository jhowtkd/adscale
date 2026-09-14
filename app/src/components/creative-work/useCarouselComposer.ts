"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreativeWorkRequestError,
  creativeWorkKey,
  useApproveCarouselDeck,
  useAutosaveCreativeWork,
  useCreativeWork,
  useExportCarouselDeck,
  usePlanCarouselWork,
  useReviseCarouselSlide,
  type CreativeWorkDetail,
} from "@/lib/hooks/use-creative-work";
import type { PreparedPlanProjectionV1 } from "@/server/creative-work/prepared-plan";
import type { ComposerRevisionWriter } from "./composer-revision";
import { isCreativeWorkConflict } from "./composer-state";
import {
  carouselLayoutFamilyForRole,
  validateCarouselDeckStructure,
  type CarouselDraftStateV1,
  type CarouselSlidePlanV1,
} from "@/server/creative-work/carousel-contracts";
import type { CarouselEditorialCommand, CarouselEditorialState } from "@/server/creative-work/carousel-editorial-state";
import {
  CAROUSEL_COVER_QUOTE,
  deriveCarouselComposerPhase,
  isCurrentCoverApproval,
  quoteCarouselInteriorsLote,
  type CarouselComposerPhase,
} from "./carousel-composer-phase";

export type { CarouselComposerPhase };

export type CarouselEditableField = "role" | "purpose" | "primaryText" | "secondaryText";

export type CarouselSlideRevisionInput =
  | { kind: "copy"; primaryText: string; secondaryText: string | null }
  | { kind: "visual"; instruction: string };

export type CarouselComposerInput = {
  workId: string;
  workIdRef: RefObject<string | null>;
  draftEpochRef: RefObject<number>;
  flushAutosave: () => Promise<string | null>;
  resolveCanonicalWorkRevision: (workId: string) => Promise<string | null>;
  setCanonicalWorkRevision: ComposerRevisionWriter;
  blockStaleRevision: (workId: string) => void;
  setError: (error: string | null) => void;
  preparedPlan: PreparedPlanProjectionV1 | null;
  preparePlan: () => Promise<PreparedPlanProjectionV1 | null>;
  confirmGeneration: (preparedRevision?: string) => Promise<void>;
  recordCanonicalEvent: (
    event: "creative_work_reviewed" | "creative_work_approved",
    properties: { creativeWorkId: string; protocol: "carousel"; outputCount: number },
  ) => void;
};

const MIN_SLIDES = 5;
const MAX_SLIDES = 8;

function renumbered(slides: CarouselSlidePlanV1[]): CarouselSlidePlanV1[] {
  return slides.map((slide, index) => ({ ...slide, position: index + 1 }));
}

/**
 * Carousel-specific server state for the wizard (Task 9 components). All
 * wizard state except slide selection is derived from the persisted creative
 * work: `settings.carouselDraft`, the public slide projection and the deck
 * quality. Entry/confirmation/analytics stay with the generic progressive
 * controller through the injected `preparePlan` / `confirmGeneration` /
 * `recordCanonicalEvent` commands — no second session, cache or quote.
 */
export function useCarouselComposer({
  workId,
  workIdRef,
  draftEpochRef,
  flushAutosave,
  resolveCanonicalWorkRevision,
  setCanonicalWorkRevision,
  blockStaleRevision,
  setError,
  preparedPlan,
  preparePlan,
  confirmGeneration,
  recordCanonicalEvent,
}: CarouselComposerInput) {
  const queryClient = useQueryClient();
  const detailQuery = useCreativeWork(workId || null);
  const planMutation = usePlanCarouselWork();
  const reviseSlideMutation = useReviseCarouselSlide();
  const approveMutation = useApproveCarouselDeck();
  const exportMutation = useExportCarouselDeck();
  const draftSaveMutation = useAutosaveCreativeWork();

  // The only React state: which slide is open, whether a plan or generation
  // confirmation is in flight, and which works already fired their one-shot
  // canonical events. Everything else is derived from persisted data.
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [generationPending, setGenerationPending] = useState(false);
  const [planningPending, setPlanningPending] = useState(false);
  const [approvedRecordedFor, setApprovedRecordedFor] = useState<string | null>(null);
  const [editorialError, setEditorialError] = useState<string | null>(null);
  const reviewRecordedRef = useRef<string | null>(null);
  const reviseInFlightRef = useRef(false);
  const planInFlightRef = useRef(false);

  const detail = detailQuery.data ?? null;
  const work = detail?.work ?? null;
  const draft = work?.settings.carouselDraft ?? null;
  const editorial: CarouselEditorialState | null = work?.settings.carouselEditorial ?? null;
  const slides = useMemo(
    () => [...(detail?.carouselSlides ?? [])].sort((left, right) => left.position - right.position),
    [detail?.carouselSlides],
  );
  const quality = work?.carouselQuality ?? null;
  const preparedRevision = preparedPlan?.preparedRevision ?? null;
  const questions = draft?.blockingQuestions ?? [];
  const findings = draft?.plan ? validateCarouselDeckStructure(draft.plan) : [];
  const researching = planMutation.isPending && (editorial?.hooks.length !== 3);
  const scriptApproved = Boolean(
    editorial?.approvedScriptRevision
    && editorial.approvedScriptRevision === editorial.revision
    && draft?.plan,
  );

  const phase: CarouselComposerPhase = deriveCarouselComposerPhase({
    blockingQuestionCount: questions.length,
    hasPlan: Boolean(draft?.plan),
    preparedRevision,
    slides,
    hooks: editorial?.hooks ?? [],
    selectedHookId: editorial?.selectedHookId ?? null,
    researching,
    scriptApproved,
  });

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) ?? slides[0] ?? null,
    [selectedSlideId, slides],
  );

  const isBusy =
    planningPending
    || planMutation.isPending
    || reviseSlideMutation.isPending
    || approveMutation.isPending
    || exportMutation.isPending
    || draftSaveMutation.isPending
    || generationPending;

  const deckRevision = draft?.plan?.revision ?? slides[0]?.deckRevision ?? null;
  const approvedRevision = work?.carouselApprovedRevision ?? null;

  const coverSlide = slides.find((slide) => slide.position === 1) ?? null;
  const canPrepare = Boolean(draft?.plan)
    && (phase === "sequence" || phase === "ready_to_generate")
    && scriptApproved
    && findings.length === 0
    && !preparedRevision
    && !isBusy;
  const canGenerate = phase === "ready_to_generate" && !isBusy;
  const canApproveScript = phase === "sequence"
    && Boolean(draft?.plan && editorial)
    && !scriptApproved
    && findings.length === 0
    && !isBusy;
  const canApproveCover = phase === "cover_review"
    && Boolean(coverSlide && preparedRevision && editorial?.approvedScriptRevision)
    && coverSlide?.status === "completed"
    && !isBusy;
  const canApprove =
    phase === "review"
    && slides.length > 0
    && slides.every((slide) => slide.status === "completed")
    && !isBusy
    && approvedRevision !== deckRevision;

  const canEditDraft = Boolean(draft?.plan) && !preparedRevision && !isBusy && phase === "sequence";

  const selectSlide = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
  }, []);

  const postPlan = useCallback(async (
    answers: Record<string, string> = {},
    command?: CarouselEditorialCommand,
  ) => {
    if (planInFlightRef.current || planMutation.isPending) return null;
    planInFlightRef.current = true;
    setPlanningPending(true);
    setError(null);
    const epoch = draftEpochRef.current;
    let planningWorkId = workIdRef.current;
    const isCurrent = () => draftEpochRef.current === epoch
      && (planningWorkId === null || workIdRef.current === planningWorkId);
    try {
      const id = await flushAutosave();
      if (draftEpochRef.current !== epoch) return null;
      if (!id) {
        if (isCurrent()) {
          const message = "Não foi possível salvar o pedido. Tente organizar o conteúdo novamente.";
          setEditorialError(message);
          setError(message);
        }
        return null;
      }
      planningWorkId = id;
      if (!isCurrent()) return null;
      const expectedUpdatedAt = await resolveCanonicalWorkRevision(id);
      if (!isCurrent()) return null;
      if (!expectedUpdatedAt) {
        const message = "Não foi possível atualizar o rascunho. Tente organizar o conteúdo novamente.";
        setEditorialError(message);
        setError(message);
        return null;
      }
      setEditorialError(null);
      const result = await planMutation.mutateAsync({
        workItemId: id,
        expectedUpdatedAt,
        answers,
        ...(command ? { command } : {}),
      });
      if (isCurrent()) setCanonicalWorkRevision(id, result.work.updatedAt);
      return result;
    } catch (cause) {
      if (isCurrent() && planningWorkId && isCreativeWorkConflict(cause)) {
        blockStaleRevision(planningWorkId);
        try {
          const refreshed = await detailQuery.refetch();
          if (isCurrent() && refreshed.data?.work.id === planningWorkId) {
            setCanonicalWorkRevision(planningWorkId, refreshed.data.work.updatedAt);
          }
        } catch { /* The next explicit attempt must refresh the blocked revision. */ }
      }
      if (isCurrent()) {
        const message = cause instanceof CreativeWorkRequestError || cause instanceof Error
          ? cause.message
          : "Não foi possível organizar o conteúdo. Tente novamente.";
        setEditorialError(message);
        setError(message);
      }
      return null;
    } finally {
      planInFlightRef.current = false;
      setPlanningPending(false);
    }
  }, [blockStaleRevision, detailQuery, draftEpochRef, flushAutosave, planMutation, resolveCanonicalWorkRevision, setCanonicalWorkRevision, setError, workIdRef]);

  const askForPlan = useCallback(
    (answers: Record<string, string> = {}) => postPlan(answers),
    [postPlan],
  );

  const answerQuestions = useCallback(
    (answers: Record<string, string>) => postPlan(answers),
    [postPlan],
  );

  const selectHook = useCallback(async (hookId: string, headline?: string) => {
    await postPlan({}, {
      kind: "select_hook",
      hookId,
      ...(headline ? { headline } : {}),
    });
  }, [postPlan]);

  const regenerateHooks = useCallback(async () => {
    await postPlan({}, { kind: "propose_hooks" });
  }, [postPlan]);

  const scriptRevision = editorial?.revision;
  const approveScript = useCallback(async () => {
    if (!canApproveScript || !scriptRevision) return;
    await postPlan({}, { kind: "approve_script", scriptRevision });
  }, [canApproveScript, scriptRevision, postPlan]);

  const approveCoverAndGenerate = useCallback(async () => {
    if (!canApproveCover || generationPending || !workId || !coverSlide || !preparedRevision) return;
    const expectedPreparedRevision = preparedRevision;
    const expectedSlideId = coverSlide.id;
    setGenerationPending(true);
    try {
      const approved = await postPlan({}, {
        kind: "approve_cover",
        slideId: expectedSlideId,
        preparedRevision: expectedPreparedRevision,
      });
      if (
        !approved
        || !isCurrentCoverApproval({
          editorial: approved.editorial,
          slideId: expectedSlideId,
          preparedRevision: expectedPreparedRevision,
        })
      ) {
        return;
      }

      const prepared = await preparePlan();
      if (!prepared || prepared.preparedRevision !== expectedPreparedRevision) return;

      await confirmGeneration(prepared.preparedRevision);
    } finally {
      setGenerationPending(false);
    }
  }, [
    canApproveCover,
    confirmGeneration,
    coverSlide,
    generationPending,
    postPlan,
    preparePlan,
    preparedRevision,
    workId,
  ]);

  const persistDraft = useCallback(async (
    // Transforms receive the CURRENT cached draft, so sequential actions can
    // never clobber each other through a stale render closure.
    transform: (draft: CarouselDraftStateV1) => CarouselDraftStateV1 | null,
  ) => {
    if (!workId || !work) return;
    const current = queryClient.getQueryData<CreativeWorkDetail>(creativeWorkKey(workId))?.work.settings.carouselDraft;
    if (!current) return;
    const nextDraft = transform(current);
    if (!nextDraft) return;
    // Optimistic write into the same detail cache: every draft edit touches
    // ONLY settings.carouselDraft, keeping stable slide IDs everywhere else.
    queryClient.setQueryData<CreativeWorkDetail>(creativeWorkKey(workId), (currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            work: {
              ...currentDetail.work,
              settings: { ...currentDetail.work.settings, carouselDraft: nextDraft },
            },
          }
        : currentDetail,
    );
    try {
      await draftSaveMutation.mutateAsync({
        workItemId: workId,
        // Draft CAS: the persisted row revision guards the edit.
        expectedUpdatedAt: new Date(work.updatedAt).toISOString(),
        request: work.request,
        intent: work.toolKind,
        format: work.format,
        settings: { ...work.settings, carouselDraft: nextDraft },
      });
    } catch {
      await queryClient.invalidateQueries({ queryKey: creativeWorkKey(workId) });
    }
  }, [draftSaveMutation, queryClient, work, workId]);

  const editSlide = useCallback(async (slideId: string, field: CarouselEditableField, value: string) => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.plan) return null;
      const nextRole = field === "role" ? (value as CarouselSlidePlanV1["role"]) : null;
      const nextSlides = draft.plan.slides.map((slide) =>
        slide.slideId === slideId
          ? {
              ...slide,
              ...(nextRole
                ? { role: nextRole, layoutFamily: carouselLayoutFamilyForRole(nextRole) }
                : { [field]: value }),
              authority: "human_edit" as const,
            }
          : slide,
      );
      const nextChanges = draft.changes.map((change) =>
        change.status === "pending" && change.slideId === slideId && change.field === field
          ? { ...change, status: "superseded" as const }
          : change,
      );
      return { ...draft, plan: { ...draft.plan, slides: nextSlides }, changes: nextChanges };
    });
  }, [canEditDraft, persistDraft]);

  const acceptChange = useCallback(async (changeId: string) => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.plan) return null;
      const change = draft.changes.find((item) => item.id === changeId && item.status === "pending");
      if (!change) return null;
      const nextSlides = change.slideId
        ? draft.plan.slides.map((slide) =>
            slide.slideId === change.slideId
              ? {
                  ...slide,
                  ...(change.field === "role"
                    ? {
                        role: change.after as CarouselSlidePlanV1["role"],
                        layoutFamily: carouselLayoutFamilyForRole(change.after as CarouselSlidePlanV1["role"]),
                      }
                    : { [change.field]: change.after }),
                }
              : slide,
          )
        : draft.plan.slides;
      const nextChanges = draft.changes.map((item) =>
        item.id === changeId ? { ...item, status: "accepted" as const } : item,
      );
      return { ...draft, plan: { ...draft.plan, slides: nextSlides }, changes: nextChanges };
    });
  }, [canEditDraft, persistDraft]);

  const rejectChange = useCallback(async (changeId: string) => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.changes.some((item) => item.id === changeId && item.status === "pending")) return null;
      const nextChanges = draft.changes.map((item) =>
        item.id === changeId ? { ...item, status: "rejected" as const } : item,
      );
      return { ...draft, changes: nextChanges };
    });
  }, [canEditDraft, persistDraft]);

  const addSlide = useCallback(async () => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.plan || draft.plan.slides.length >= MAX_SLIDES) return null;
      const role: CarouselSlidePlanV1["role"] = "context";
      const slide: CarouselSlidePlanV1 = {
        slideId: crypto.randomUUID(),
        position: draft.plan.slides.length + 1,
        role,
        purpose: "Nova tela",
        primaryText: "Nova tela",
        secondaryText: null,
        authority: "user_input",
        sourceFactIds: [],
        layoutFamily: carouselLayoutFamilyForRole(role),
      };
      return { ...draft, plan: { ...draft.plan, slides: [...draft.plan.slides, slide] } };
    });
  }, [canEditDraft, persistDraft]);

  const removeSlide = useCallback(async (slideId: string) => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.plan || draft.plan.slides.length <= MIN_SLIDES) return null;
      return {
        ...draft,
        plan: {
          ...draft.plan,
          slides: renumbered(draft.plan.slides.filter((slide) => slide.slideId !== slideId)),
        },
        changes: draft.changes.filter((change) => change.slideId !== slideId),
      };
    });
  }, [canEditDraft, persistDraft]);

  const moveSlide = useCallback(async (slideId: string, toPosition: number) => {
    if (!canEditDraft) return;
    await persistDraft((draft) => {
      if (!draft.plan) return null;
      const currentIndex = draft.plan.slides.findIndex((slide) => slide.slideId === slideId);
      if (currentIndex < 0) return null;
      const targetIndex = Math.min(Math.max(toPosition - 1, 0), draft.plan.slides.length - 1);
      if (targetIndex === currentIndex) return null;
      const nextSlides = [...draft.plan.slides];
      const [moved] = nextSlides.splice(currentIndex, 1);
      nextSlides.splice(targetIndex, 0, moved!);
      return { ...draft, plan: { ...draft.plan, slides: renumbered(nextSlides) } };
    });
  }, [canEditDraft, persistDraft]);

  const prepareCarousel = useCallback(async () => {
    // The frozen-snapshot prepare belongs to the generic progressive command
    // (which also owns the autosave flush); generation is never implied.
    if (!canPrepare) return;
    await preparePlan();
  }, [canPrepare, preparePlan]);

  const generateCarousel = useCallback(async () => {
    if (!canGenerate || generationPending) return;
    setGenerationPending(true);
    try {
      // One explicit confirmation through the generic command; Enter/keydown
      // handlers in the wizard UI never reach this path, and an uncertain
      // response keeps the second click disabled until the command's own
      // detail reconciliation settles.
      await confirmGeneration(preparedRevision ?? undefined);
    } finally {
      setGenerationPending(false);
    }
  }, [canGenerate, confirmGeneration, generationPending, preparedRevision]);

  const reviseSlide = useCallback(async (slideId: string, input: CarouselSlideRevisionInput) => {
    if (!workId || isBusy || reviseInFlightRef.current) return;
    const slide = slides.find((item) => item.id === slideId);
    if (!slide || slide.status !== "completed") return;
    reviseInFlightRef.current = true;
    try {
      await reviseSlideMutation.mutateAsync({
        workItemId: workId,
        slideId,
        revisionKey: crypto.randomUUID(),
        expectedVersion: slide.versionNumber,
        ...input,
      });
    } catch {
      // The mutation invalidates the detail; server truth wins.
    } finally {
      reviseInFlightRef.current = false;
    }
  }, [isBusy, reviseSlideMutation, slides, workId]);

  const retrySlide = useCallback(async () => {
    if (!workId || isBusy || reviseInFlightRef.current) return;
    const slide = selectedSlide;
    // Only the selected failed CURRENT slide can retry, exactly once.
    if (!slide || slide.status !== "failed") return;
    reviseInFlightRef.current = true;
    try {
      await reviseSlideMutation.mutateAsync({
        workItemId: workId,
        slideId: slide.id,
        revisionKey: crypto.randomUUID(),
        expectedVersion: slide.versionNumber,
        kind: "retry",
      });
    } catch {
      // Same reconciliation contract as reviseSlide.
    } finally {
      reviseInFlightRef.current = false;
    }
  }, [isBusy, reviseSlideMutation, selectedSlide, workId]);

  const approveDeck = useCallback(async () => {
    if (!workId || !canApprove || !deckRevision) return;
    try {
      const approved = await approveMutation.mutateAsync({ workItemId: workId, revision: deckRevision });
      queryClient.setQueryData<CreativeWorkDetail>(creativeWorkKey(workId), (current) =>
        current
          ? {
              ...current,
              work: {
                ...current.work,
                carouselApprovedRevision: approved.approvedRevision ?? deckRevision,
              },
            }
          : current,
      );
      if (approvedRecordedFor !== workId) {
        setApprovedRecordedFor(workId);
        recordCanonicalEvent("creative_work_approved", {
          creativeWorkId: workId,
          protocol: "carousel",
          outputCount: slides.length,
        });
      }
    } catch {
      // Reconciliation through the mutation invalidation.
    }
  }, [approveMutation, approvedRecordedFor, canApprove, deckRevision, queryClient, recordCanonicalEvent, slides.length, workId]);

  const downloadSlide = useCallback((slideId?: string) => {
    if (!workId) return;
    const slide = slideId ? slides.find((item) => item.id === slideId) : selectedSlide;
    if (!slide || slide.status !== "completed" || !slide.hasOutput) return;
    window.open(
      `/api/creative-work/${workId}/carousel/slides/${slide.id}/download`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [selectedSlide, slides, workId]);

  const exportDeck = useCallback(async () => {
    if (!workId || isBusy) return;
    // Successful approval is what enables the ordered ZIP export.
    if (!deckRevision || approvedRevision !== deckRevision) return;
    try {
      const blob = await exportMutation.mutateAsync({ workItemId: workId });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `carousel-${workId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // Reconciliation through the mutation invalidation.
    }
  }, [approvedRevision, deckRevision, exportMutation, isBusy, workId]);

  useEffect(() => {
    // The FIRST persisted review phase records creative_work_reviewed once.
    if (!workId || phase !== "review" || reviewRecordedRef.current === workId) return;
    reviewRecordedRef.current = workId;
    recordCanonicalEvent("creative_work_reviewed", {
      creativeWorkId: workId,
      protocol: "carousel",
      outputCount: slides.length,
    });
  }, [phase, recordCanonicalEvent, slides.length, workId]);

  return {
    draft,
    editorial,
    slides,
    quality,
    artRefinement: work?.artRefinementState ?? null,
    selectedSlideId,
    selectedSlide,
    phase,
    findings,
    editorialError,
    coverQuote: CAROUSEL_COVER_QUOTE,
    interiorsQuote: quoteCarouselInteriorsLote({
      slides,
      planSlideCount: draft?.plan?.slides.length ?? 0,
      preparedOutputCount: preparedPlan?.outputCount,
    }),
    /** Approved deck revision from the work DTO — hosts pass it to the review/export gate. */
    approvedRevision,
    canPrepare,
    canGenerate,
    canApprove,
    canApproveScript,
    canApproveCover,
    isBusy,
    askForPlan,
    answerQuestions,
    selectHook,
    regenerateHooks,
    approveScript,
    approveCoverAndGenerate,
    acceptChange,
    rejectChange,
    editSlide,
    addSlide,
    removeSlide,
    moveSlide,
    prepareCarousel,
    generateCarousel,
    reviseSlide,
    retrySlide,
    approveDeck,
    downloadSlide,
    exportDeck,
    selectSlide,
  };
}

export type CarouselComposerController = ReturnType<typeof useCarouselComposer>;
