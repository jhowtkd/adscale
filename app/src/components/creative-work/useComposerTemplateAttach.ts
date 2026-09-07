"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
import type { StudioRolloutVariant } from "@/lib/beta-analytics/studio-session";
import { focusBrandSwitcher, type ComposerIntent } from "./composer-state";
import type { DraftSource } from "./composer-attach";

type SourceShape = { templateId?: string | null };

export function useComposerTemplateAttach({
  workflowVariant,
  objective,
  initialTemplateId,
  initialWorkId,
  failedInitialTemplateId,
  templateRetryToken,
  activeClientProfileId,
  isLoadingProfile,
  sources,
  hydratedWorkRef,
  workIdRef,
  autoTemplateRef,
  mountedRef,
  attachDraftSource,
  consumeInitialTemplateParams,
  setFailedInitialTemplateId,
  setAnnouncement,
  setError,
  setTemplateRetryToken,
}: {
  workflowVariant: StudioRolloutVariant;
  objective: ComposerIntent | null;
  initialTemplateId?: string;
  initialWorkId?: string;
  failedInitialTemplateId: string | null;
  templateRetryToken: number;
  activeClientProfileId: string | null;
  isLoadingProfile: boolean;
  sources: readonly SourceShape[] | undefined;
  hydratedWorkRef: MutableRefObject<string | null>;
  workIdRef: MutableRefObject<string | null>;
  autoTemplateRef: MutableRefObject<string | null>;
  mountedRef: MutableRefObject<boolean>;
  attachDraftSource: (source: DraftSource) => Promise<boolean>;
  consumeInitialTemplateParams: () => void;
  setFailedInitialTemplateId: (value: string | null) => void;
  setAnnouncement: (value: string) => void;
  setError: (value: string | null) => void;
  setTemplateRetryToken: (updater: (value: number) => number) => void;
}) {
  const retryInitialTemplate = useCallback(() => {
    if (!initialTemplateId) return;
    autoTemplateRef.current = null;
    setFailedInitialTemplateId(null);
    setError(null);
    setTemplateRetryToken((value) => value + 1);
  }, [autoTemplateRef, initialTemplateId, setError, setFailedInitialTemplateId, setTemplateRetryToken]);

  useEffect(() => {
    if (!initialTemplateId || autoTemplateRef.current === initialTemplateId) return;
    // A template without a protocol is entry context, not permission to
    // materialize a default draft. It attaches after the explicit objective.
    if (workflowVariant === "progressive" && !objective) return;
    if (isLoadingProfile) return;
    if (initialWorkId && !hydratedWorkRef.current) return;
    if (sources?.some((source) => source.templateId === initialTemplateId)) {
      autoTemplateRef.current = initialTemplateId;
      consumeInitialTemplateParams();
      return;
    }
    if (failedInitialTemplateId === initialTemplateId) return;
    if (!workIdRef.current && !activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }

    autoTemplateRef.current = initialTemplateId;
    void attachDraftSource({ templateId: initialTemplateId })
      .then((attached) => {
        if (!attached) {
          autoTemplateRef.current = null;
          if (mountedRef.current) setFailedInitialTemplateId(initialTemplateId);
          return;
        }
        consumeInitialTemplateParams();
        if (mountedRef.current) {
          setFailedInitialTemplateId(null);
          setAnnouncement("Inspiração adicionada");
        }
      })
      .catch((cause) => {
        autoTemplateRef.current = null;
        if (mountedRef.current) {
          setFailedInitialTemplateId(initialTemplateId);
          setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
        }
      });
  }, [
    activeClientProfileId,
    attachDraftSource,
    autoTemplateRef,
    consumeInitialTemplateParams,
    failedInitialTemplateId,
    hydratedWorkRef,
    initialTemplateId,
    initialWorkId,
    isLoadingProfile,
    mountedRef,
    objective,
    setAnnouncement,
    setError,
    setFailedInitialTemplateId,
    sources,
    templateRetryToken,
    workIdRef,
    workflowVariant,
  ]);

  return { retryInitialTemplate };
}
