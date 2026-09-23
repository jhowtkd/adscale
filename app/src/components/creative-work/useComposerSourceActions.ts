"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import pLimit from "p-limit";
import { collectImageFiles, uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import { apiFetch } from "@/lib/api-client";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import type { CreativeSourceUsage } from "@/lib/hooks/use-creative-work";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";
import type { PieceReferenceCategory } from "@/server/creative-work/piece-reference";
import {
  limitAttachedImages,
  usageForAttachedFile,
  usageForDraftSource,
  type ComposerSourceAction,
  type DraftSource,
} from "./composer-attach";
import { focusBrandSwitcher, isCreativeWorkConflict, type ComposerIntent } from "./composer-state";

type SourceShape = {
  assetId?: string | null;
  status?: string;
  templateId?: string | null;
  usage?: CreativeSourceUsage | null;
  usageConfirmed?: boolean;
};

export function useComposerSourceActions({
  workflowVariant,
  objectiveRef,
  intentRef,
  workIdRef,
  uploadInFlightRef,
  composerRef,
  sources,
  activeClientProfileId,
  tHome,
  announce,
  markPlanInputEdited,
  setBufferedFile,
  setIsUploading,
  setError,
  setAnnouncement,
  setInferredBriefingContext,
  ensureDraft,
  mutateSource,
  selectIntent,
  recordStudioEvent,
}: {
  workflowVariant: StudioRolloutVariant;
  objectiveRef: MutableRefObject<ComposerIntent | null>;
  intentRef: MutableRefObject<ComposerIntent>;
  workIdRef: MutableRefObject<string | null>;
  uploadInFlightRef: MutableRefObject<boolean>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  sources: SourceShape[] | undefined;
  activeClientProfileId: string | null;
  tHome: (key: string, values?: { name: string }) => string;
  announce: (message: string) => void;
  markPlanInputEdited: () => void;
  setBufferedFile: (file: File | null) => void;
  setIsUploading: (value: boolean) => void;
  setError: (value: string | null) => void;
  setAnnouncement: (value: string) => void;
  setInferredBriefingContext: (value: null) => void;
  ensureDraft: (source?: DraftSource, silent?: boolean) => Promise<string | null>;
  mutateSource: (action: ComposerSourceAction) => Promise<unknown>;
  selectIntent: (intent: ComposerIntent, immediate?: boolean) => Promise<boolean> | boolean;
  recordStudioEvent: (eventKey: string, properties?: Record<string, string | number | boolean>) => void;
}) {
  const addFiles = useCallback(async (
    files: FileList | File[] | null,
    preferredUsage?: CreativeSourceUsage,
  ) => {
    const images = collectImageFiles(files);
    if (images.length === 0) return false;
    if (workflowVariant === "progressive" && !objectiveRef.current) {
      setBufferedFile(images[0]!);
      announce(images.length > 1
        ? tHome("composer.progressiveMultipleFiles", { name: images[0]!.name })
        : tHome("composer.progressiveBufferedFile", { name: images[0]!.name }));
      return true;
    }
    const { accepted, rejectedByLimit } = limitAttachedImages({
      intent: intentRef.current,
      images,
      existingSourceCount: sources?.filter((source) => source.assetId).length ?? 0,
      existingNonFailedCount: sources?.filter((source) => source.status !== "failed").length ?? 0,
    });
    if (accepted.length === 0) {
      announce(`Limite de 3 atingido; ${rejectedByLimit} arquivo${rejectedByLimit === 1 ? "" : "s"} não enviado${rejectedByLimit === 1 ? "" : "s"}`);
      return false;
    }
    if (!workIdRef.current && !activeClientProfileId) {
      focusBrandSwitcher();
      return false;
    }
    if (uploadInFlightRef.current) return false;
    markPlanInputEdited();
    uploadInFlightRef.current = true;
    setIsUploading(true);
    setError(null);
    try {
      const uploadLimit = pLimit(3);
      const uploads = await Promise.allSettled(accepted.map((file) => uploadLimit(() => uploadChatAttachment(file))));
      let hasRestyleContent = Boolean(sources?.some((source) =>
        source.usageConfirmed && (source.usage === "content" || source.usage === "both")
      ));
      const failures: { file: File; cause: unknown }[] = [];
      let added = 0;
      for (const [index, upload] of uploads.entries()) {
        const file = accepted[index]!;
        if (upload.status === "rejected") {
          failures.push({ file, cause: upload.reason });
          continue;
        }
        try {
          const usage: CreativeSourceUsage = usageForAttachedFile({
            intent: intentRef.current,
            preferredUsage,
            hasRestyleContent,
          });
          const existingId = workIdRef.current;
          if (!existingId) {
            if (!await ensureDraft({ assetId: upload.value.assetId, usage })) {
              throw new Error("Falha ao salvar rascunho");
            }
          } else {
            await mutateSource({
              workItemId: existingId,
              action: "attachSource",
              assetId: upload.value.assetId,
              usage,
            });
          }
          if (usage === "content") hasRestyleContent = true;
          added++;
        } catch (cause) {
          failures.push({ file, cause });
        }
      }
      if (added > 0) {
        setInferredBriefingContext(null);
        const addedAnnouncement = added === 1 ? "Arte adicionada" : `${added} artes adicionadas`;
        announce(rejectedByLimit > 0 ? `${addedAnnouncement}; ${rejectedByLimit} arquivo${rejectedByLimit === 1 ? "" : "s"} não enviado${rejectedByLimit === 1 ? "" : "s"} pelo limite de 3` : addedAnnouncement);
      }
      if (failures.length > 0) {
        const message = failures.map(({ file, cause }) => `${file.name}: ${cause instanceof Error ? cause.message : "Falha ao adicionar arte"}`).join("; ");
        const firstCause = failures[0]!.cause;
        setError(accepted.length === 1
          ? firstCause instanceof Error ? firstCause.message : "Falha ao adicionar arte"
          : `${message}. Selecione novamente apenas os arquivos com falha.`);
      }
      return failures.length === 0;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar arte");
      return false;
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [
    activeClientProfileId,
    announce,
    ensureDraft,
    intentRef,
    markPlanInputEdited,
    mutateSource,
    objectiveRef,
    setBufferedFile,
    setError,
    setInferredBriefingContext,
    setIsUploading,
    sources,
    tHome,
    uploadInFlightRef,
    workIdRef,
    workflowVariant,
  ]);

  const attachDraftSource = useCallback(async (source: DraftSource): Promise<boolean> => {
    if (!workIdRef.current && !activeClientProfileId) {
      focusBrandSwitcher();
      return false;
    }
    const existingId = workIdRef.current;
    if (existingId) {
      markPlanInputEdited();
      await mutateSource({
        workItemId: existingId,
        action: "attachSource",
        ...source,
        usage: usageForDraftSource(intentRef.current, source.usage),
      });
      setInferredBriefingContext(null);
      return true;
    }
    return Boolean(await ensureDraft(source));
  }, [activeClientProfileId, ensureDraft, intentRef, markPlanInputEdited, mutateSource, setInferredBriefingContext, workIdRef]);

  const addInspiration = useCallback(async (inspiration: CreativeInspiration) => {
    if (!workIdRef.current && !activeClientProfileId) {
      focusBrandSwitcher();
      return false;
    }
    setError(null);
    if (!inspiration.templateId && !inspiration.assetId && !inspiration.curatedInspirationId) {
      setError("Inspiração indisponível");
      return false;
    }
    try {
      const destinationCommitted = await selectIntent(
        inspiration.suggestedIntent === "social_post" ? "variations" : inspiration.suggestedIntent,
        true,
      );
      if (!destinationCommitted) return false;

      let assetId = inspiration.assetId;
      if (inspiration.curatedInspirationId) {
        const response = await apiFetch(
          `/api/creative-work/inspirations/${inspiration.curatedInspirationId}`,
          { method: "POST", timeoutMs: 60_000 },
        );
        const payload = await response.json().catch(() => ({})) as { assetId?: string; error?: string };
        if (!response.ok || !payload.assetId) {
          throw new Error(payload.error ?? "Falha ao preparar inspiração");
        }
        assetId = payload.assetId;
      }
      const source: DraftSource = inspiration.templateId
        ? { templateId: inspiration.templateId, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" }
        : { assetId: assetId!, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" };
      if (!await attachDraftSource(source)) return false;
      setAnnouncement("Inspiração adicionada");
      requestAnimationFrame(() => {
        if (inspiration.suggestedIntent === "restyle") document.getElementById("creative-composer-original-source")?.focus();
        else composerRef.current?.focus();
      });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
      return false;
    }
  }, [activeClientProfileId, attachDraftSource, composerRef, selectIntent, setAnnouncement, setError, workIdRef]);

  const runSourceAction = useCallback(async (action: ComposerSourceAction): Promise<boolean> => {
    try {
      markPlanInputEdited();
      await mutateSource(action);
      setInferredBriefingContext(null);
      if (action.action === "updateSource") {
        recordStudioEvent("studio_source_role_selected", {
          creativeWorkId: action.workItemId,
          sourceRole: action.usage,
        });
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
      return false;
    }
  }, [markPlanInputEdited, mutateSource, recordStudioEvent, setError, setInferredBriefingContext]);

  const updateSource = useCallback((sourceId: string, usage: CreativeSourceUsage) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "updateSource", sourceId, usage });
  }, [runSourceAction, workIdRef]);
  const editSource = useCallback((sourceId: string, content: ContentBrief | null, style: StyleBrief | null) => {
    if (!workIdRef.current) return Promise.resolve(false);
    return runSourceAction({
      workItemId: workIdRef.current,
      action: "editSourceAnalysis",
      sourceId,
      content,
      style,
    });
  }, [runSourceAction, workIdRef]);
  const retrySource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    const workItemId = workIdRef.current;
    markPlanInputEdited();
    return mutateSource({ workItemId, action: "retrySource", sourceId })
      .then(() => {
        setInferredBriefingContext(null);
      })
      .catch(async (cause) => {
        if (isCreativeWorkConflict(cause)) {
          setInferredBriefingContext(null);
          setError(null);
          return;
        }
        setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
      });
  }, [markPlanInputEdited, mutateSource, setError, setInferredBriefingContext, workIdRef]);
  const removeSource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "removeSource", sourceId });
  }, [runSourceAction, workIdRef]);
  const updatePieceReference = useCallback((sourceId: string, patch: { category?: PieceReferenceCategory; userInstruction?: string | null }) => {
    if (!workIdRef.current) return Promise.resolve(false);
    return runSourceAction({ workItemId: workIdRef.current, action: "updatePieceReference", sourceId, ...patch });
  }, [runSourceAction, workIdRef]);
  const replacePieceReference = useCallback(async (sourceId: string, file: File) => {
    if (!workIdRef.current) return false;
    uploadInFlightRef.current = true;
    setIsUploading(true);
    try {
      const uploaded = await uploadChatAttachment(file);
      return await runSourceAction({ workItemId: workIdRef.current, action: "replacePieceReference", sourceId, assetId: uploaded.assetId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao substituir arte");
      return false;
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [runSourceAction, setError, setIsUploading, uploadInFlightRef, workIdRef]);
  const promotePieceReference = useCallback(async (sourceId: string) => {
    if (!workIdRef.current) return false;
    return runSourceAction({ workItemId: workIdRef.current, action: "promotePieceReference", sourceId });
  }, [runSourceAction, workIdRef]);

  return {
    addFiles,
    attachDraftSource,
    addInspiration,
    updateSource,
    editSource,
    retrySource,
    removeSource,
    updatePieceReference,
    replacePieceReference,
    promotePieceReference,
  };
}
