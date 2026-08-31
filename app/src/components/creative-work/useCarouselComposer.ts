"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
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
import {
  carouselLayoutFamilyForRole,
  validateCarouselDeckStructure,
  type CarouselDraftStateV1,
  type CarouselSlidePlanV1,
} from "@/server/creative-work/carousel-contracts";

export type CarouselComposerPhase =
  | "questions"
  | "entry"
  | "sequence"
  | "ready_to_generate"
  | "generating"
  | "review";

export type CarouselEditableField = "role" | "purpose" | "primaryText" | "secondaryText";

export type CarouselSlideRevisionInput =
  | { kind: "copy"; primaryText: string; secondaryText: string | null }
  | { kind: "visual"; instruction: string };

export type CarouselComposerInput = {
  workId: string;
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

  // The only React state: which slide is open, whether a generation
  // confirmation is in flight, and which works already fired their one-shot
  // canonical events. Everything else is derived from persisted data.
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [generationPending, setGenerationPending] = useState(false);
  const [approvedRecordedFor, setApprovedRecordedFor] = useState<string | null>(null);
  const reviewRecordedRef = useRef<string | null>(null);
  const reviseInFlightRef = useRef(false);

  const detail = detailQuery.data ?? null;
  const work = detail?.work ?? null;
  const draft = work?.settings.carouselDraft ?? null;
  const slides = useMemo(
    () => [...(detail?.carouselSlides ?? [])].sort((left, right) => left.position - right.position),
    [detail?.carouselSlides],
  );
  const quality = work?.carouselQuality ?? null;
  const preparedRevision = preparedPlan?.preparedRevision ?? null;
  const questions = draft?.blockingQuestions ?? [];
  const findings = draft?.plan ? validateCarouselDeckStructure(draft.plan) : [];

  const phase: CarouselComposerPhase = questions.length > 0
    ? "questions"
    : !draft?.plan
      ? "entry"
      : !preparedRevision
        ? "sequence"
        : slides.length === 0
          ? "ready_to_generate"
          : slides.some((slide) => slide.status === "queued" || slide.status === "processing")
            ? "generating"
            : "review";

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) ?? slides[0] ?? null,
    [selectedSlideId, slides],
  );

  const isBusy =
    planMutation.isPending
    || reviseSlideMutation.isPending
    || approveMutation.isPending
    || exportMutation.isPending
    || draftSaveMutation.isPending
    || generationPending;

  const deckRevision = draft?.plan?.revision ?? slides[0]?.deckRevision ?? null;
  const approvedRevision = work?.carouselApprovedRevision ?? null;

  const canPrepare = phase === "sequence" && findings.length === 0 && !isBusy;
  const canGenerate = phase === "ready_to_generate" && !isBusy;
  const canApprove =
    phase === "review"
    && slides.length > 0
    && slides.every((slide) => slide.status === "completed")
    && !isBusy
    && approvedRevision !== deckRevision;

  const canEditDraft = Boolean(draft?.plan) && !preparedRevision && !isBusy;

  const selectSlide = useCallback((slideId: string) => {
    setSelectedSlideId(slideId);
  }, []);

  const postPlan = useCallback(async (answers: Record<string, string>) => {
    if (!workId || planMutation.isPending) return;
    try {
      // Flush the generic draft first: the plan command CAS-checks
      // `work.updatedAt`, so a pending generic autosave must land before the
      // editorial planner reads the work.
      const reconciled = await detailQuery.refetch();
      const current = reconciled.data?.work;
      if (!current) return;
      await planMutation.mutateAsync({
        workItemId: workId,
        expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
        answers,
      });
    } catch {
      // Cache invalidation already reconciled; the wizard re-derives.
    }
  }, [detailQuery, planMutation, workId]);

  const askForPlan = useCallback(
    (answers: Record<string, string> = {}) => postPlan(answers),
    [postPlan],
  );

  const answerQuestions = useCallback(
    (answers: Record<string, string>) => postPlan(answers),
    [postPlan],
  );

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
    slides,
    quality,
    selectedSlideId,
    selectedSlide,
    phase,
    findings,
    /** Approved deck revision from the work DTO — hosts pass it to the review/export gate. */
    approvedRevision,
    canPrepare,
    canGenerate,
    canApprove,
    isBusy,
    askForPlan,
    answerQuestions,
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
