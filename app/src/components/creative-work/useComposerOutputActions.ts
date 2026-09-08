"use client";

import { useCallback, type MutableRefObject, type RefObject } from "react";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { classifyLayerizeRequestFailure, revisionAttemptKey } from "./composer-outputs";

type RevisionAttempt = { revisionKey: string; revisionAssetId: string | null };

export function useComposerOutputActions(input: {
  workIdRef: RefObject<string | null>;
  revisionAttemptsRef: MutableRefObject<Map<string, RevisionAttempt>>;
  retryOutputMutation: { mutateAsync: (vars: { workItemId: string; outputId: string }) => Promise<unknown> };
  layerizeOutputMutation: {
    mutateAsync: (vars: {
      workItemId: string;
      outputId: string;
      operationId: string;
      retry?: boolean;
    }) => Promise<unknown>;
  };
  selectOutputMutation: {
    mutateAsync: (vars: {
      workItemId: string;
      outputId: string;
      saveToLibrary: boolean;
      confirmObjective: boolean;
      saveAsRecipe?: boolean;
    }) => Promise<unknown>;
  };
  reviseOutputMutation: {
    mutateAsync: (vars: {
      workItemId: string;
      outputId: string;
      instruction: string;
      revisionKey: string;
      revisionAssetId: string | null;
    }) => Promise<unknown>;
  };
  toolKind: string | undefined;
  tResults: (key: string) => string;
  setError: (value: string | null) => void;
  setAnnouncement: (value: string) => void;
  setApprovalErrorOutputId: (value: string | null) => void;
  recordCanonicalEvent: (
    name: string,
    workId: string,
    payload?: Record<string, string | number | boolean>,
  ) => void;
  recordStudioEvent: (name: string, payload?: Record<string, string | number | boolean>) => void;
}) {
  const {
    workIdRef,
    revisionAttemptsRef,
    retryOutputMutation,
    layerizeOutputMutation,
    selectOutputMutation,
    reviseOutputMutation,
    toolKind,
    tResults,
    setError,
    setAnnouncement,
    setApprovalErrorOutputId,
    recordCanonicalEvent,
    recordStudioEvent,
  } = input;

  const retryOutput = useCallback(async (outputId: string) => {
    if (!workIdRef.current) return;
    try {
      await retryOutputMutation.mutateAsync({ workItemId: workIdRef.current, outputId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao repetir proposta");
    }
  }, [retryOutputMutation, setError, workIdRef]);

  const layerizeOutput = useCallback(async (
    outputId: string,
    retry = false,
    operationId = crypto.randomUUID(),
  ): Promise<"accepted" | "terminal" | "uncertain"> => {
    if (!workIdRef.current) return "terminal";
    try {
      await layerizeOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        operationId,
        ...(retry ? { retry: true } : {}),
      });
      setAnnouncement(retry ? tResults("layerizeRestarted") : tResults("layerizeStarted"));
      return "accepted";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tResults("layerizeRequestFailed"));
      return classifyLayerizeRequestFailure(cause);
    }
  }, [layerizeOutputMutation, setAnnouncement, setError, tResults, workIdRef]);

  const approveOutput = useCallback(async (outputId: string, confirmObjective = false, saveAsRecipe = false) => {
    if (!workIdRef.current) return;
    setApprovalErrorOutputId(null);
    try {
      await selectOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        saveToLibrary: false,
        confirmObjective,
        saveAsRecipe,
      });
      setAnnouncement(saveAsRecipe ? tResults("savedAsRecipe") : "Proposta aprovada");
      recordCanonicalEvent("creative_work_approved", workIdRef.current, {
        protocol: toolKind === "social_post" ? "variations" : toolKind ?? "variations",
      });
    } catch (cause) {
      setApprovalErrorOutputId(outputId);
      setError(cause instanceof Error ? cause.message : "Falha ao aprovar proposta");
    }
  }, [
    recordCanonicalEvent,
    selectOutputMutation,
    setAnnouncement,
    setApprovalErrorOutputId,
    setError,
    tResults,
    workIdRef,
  ]);

  const reviseOutput = useCallback(async (outputId: string, instruction: string, attachment: File | null) => {
    if (!workIdRef.current || !instruction.trim()) return;
    const attemptKey = revisionAttemptKey({
      outputId,
      instruction,
      attachmentName: attachment?.name,
      attachmentSize: attachment?.size,
    });
    try {
      let attempt = revisionAttemptsRef.current.get(attemptKey);
      if (!attempt) {
        const uploaded = attachment ? await uploadChatAttachment(attachment) : null;
        attempt = { revisionKey: crypto.randomUUID(), revisionAssetId: uploaded?.assetId ?? null };
        revisionAttemptsRef.current.set(attemptKey, attempt);
      }
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        instruction: instruction.trim(),
        ...attempt,
      });
      revisionAttemptsRef.current.delete(attemptKey);
      setAnnouncement("Nova versão em geração");
      recordStudioEvent("studio_refinement_started", { creativeWorkId: workIdRef.current });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar nova versão");
    }
  }, [
    recordStudioEvent,
    reviseOutputMutation,
    revisionAttemptsRef,
    setAnnouncement,
    setError,
    workIdRef,
  ]);

  const retryRevisionOutput = useCallback(async (output: CreativeWorkOutput) => {
    if (!workIdRef.current || !output.parentOutputId || !output.revisionInstruction) return;
    try {
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId: output.parentOutputId,
        revisionKey: crypto.randomUUID(),
        instruction: output.revisionInstruction,
        revisionAssetId: output.revisionAssetId,
      });
      setAnnouncement("Nova tentativa em geração");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao tentar nova versão");
    }
  }, [reviseOutputMutation, setAnnouncement, setError, workIdRef]);

  return { retryOutput, layerizeOutput, approveOutput, reviseOutput, retryRevisionOutput };
}
